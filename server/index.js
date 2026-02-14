const path = require('path');
const fs = require('fs');

function loadLocalEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
        process.env[key] = value;
    }
}

loadLocalEnvFile();
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const analytics = require('./analytics');
const geo = require('./geo');

const PORT = process.env.PORT || 8000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null; // null = allow all (dev mode)
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 30;
const MATCH_ASSIGNMENT_TTL_MS = 10 * 60 * 1000;
const MATCHMAKING_QUEUE_TTL_MS = 2 * 60 * 1000;
const STRICT_SERVER_VALIDATION = String(process.env.STRICT_SERVER_VALIDATION || '').toLowerCase() === 'true';
const ENABLE_GUESS_FSTS = String(process.env.ENABLE_GUESS_FSTS || '').toLowerCase() === 'true';
const ANALYTICS_ADMIN_PASSWORD = process.env.ANALYTICS_ADMIN_PASSWORD || '';
const ANALYTICS_STORE_RAW_IP = String(process.env.ANALYTICS_STORE_RAW_IP || 'true').toLowerCase() !== 'false';

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function getClientIp(req) {
    const forwardedRaw = req.headers['x-forwarded-for'];
    const forwarded = typeof forwardedRaw === 'string'
        ? forwardedRaw.split(',')[0].trim()
        : null;
    return geo.normalizeIp(forwarded || req.socket.remoteAddress);
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

function sanitizeUsername(username) {
    if (typeof username !== 'string') return null;
    const trimmed = username.trim().slice(0, 24);
    if (!trimmed) return null;
    return trimmed;
}

function normalizeSoloGameId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 64) : null;
}

function secureEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function getAdminPasswordFromRequest(req) {
    const headerPassword = req.headers['x-admin-password'];
    if (typeof headerPassword === 'string' && headerPassword.trim()) {
        return headerPassword.trim();
    }
    return '';
}

function requireAnalyticsAdmin(req, res) {
    if (!ANALYTICS_ADMIN_PASSWORD) {
        sendJson(res, 503, { error: 'Analytics admin password is not configured on server' });
        return false;
    }
    const provided = getAdminPasswordFromRequest(req);
    if (!secureEqual(provided, ANALYTICS_ADMIN_PASSWORD)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return false;
    }
    return true;
}

function generateGameId() {
    let candidate = '';
    do {
        candidate = Math.random().toString(36).slice(2, 8);
    } while (rooms.has(candidate));
    return candidate;
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
        parseBody(req).then(async body => {
            const ip = getClientIp(req);
            const resolvedGeo = await geo.resolveGeoForIp(ip);
            analytics.recordVisit({
                page: body.page || 'unknown',
                gameId: body.gameId || null,
                userId: body.userId || null,
                ip: ANALYTICS_STORE_RAW_IP ? ip : null,
                userAgent: req.headers['user-agent'] || null,
                referrer: req.headers.referer || null,
                geo: resolvedGeo,
            });
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/profile') {
        parseBody(req).then(async body => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            const username = sanitizeUsername(body.username);
            if (!userId || !username) {
                sendJson(res, 400, { error: 'Invalid profile payload' });
                return;
            }
            const usernameClaim = analytics.claimUniqueUsernameOrSuggest(userId, username);
            if (!usernameClaim.ok) {
                if (usernameClaim.reason === 'taken') {
                    sendJson(res, 409, {
                        error: 'Username is already taken',
                        suggestion: usernameClaim.suggestion || null,
                    });
                    return;
                }
                sendJson(res, 400, { error: 'Invalid profile payload' });
                return;
            }
            const ip = getClientIp(req);
            const resolvedGeo = await geo.resolveGeoForIp(ip);
            const ipHash = geo.hashIp(ip);
            const profile = analytics.upsertPlayerProfile({
                userId,
                username: usernameClaim.username,
                geo: resolvedGeo,
                ipHash,
            });
            sendJson(res, 200, { ok: true, profile });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/solo/start') {
        parseBody(req).then((body) => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            const username = sanitizeUsername(body.username);
            const gameId = normalizeSoloGameId(body.gameId);
            if (!userId || !username || !gameId) {
                sendJson(res, 400, { error: 'Invalid solo start payload' });
                return;
            }
            analytics.upsertPlayerProfile({ userId, username });
            analytics.ensureGameSession(gameId, userId, { gameType: 'singleplayer' });
            analytics.setPlayer2(gameId, 'computer-player');
            sendJson(res, 200, { ok: true, gameId });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/solo/turn') {
        parseBody(req).then((body) => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            const gameId = normalizeSoloGameId(body.gameId);
            const turnType = typeof body.turnType === 'string' ? body.turnType : null;
            if (!userId || !gameId || !turnType) {
                sendJson(res, 400, { error: 'Invalid solo turn payload' });
                return;
            }
            analytics.recordTurn(gameId, {
                userId,
                turnType,
                score: Number(body.score || 0),
                wordsPlayed: Array.isArray(body.wordsPlayed) ? body.wordsPlayed : null,
                wordScores: Array.isArray(body.wordScores) ? body.wordScores : null,
                tilesPlaced: Number(body.tilesPlaced || 0),
                placedTiles: Array.isArray(body.placedTiles) ? body.placedTiles : null,
                formedWords: Array.isArray(body.formedWords) ? body.formedWords : null,
            });
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/solo/end') {
        parseBody(req).then((body) => {
            const gameId = normalizeSoloGameId(body.gameId);
            let winnerId = typeof body.winnerId === 'string' ? body.winnerId : null;
            if (winnerId === 'opponent') winnerId = 'computer-player';
            if (winnerId === 'me') winnerId = typeof body.userId === 'string' ? body.userId : null;
            const reason = typeof body.reason === 'string' ? body.reason : null;
            if (!gameId) {
                sendJson(res, 400, { error: 'Invalid solo end payload' });
                return;
            }
            analytics.endGame(gameId, { winnerId, reason });
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/solo/snapshot') {
        parseBody(req).then((body) => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            const gameId = normalizeSoloGameId(body.gameId);
            const snapshot = body.snapshot;
            if (!userId || !gameId || !snapshot || typeof snapshot !== 'object') {
                sendJson(res, 400, { error: 'Invalid solo snapshot payload' });
                return;
            }
            const saved = analytics.saveGameStateSnapshot({
                gameId,
                userId,
                state: snapshot,
            });
            sendJson(res, 200, { ok: Boolean(saved) });
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
                    results[word] = !STRICT_SERVER_VALIDATION;
                }
                sendJson(res, 200, { results });
            }
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/leaderboard') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        sendJson(res, 200, analytics.getLeaderboard(Math.min(limit, 100)));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/games') {
        const userId = url.searchParams.get('userId');
        if (!userId) {
            sendJson(res, 400, { error: 'Missing userId' });
            return;
        }
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        sendJson(res, 200, analytics.getUserGames(userId, Math.min(limit, 100)));
        return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/games/')) {
        const userId = url.searchParams.get('userId');
        const gameId = pathname.slice('/api/games/'.length);
        if (!userId) {
            sendJson(res, 400, { error: 'Missing userId' });
            return;
        }
        if (!gameId) {
            sendJson(res, 400, { error: 'Missing gameId' });
            return;
        }
        const detail = analytics.getUserGameDetail(userId, gameId);
        if (!detail) {
            sendJson(res, 404, { error: 'Game not found' });
            return;
        }
        console.log('[api /api/games/:gameId] detail', {
            gameId,
            userId,
            turns: Array.isArray(detail.turns) ? detail.turns.length : 0,
            hasSnapshotForUser: Boolean(detail.snapshotForUser?.state),
            latestSnapshotUserId: detail.latestSnapshot?.userId || null,
            hasLatestSnapshot: Boolean(detail.latestSnapshot?.state),
        });
        sendJson(res, 200, detail);
        return;
    }

    if (pathname.startsWith('/api/admin/')) {
        if (!requireAnalyticsAdmin(req, res)) return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/summary') {
        sendJson(res, 200, analytics.getAdminSummary());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/games') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const q = url.searchParams.get('q') || '';
        sendJson(res, 200, analytics.getRecentGames(Math.min(limit, 100), Math.max(0, offset), q));
        return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/admin/games/')) {
        const gameId = pathname.slice('/api/admin/games/'.length);
        if (!gameId) { sendJson(res, 400, { error: 'Missing gameId' }); return; }
        const detail = analytics.getGameDetail(gameId);
        if (!detail) { sendJson(res, 404, { error: 'Game not found' }); return; }
        sendJson(res, 200, detail);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/players') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const q = url.searchParams.get('q') || '';
        sendJson(res, 200, analytics.getPlayers(Math.min(limit, 100), Math.max(0, offset), q));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/players/countries') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        sendJson(res, 200, analytics.getPlayersByCountry(Math.min(limit, 100)));
        return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/admin/players/')) {
        const userId = pathname.slice('/api/admin/players/'.length);
        if (!userId) { sendJson(res, 400, { error: 'Missing userId' }); return; }
        const detail = analytics.getPlayerDetail(userId);
        if (!detail) { sendJson(res, 404, { error: 'Player not found' }); return; }
        sendJson(res, 200, detail);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/visits/daily') {
        const days = parseInt(url.searchParams.get('days')) || 30;
        sendJson(res, 200, analytics.getVisitsPerDay(Math.min(days, 365)));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/visits/countries') {
        const days = parseInt(url.searchParams.get('days')) || 30;
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        sendJson(res, 200, analytics.getVisitsByCountry(Math.min(days, 365), Math.min(limit, 100)));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/matchmaking/join') {
        parseBody(req).then(body => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            const username = sanitizeUsername(body.username);
            if (!userId || !username) {
                sendJson(res, 400, { error: 'Invalid matchmaking payload' });
                return;
            }

            analytics.upsertPlayerProfile({ userId, username });

            const existingAssignment = getActiveAssignment(userId);
            if (existingAssignment) {
                sendJson(res, 200, { status: 'matched', ...existingAssignment });
                return;
            }

            pruneMatchmakingQueue();
            removeFromMatchmakingQueue(userId);
            const opponent = matchmakingQueue.shift();

            if (opponent && opponent.userId !== userId) {
                const gameId = generateGameId();
                const matchedAt = Date.now();
                const starterUserId = opponent.userId; // first queued player starts
                const opponentAssignment = {
                    gameId,
                    opponentUserId: userId,
                    starterUserId,
                    matchedAt,
                };
                const userAssignment = {
                    gameId,
                    opponentUserId: opponent.userId,
                    starterUserId,
                    matchedAt,
                };

                matchAssignments.set(opponent.userId, opponentAssignment);
                matchAssignments.set(userId, userAssignment);
                sendJson(res, 200, { status: 'matched', ...userAssignment });
                return;
            }

            matchmakingQueue.push({ userId, joinedAt: Date.now() });
            sendJson(res, 200, { status: 'waiting', position: getQueuePosition(userId) });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/matchmaking/status') {
        const userId = url.searchParams.get('userId');
        if (!userId) {
            sendJson(res, 400, { error: 'Missing userId' });
            return;
        }
        pruneMatchmakingQueue();
        const assignment = getActiveAssignment(userId);
        if (assignment) {
            sendJson(res, 200, { status: 'matched', ...assignment });
            return;
        }
        const position = getQueuePosition(userId);
        if (position) {
            sendJson(res, 200, { status: 'waiting', position });
            return;
        }
        sendJson(res, 200, { status: 'idle' });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/matchmaking/cancel') {
        parseBody(req).then(body => {
            const userId = typeof body.userId === 'string' ? body.userId : null;
            if (!userId) {
                sendJson(res, 400, { error: 'Invalid cancel payload' });
                return;
            }
            pruneMatchmakingQueue();
            removeFromMatchmakingQueue(userId);
            matchAssignments.delete(userId);
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Bad request' }));
        return;
    }

    // Lightweight health endpoint for deployment readiness checks
    if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
            ok: true,
            service: 'solmaalai',
            timestamp: Date.now(),
        });
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
// Random matchmaking queue and matched assignments.
const matchmakingQueue = [];
const matchAssignments = new Map();

function removeFromMatchmakingQueue(userId) {
    const idx = matchmakingQueue.findIndex(item => item.userId === userId);
    if (idx >= 0) matchmakingQueue.splice(idx, 1);
}

function pruneMatchmakingQueue(now = Date.now()) {
    for (let i = matchmakingQueue.length - 1; i >= 0; i -= 1) {
        if ((now - matchmakingQueue[i].joinedAt) > MATCHMAKING_QUEUE_TTL_MS) {
            matchmakingQueue.splice(i, 1);
        }
    }
}

function getQueuePosition(userId) {
    pruneMatchmakingQueue();
    const idx = matchmakingQueue.findIndex(item => item.userId === userId);
    return idx >= 0 ? (idx + 1) : null;
}

function getActiveAssignment(userId) {
    const assignment = matchAssignments.get(userId);
    if (!assignment) return null;
    if ((Date.now() - assignment.matchedAt) > MATCH_ASSIGNMENT_TTL_MS) {
        matchAssignments.delete(userId);
        return null;
    }
    return assignment;
}

function getPlayerInfo(userId, indexHint = 1) {
    return {
        userId,
        name: analytics.getDisplayName(userId) || `Player ${indexHint}`,
    };
}

function refreshPlayerGeo(userId, username, ip) {
    if (!userId || !username) return;
    geo.resolveGeoForIp(ip)
        .then((resolvedGeo) => {
            analytics.upsertPlayerProfile({
                userId,
                username,
                geo: resolvedGeo,
                ipHash: geo.hashIp(ip),
            });
        })
        .catch(() => {});
}

// ─── FST Validation Setup ────────────────────────────────────────────

const FST_DIR = path.join(__dirname, 'fst-models');
const CORE_FST_FILES = [
    'noun.fst',
    'adj.fst',
    'adv.fst',
    'part.fst',
    'pronoun.fst',
    'verb-c3.fst',
    'verb-c4.fst',
    'verb-c11.fst',
    'verb-c12.fst',
    'verb-c62.fst',
    'verb-c-rest.fst',
];

const GUESS_FST_FILES = [
    'noun-guess.fst',
    'adj-guess.fst',
    'adv-guess.fst',
    'adverb-guesser.fst',
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
    const selectedFstFiles = ENABLE_GUESS_FSTS
        ? [...CORE_FST_FILES, ...GUESS_FST_FILES]
        : CORE_FST_FILES;

    console.log(`FST guess models: ${ENABLE_GUESS_FSTS ? 'ENABLED' : 'DISABLED'}`);

    if (!checkFlookup()) {
        console.log('WARNING: flookup not found. Install with: brew install foma');
        if (STRICT_SERVER_VALIDATION) {
            console.log('STRICT_SERVER_VALIDATION=true: words not recognized by local dictionary will be rejected.');
        } else {
            console.log('Server-side FST validation disabled (words will be accepted permissively).');
        }
        return;
    }

    if (!fs.existsSync(FST_DIR)) {
        console.log(`WARNING: FST models directory not found: ${FST_DIR}`);
        console.log('Run: npm run setup  (to download FST models)');
        if (STRICT_SERVER_VALIDATION) {
            console.log('STRICT_SERVER_VALIDATION=true: words not recognized by local dictionary will be rejected.');
        }
        return;
    }

    const availableFsts = selectedFstFiles.filter(f => fs.existsSync(path.join(FST_DIR, f)));
    if (availableFsts.length === 0) {
        console.log('WARNING: No FST models found. Run: npm run setup');
        if (STRICT_SERVER_VALIDATION) {
            console.log('STRICT_SERVER_VALIDATION=true: words not recognized by local dictionary will be rejected.');
        }
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
        return !STRICT_SERVER_VALIDATION; // strict mode rejects on server-validation unavailability
    }

    // Check all FSTs in parallel — return true as soon as any recognizes the word
    const entries = Array.from(fstProcesses.values()).filter(e => e.alive);
    if (entries.length === 0) return !STRICT_SERVER_VALIDATION;

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
    const ip = getClientIp(req);
    const currentConnections = connectionsPerIp.get(ip) || 0;
    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
        console.log(`Rejected connection: too many connections from IP ${ip}`);
        ws.close(4002, 'Too many connections from this IP');
        return;
    }
    connectionsPerIp.set(ip, currentConnections + 1);

    // Parse URL as /{gameId}/{userId}
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const urlParts = reqUrl.pathname.slice(1).split('/');
    if (urlParts.length < 2 || !urlParts[0] || !urlParts[1]) {
        console.log(`Rejected connection: malformed URL ${req.url}`);
        connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 1) - 1);
        ws.close(4000, 'Malformed URL: expected /{gameId}/{userId}');
        return;
    }

    const gameId = urlParts[0];
    const userId = urlParts[1];
    const profileName = sanitizeUsername(reqUrl.searchParams.get('name'));
    const existingName = analytics.getDisplayName(userId);
    const effectiveProfileName = profileName || existingName;
    if (effectiveProfileName) {
        analytics.upsertPlayerProfile({ userId, username: effectiveProfileName });
        refreshPlayerGeo(userId, effectiveProfileName, ip);
    }
    const assignment = getActiveAssignment(userId);
    if (assignment && assignment.gameId === gameId) {
        matchAssignments.delete(userId);
    }

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
    const otherPlayers = otherPlayerIds.map((id, idx) => getPlayerInfo(id, idx + 2));

    if (isReconnection) {
        console.log(`Client reconnected: ${userId} in room ${gameId}`);
        if (otherPlayers.length > 0) {
            ws.send(JSON.stringify({
                messageType: 'roomState',
                playerIds: otherPlayerIds,
                players: otherPlayers,
            }));
        }
    } else {
        // Track player2 joining an active game
        if (analytics.getActiveGameRowId(gameId)) {
            analytics.setPlayer2(gameId, userId, {
                player2CountryCode: analytics.getPlayerLastCountryCode(userId),
            });
        }

        if (otherPlayerIds.length > 0) {
            // Notify existing players about the new player
            const joiningPlayer = getPlayerInfo(userId, 2);
            broadcastToRoom(gameId, userId, {
                messageType: 'playerJoined',
                playerIds: [userId],
                players: [joiningPlayer],
            });

            // Notify new player about existing players (they should wait for their turn)
            ws.send(JSON.stringify({
                messageType: 'joinedExistingGame',
                playerIds: otherPlayerIds,
                players: otherPlayers,
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
                            ? ti.turnFormedWords.map((tiles) =>
                                Array.isArray(tiles)
                                    ? tiles.map((t) => t?.tile?.letter || t?.letter || '').join('')
                                    : ''
                            )
                            : [];
                        const placedTiles = Array.isArray(ti.newlyPlayedTilesWithPositions)
                            ? ti.newlyPlayedTilesWithPositions
                                .map((p) => {
                                    if (!p || typeof p.row !== 'number' || typeof p.col !== 'number') return null;
                                    return {
                                        row: p.row,
                                        col: p.col,
                                        letter: p.tile?.letter || p.letter || '',
                                        points: Number(p.tile?.points || p.points || 0),
                                        key: p.tile?.key || p.key || null,
                                    };
                                })
                                .filter(Boolean)
                            : [];
                        const formedWords = Array.isArray(ti.turnFormedWords)
                            ? ti.turnFormedWords.map((wordTiles) => (
                                Array.isArray(wordTiles)
                                    ? wordTiles.map((tileInfo) => ({
                                        row: tileInfo?.row,
                                        col: tileInfo?.col,
                                        letter: tileInfo?.tile?.letter || tileInfo?.letter || '',
                                        alreadyPlayed: Boolean(tileInfo?.alreadyPlayed),
                                    }))
                                    : []
                            ))
                            : [];
                        analytics.recordTurn(gameId, {
                            userId,
                            turnType: 'word',
                            score: ti.turnScore || 0,
                            wordsPlayed,
                            wordScores: ti.wordScores || null,
                            tilesPlaced: placedTiles.length || ti.turnTilesPlaced || 0,
                            placedTiles,
                            formedWords,
                        });
                    } catch (e) { console.error('Analytics turn error:', e.message); }
                    break;

                case 'newGame': {
                    broadcastToRoom(gameId, userId, message);
                    console.log(`New game started by ${userId}, tiles:`, message.drawnTiles?.length);
                    // Analytics: start new game session
                    try {
                        const starterCountryCode = analytics.getPlayerLastCountryCode(userId);
                        analytics.startGame(gameId, userId, {
                            player1CountryCode: starterCountryCode,
                            startedCountryCode: starterCountryCode,
                        });
                        // If other player already in room, set them as player2
                        const room = rooms.get(gameId);
                        if (room) {
                            for (const pid of room.players.keys()) {
                                if (pid !== userId) {
                                    analytics.setPlayer2(gameId, pid, {
                                        player2CountryCode: analytics.getPlayerLastCountryCode(pid),
                                    });
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
                            endedCountryCode: analytics.getPlayerLastCountryCode(userId),
                        });
                    } catch (e) { console.error('Analytics gameOver error:', e.message); }
                    break;

                case 'setProfile': {
                    const username = sanitizeUsername(message.username);
                    if (!username) break;
                    analytics.upsertPlayerProfile({ userId, username });
                    refreshPlayerGeo(userId, username, ip);
                    broadcastToRoom(gameId, userId, {
                        messageType: 'playerProfile',
                        userId,
                        username,
                    });
                    break;
                }

                case 'chat': {
                    // Input validation: text must be a string <= 500 chars
                    if (typeof message.text !== 'string' || message.text.length > 500) break;
                    sendToAllInRoom(gameId, {
                        messageType: 'chat',
                        userId: userId,
                        username: analytics.getDisplayName(userId) || null,
                        text: message.text,
                        timestamp: Date.now(),
                    });
                    break;
                }

                case 'validateWords':
                    if (!Array.isArray(message.words) || message.words.length > 20) break;
                    handleValidateWords(ws, userId, message);
                    break;

                case 'stateSnapshot':
                    if (!message.snapshot || typeof message.snapshot !== 'object') break;
                    try {
                        const saved = analytics.saveGameStateSnapshot({
                            gameId,
                            userId,
                            state: message.snapshot,
                        });
                        if (!saved) {
                            console.log('[ws stateSnapshot] not saved', { gameId, userId });
                        } else {
                            console.log('[ws stateSnapshot] saved', {
                                gameId,
                                userId,
                                playedTiles: Array.isArray(message.snapshot?.wordBoard?.playedTilesWithPositions)
                                    ? message.snapshot.wordBoard.playedTilesWithPositions.length
                                    : 0,
                                turns: Array.isArray(message.snapshot?.scoreBoard?.allTurns)
                                    ? message.snapshot.scoreBoard.allTurns.length
                                    : 0,
                            });
                        }
                    } catch (e) {
                        console.error('Analytics stateSnapshot error:', e.message);
                    }
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
            results[word] = !STRICT_SERVER_VALIDATION;
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
