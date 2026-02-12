const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const analytics = require('./analytics');

const PORT = process.env.PORT || 8000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null; // null = allow all (dev mode)
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 30;

// Initialize analytics DB
analytics.init();

// ─── HTTP Server + REST API ──────────────────────────────────────────

function setCorsHeaders(res, req) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS) {
        if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 10000) { reject(new Error('Body too large')); req.destroy(); }
        });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

function handleHttpRequest(req, res) {
    setCorsHeaders(res, req);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === 'POST' && pathname === '/api/visit') {
        parseBody(req).then(body => {
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
            analytics.recordVisit({
                page: body.page || 'unknown',
                gameId: body.gameId || null,
                userId: body.userId || null,
                ip,
                userAgent: req.headers['user-agent'] || null,
                referrer: req.headers.referer || null,
            });
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/validate-words') {
        parseBody(req).then(async (body) => {
            const words = Array.isArray(body.words) ? body.words : [];
            const isValidPayload = words.length <= 20 && words.every(w => typeof w === 'string' && w.length > 0);
            if (!isValidPayload) {
                sendJson(res, 400, { error: 'Invalid words payload' });
                return;
            }

            try {
                const results = await validateMultipleWords(words);
                sendJson(res, 200, { results });
            } catch (err) {
                console.error('HTTP validate-words error:', err);
                const results = {};
                for (const word of words) {
                    results[word] = true; // Permissive fallback
                }
                sendJson(res, 200, { results });
            }
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
        sendJson(res, 200, analytics.getStats());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/games') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        sendJson(res, 200, analytics.getRecentGames(Math.min(limit, 100)));
        return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/games/')) {
        const gameId = pathname.slice('/api/games/'.length);
        if (!gameId) { sendJson(res, 400, { error: 'Missing gameId' }); return; }
        const detail = analytics.getGameDetail(gameId);
        if (!detail) { sendJson(res, 404, { error: 'Game not found' }); return; }
        sendJson(res, 200, detail);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/visits/daily') {
        const days = parseInt(url.searchParams.get('days')) || 30;
        sendJson(res, 200, analytics.getVisitsPerDay(Math.min(days, 365)));
        return;
    }

    // Serve static React build if available
    const buildDir = path.join(__dirname, '..', 'build');
    if (fs.existsSync(buildDir)) {
        const MIME_TYPES = {
            '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
            '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
        };
        let filePath = path.join(buildDir, pathname);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(buildDir, 'index.html');
        }
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        try {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
            return;
        } catch {
            // fall through to 404
        }
    }

    sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(handleHttpRequest);
const wss = new WebSocket.Server({ server });

// Track game rooms: Map<gameId, { players: Map<userId, WebSocket>, createdAt: number }>
const rooms = new Map();
// Reverse lookup: WeakMap<WebSocket, { gameId, userId, messageTimestamps: number[] }>
const wsMetadata = new WeakMap();
// Track connections per IP: Map<ip, number>
const connectionsPerIp = new Map();

// ─── FST Validation Setup ────────────────────────────────────────────

const FST_DIR = path.join(__dirname, 'fst-models');
const FST_FILES = [
    'noun.fst',
    'noun-guess.fst',
    'adj.fst',
    'adj-guess.fst',
    'adv.fst',
    'adv-guess.fst',
    'adverb-guesser.fst',
    'part.fst',
    'pronoun.fst',
    'verb-c3.fst',
    'verb-c4.fst',
    'verb-c11.fst',
    'verb-c12.fst',
    'verb-c62.fst',
    'verb-c-rest.fst',
    'verb-guess.fst',
];

// Long-lived flookup child processes: Map<fstName, { process, callbackQueue, alive }>
const fstProcesses = new Map();
let flookupAvailable = false;

function checkFlookup() {
    try {
        const result = require('child_process').spawnSync('which', ['flookup']);
        return result.status === 0;
    } catch {
        return false;
    }
}

function spawnFlookupProcess(fstName, attempt = 1) {
    const fstPath = path.join(FST_DIR, fstName);
    if (!fs.existsSync(fstPath)) return null;

    const maxAttempts = 3;
    const proc = spawn('flookup', [fstPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    const entry = {
        process: proc,
        callbackQueue: [],
        alive: true,
        fstName,
    };

    let buffer = '';

    proc.stdout.on('data', (data) => {
        buffer += data.toString();

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete last line in buffer

        for (const line of lines) {
            if (entry.callbackQueue.length > 0) {
                const cb = entry.callbackQueue[0];
                cb.lines.push(line);
                // flookup outputs one line per input word, then we see the next result
                // Each input produces exactly one output line: "word\tanalysis" or "word\t+?"
                cb.remaining--;
                if (cb.remaining <= 0) {
                    entry.callbackQueue.shift();
                    cb.resolve(cb.lines);
                }
            }
        }
    });

    proc.stderr.on('data', (data) => {
        // flookup prints some info to stderr on startup, ignore it
    });

    proc.on('close', (code) => {
        entry.alive = false;
        // Reject pending callbacks
        for (const cb of entry.callbackQueue) {
            cb.resolve(cb.lines); // Resolve with whatever we have
        }
        entry.callbackQueue.length = 0;

        // Respawn after delay
        if (attempt < maxAttempts) {
            console.log(`  flookup ${fstName} exited (code ${code}), respawning (attempt ${attempt + 1})...`);
            setTimeout(() => {
                const newEntry = spawnFlookupProcess(fstName, attempt + 1);
                if (newEntry) {
                    fstProcesses.set(fstName, newEntry);
                }
            }, 5000);
        } else {
            console.log(`  flookup ${fstName} exited after ${maxAttempts} attempts, giving up`);
            fstProcesses.delete(fstName);
        }
    });

    proc.on('error', (err) => {
        console.error(`  flookup ${fstName} error:`, err.message);
        entry.alive = false;
    });

    return entry;
}

function initFstProcesses() {
    if (!checkFlookup()) {
        console.log('WARNING: flookup not found. Install with: brew install foma');
        console.log('Server-side FST validation disabled (words will be accepted permissively).');
        return;
    }

    if (!fs.existsSync(FST_DIR)) {
        console.log(`WARNING: FST models directory not found: ${FST_DIR}`);
        console.log('Run: npm run setup  (to download FST models)');
        return;
    }

    const availableFsts = FST_FILES.filter(f => fs.existsSync(path.join(FST_DIR, f)));
    if (availableFsts.length === 0) {
        console.log('WARNING: No FST models found. Run: npm run setup');
        return;
    }

    flookupAvailable = true;
    console.log(`Initializing ${availableFsts.length} flookup processes...`);

    for (const fstName of availableFsts) {
        const entry = spawnFlookupProcess(fstName);
        if (entry) {
            fstProcesses.set(fstName, entry);
            console.log(`  Started: ${fstName}`);
        }
    }

    console.log(`FST validation ready (${fstProcesses.size} models loaded)`);
}

/**
 * Look up a single word against a single FST process.
 * Returns true if the FST recognizes the word (output is not "+?").
 */
function lookupWord(fstEntry, word) {
    return new Promise((resolve) => {
        if (!fstEntry.alive) {
            resolve(false);
            return;
        }

        const timeoutId = setTimeout(() => {
            // If we haven't heard back in 3s, assume failure
            resolve(false);
        }, 3000);

        fstEntry.callbackQueue.push({
            lines: [],
            remaining: 1,
            resolve: (lines) => {
                clearTimeout(timeoutId);
                // Check if any output line shows recognition (not "+?")
                const recognized = lines.some(line => {
                    const parts = line.split('\t');
                    return parts.length >= 2 && parts[1].trim() !== '+?';
                });
                resolve(recognized);
            },
        });

        fstEntry.process.stdin.write(word + '\n');
    });
}

/**
 * Validate a word against ALL FST models.
 * Returns true if ANY FST recognizes the word.
 */
async function validateWordWithFsts(word) {
    if (!flookupAvailable || fstProcesses.size === 0) {
        return true; // Permissive fallback
    }

    // Check all FSTs in parallel — return true as soon as any recognizes the word
    const entries = Array.from(fstProcesses.values()).filter(e => e.alive);
    if (entries.length === 0) return true; // Permissive fallback

    // Use Promise.any-like behavior: resolve true on first recognition
    return new Promise((resolve) => {
        let pending = entries.length;
        let found = false;

        for (const entry of entries) {
            lookupWord(entry, word).then((recognized) => {
                if (recognized && !found) {
                    found = true;
                    resolve(true);
                    return;
                }
                pending--;
                if (pending === 0 && !found) {
                    resolve(false);
                }
            });
        }
    });
}

/**
 * Validate multiple words. Returns { results: { word: boolean } }
 */
async function validateMultipleWords(words) {
    const results = {};
    await Promise.all(
        words.map(async (word) => {
            results[word] = await validateWordWithFsts(word);
        })
    );
    return results;
}

// Initialize FST processes at startup
initFstProcesses();

// ─── Room Helpers ─────────────────────────────────────────────────────

function getOrCreateRoom(gameId) {
    if (!rooms.has(gameId)) {
        rooms.set(gameId, { players: new Map(), createdAt: Date.now() });
    }
    return rooms.get(gameId);
}

function cleanupEmptyRoom(gameId) {
    setTimeout(() => {
        const room = rooms.get(gameId);
        if (room && room.players.size === 0) {
            rooms.delete(gameId);
            console.log(`Room ${gameId} cleaned up (empty)`);
        }
    }, 5 * 60 * 1000); // 5 minute delay
}

function sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcastToRoom(gameId, senderId, message) {
    const room = rooms.get(gameId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const [playerId, playerWs] of room.players) {
        if (playerId !== senderId && playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(messageStr);
            sentCount++;
            console.log(`  -> Sent to ${playerId}`);
        }
    }
    console.log(`[${gameId}] Broadcast complete: sent to ${sentCount} clients`);
}

function sendToAllInRoom(gameId, message) {
    const room = rooms.get(gameId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    for (const [, playerWs] of room.players) {
        if (playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(messageStr);
        }
    }
}

// ─── WebSocket Server ────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (HTTP + WebSocket)`);
});

wss.on('connection', (ws, req) => {
    // ─── Origin validation ───────────────────────────────────────────
    if (ALLOWED_ORIGINS) {
        const origin = req.headers.origin;
        if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
            console.log(`Rejected connection: origin ${origin} not allowed`);
            ws.close(4003, 'Origin not allowed');
            return;
        }
    }

    // ─── Connection limit per IP ─────────────────────────────────────
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const currentConnections = connectionsPerIp.get(ip) || 0;
    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
        console.log(`Rejected connection: too many connections from IP ${ip}`);
        ws.close(4002, 'Too many connections from this IP');
        return;
    }
    connectionsPerIp.set(ip, currentConnections + 1);

    // Parse URL as /{gameId}/{userId}
    const urlParts = req.url.slice(1).split('/');
    if (urlParts.length < 2 || !urlParts[0] || !urlParts[1]) {
        console.log(`Rejected connection: malformed URL ${req.url}`);
        connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 1) - 1);
        ws.close(4000, 'Malformed URL: expected /{gameId}/{userId}');
        return;
    }

    const gameId = urlParts[0];
    const userId = urlParts[1];

    console.log(`Client connected: ${userId} to room ${gameId} (IP: ${ip})`);

    const room = getOrCreateRoom(gameId);

    // Limit 2 players per room
    if (!room.players.has(userId) && room.players.size >= 2) {
        console.log(`Room ${gameId} is full, rejecting ${userId}`);
        connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 1) - 1);
        ws.close(4001, 'Room is full (max 2 players)');
        return;
    }

    // Store metadata for reverse lookup on disconnect
    wsMetadata.set(ws, { gameId, userId, ip, messageTimestamps: [] });

    // Check if this is a reconnection (user already in room)
    const isReconnection = room.players.has(userId);

    // Store/update the connection
    room.players.set(userId, ws);

    // Get list of other players
    const otherPlayerIds = Array.from(room.players.keys()).filter(id => id !== userId);

    if (isReconnection) {
        console.log(`Client reconnected: ${userId} in room ${gameId}`);
        if (otherPlayerIds.length > 0) {
            ws.send(JSON.stringify({
                messageType: 'roomState',
                playerIds: otherPlayerIds,
            }));
        }
    } else {
        // Track player2 joining an active game
        if (analytics.getActiveGameRowId(gameId)) {
            analytics.setPlayer2(gameId, userId);
        }

        if (otherPlayerIds.length > 0) {
            // Notify existing players about the new player
            broadcastToRoom(gameId, userId, {
                messageType: 'playerJoined',
                playerIds: [userId],
            });

            // Notify new player about existing players (they should wait for their turn)
            ws.send(JSON.stringify({
                messageType: 'joinedExistingGame',
                playerIds: otherPlayerIds,
            }));
        }
    }

    console.log(`[${gameId}] Players: ${Array.from(room.players.keys()).join(', ')}`);

    ws.on('message', (data) => {
        // ─── Message size limit ──────────────────────────────────────
        if (data.length > MAX_MESSAGE_SIZE) {
            console.log(`[${gameId}] Message too large from ${userId}: ${data.length} bytes`);
            return;
        }

        // ─── Rate limiting (sliding window) ──────────────────────────
        const meta = wsMetadata.get(ws);
        if (meta) {
            const now = Date.now();
            meta.messageTimestamps = meta.messageTimestamps.filter(t => t > now - RATE_LIMIT_WINDOW_MS);
            if (meta.messageTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
                console.log(`[${gameId}] Rate limited ${userId}`);
                return;
            }
            meta.messageTimestamps.push(now);
        }

        try {
            const message = JSON.parse(data.toString());
            console.log(`[${gameId}] Message from ${userId}: ${message.messageType}`);

            switch (message.messageType) {
                case 'turn':
                    if (!message.turnInfo || typeof message.turnInfo !== 'object') break;
                    broadcastToRoom(gameId, userId, message);
                    console.log(`Turn broadcast from ${userId}:`,
                        message.turnInfo?.turnScore, 'points');
                    // Analytics: record word turn
                    try {
                        const ti = message.turnInfo;
                        const wordsPlayed = Array.isArray(ti.turnFormedWords)
                            ? ti.turnFormedWords.map(tiles =>
                                Array.isArray(tiles) ? tiles.map(t => t.letter || '').join('') : ''
                            )
                            : [];
                        analytics.recordTurn(gameId, {
                            userId,
                            turnType: 'word',
                            score: ti.turnScore || 0,
                            wordsPlayed,
                            wordScores: ti.turnWordScores || null,
                            tilesPlaced: ti.turnTilesPlaced || 0,
                        });
                    } catch (e) { console.error('Analytics turn error:', e.message); }
                    break;

                case 'newGame': {
                    broadcastToRoom(gameId, userId, message);
                    console.log(`New game started by ${userId}, tiles:`, message.drawnTiles?.length);
                    // Analytics: start new game session
                    try {
                        analytics.startGame(gameId, userId);
                        // If other player already in room, set them as player2
                        const room = rooms.get(gameId);
                        if (room) {
                            for (const pid of room.players.keys()) {
                                if (pid !== userId) {
                                    analytics.setPlayer2(gameId, pid);
                                    break;
                                }
                            }
                        }
                    } catch (e) { console.error('Analytics newGame error:', e.message); }
                    break;
                }

                case 'drewTiles':
                    broadcastToRoom(gameId, userId, message);
                    console.log(`${userId} drew ${message.drawnTiles?.length} tiles`);
                    break;

                case 'swapTiles':
                    broadcastToRoom(gameId, userId, message);
                    console.log(`${userId} swapped tiles`);
                    try {
                        analytics.recordTurn(gameId, {
                            userId,
                            turnType: 'swap',
                            score: 0,
                            wordsPlayed: null,
                            wordScores: null,
                            tilesPlaced: 0,
                        });
                    } catch (e) { console.error('Analytics swap error:', e.message); }
                    break;

                case 'passTurn':
                    broadcastToRoom(gameId, userId, message);
                    console.log(`${userId} passed their turn`);
                    try {
                        analytics.recordTurn(gameId, {
                            userId,
                            turnType: 'pass',
                            score: 0,
                            wordsPlayed: null,
                            wordScores: null,
                            tilesPlaced: 0,
                        });
                    } catch (e) { console.error('Analytics pass error:', e.message); }
                    break;

                case 'gameOver':
                    broadcastToRoom(gameId, userId, message);
                    console.log(`Game over: ${message.reason}, winner: ${message.winner}`);
                    try {
                        let winnerId = message.winner;
                        // Resolve 'opponent' to the actual other player's userId
                        if (winnerId === 'opponent') {
                            const room = rooms.get(gameId);
                            if (room) {
                                for (const pid of room.players.keys()) {
                                    if (pid !== userId) { winnerId = pid; break; }
                                }
                            }
                        } else if (winnerId === 'me') {
                            winnerId = userId;
                        }
                        analytics.endGame(gameId, {
                            winnerId: winnerId || null,
                            reason: message.reason || null,
                        });
                    } catch (e) { console.error('Analytics gameOver error:', e.message); }
                    break;

                case 'chat': {
                    // Input validation: text must be a string <= 500 chars
                    if (typeof message.text !== 'string' || message.text.length > 500) break;
                    sendToAllInRoom(gameId, {
                        messageType: 'chat',
                        userId: userId,
                        text: message.text,
                        timestamp: Date.now(),
                    });
                    break;
                }

                case 'validateWords':
                    if (!Array.isArray(message.words) || message.words.length > 20) break;
                    handleValidateWords(ws, userId, message);
                    break;

                default:
                    console.log(`Unknown message type: ${message.messageType}`);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });

    ws.on('close', () => {
        const meta = wsMetadata.get(ws);
        if (!meta) return;

        // Decrement IP connection counter
        if (meta.ip) {
            const count = connectionsPerIp.get(meta.ip) || 1;
            if (count <= 1) {
                connectionsPerIp.delete(meta.ip);
            } else {
                connectionsPerIp.set(meta.ip, count - 1);
            }
        }

        console.log(`Client disconnected: ${meta.userId} from room ${meta.gameId}`);

        const room = rooms.get(meta.gameId);
        if (room) {
            // Only remove if this is the current connection for this user
            if (room.players.get(meta.userId) === ws) {
                room.players.delete(meta.userId);

                // Notify remaining players
                broadcastToRoom(meta.gameId, meta.userId, {
                    messageType: 'playerLeft',
                    userId: meta.userId,
                });

                // Schedule cleanup if room is empty
                if (room.players.size === 0) {
                    cleanupEmptyRoom(meta.gameId);
                }
            } else {
                console.log(`  (old connection, ignoring)`);
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`WebSocket error for ${userId}:`, err);
    });
});

async function handleValidateWords(ws, userId, message) {
    const { requestId, words } = message;
    console.log(`Validate request from ${userId}: [${words?.join(', ')}] (req: ${requestId})`);

    if (!words || !Array.isArray(words) || words.length === 0) {
        sendToClient(ws, {
            messageType: 'validateWordsResult',
            requestId,
            results: {},
        });
        return;
    }

    try {
        const results = await validateMultipleWords(words);
        console.log(`Validation results for ${userId}:`, results);

        sendToClient(ws, {
            messageType: 'validateWordsResult',
            requestId,
            results,
        });
    } catch (err) {
        console.error(`Validation error for ${userId}:`, err);
        const results = {};
        for (const word of words) {
            results[word] = true;
        }
        sendToClient(ws, {
            messageType: 'validateWordsResult',
            requestId,
            results,
        });
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');

    // Kill all flookup processes
    for (const [name, entry] of fstProcesses) {
        if (entry.alive && entry.process) {
            entry.process.kill();
            console.log(`  Killed flookup: ${name}`);
        }
    }
    fstProcesses.clear();

    analytics.close();

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
