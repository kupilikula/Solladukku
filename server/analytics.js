const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.ANALYTICS_DB_PATH || path.join(__dirname, 'analytics.db');

let db;

// In-memory tracking: gameId → games table row id
const activeGames = new Map();
// In-memory turn counters: games row id → turn count
const turnCounters = new Map();

const RATING_K = 24;

function sanitizeUsername(username) {
    if (typeof username !== 'string') return null;
    const trimmed = username.trim().slice(0, 24);
    if (!trimmed) return null;
    return trimmed;
}

function init() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT NOT NULL,
            game_id TEXT,
            user_id TEXT,
            ip TEXT,
            user_agent TEXT,
            referrer TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player1_id TEXT,
            player2_id TEXT,
            player1_score INTEGER DEFAULT 0,
            player2_score INTEGER DEFAULT 0,
            winner_id TEXT,
            game_over_reason TEXT,
            total_turns INTEGER DEFAULT 0,
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            games_row_id INTEGER REFERENCES games(id),
            user_id TEXT,
            turn_number INTEGER,
            turn_type TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            words_played TEXT,
            word_scores TEXT,
            tiles_placed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS players (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            rating INTEGER NOT NULL DEFAULT 1000,
            games_played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
        CREATE INDEX IF NOT EXISTS idx_visits_page ON visits(page);
        CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
        CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at);
        CREATE INDEX IF NOT EXISTS idx_turns_game_id ON turns(game_id);
        CREATE INDEX IF NOT EXISTS idx_turns_games_row_id ON turns(games_row_id);
        CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
    `);

    console.log('Analytics DB initialized at', DB_PATH);
}

function recordVisit({ page, gameId, userId, ip, userAgent, referrer }) {
    const stmt = db.prepare(
        'INSERT INTO visits (page, game_id, user_id, ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(page, gameId || null, userId || null, ip || null, userAgent || null, referrer || null);
}

function upsertPlayerProfile({ userId, username }) {
    if (!userId || typeof userId !== 'string') return null;
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return null;

    db.prepare(`
        INSERT INTO players (user_id, username)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            updated_at = datetime('now')
    `).run(userId, cleanUsername);

    return getPlayerProfile(userId);
}

function getPlayerProfile(userId) {
    if (!userId || typeof userId !== 'string') return null;
    return db.prepare(`
        SELECT user_id as userId, username, rating, games_played as gamesPlayed,
               wins, losses, draws, total_score as totalScore
        FROM players
        WHERE user_id = ?
    `).get(userId) || null;
}

function getDisplayName(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const row = db.prepare('SELECT username FROM players WHERE user_id = ?').get(userId);
    return row?.username || null;
}

function ensurePlayer(userId, fallbackName) {
    if (!userId) return null;
    const current = getPlayerProfile(userId);
    if (current) return current;
    const fallback = sanitizeUsername(fallbackName) || `Player-${userId.slice(0, 6)}`;
    return upsertPlayerProfile({ userId, username: fallback });
}

function startGame(gameId, player1Id) {
    const stmt = db.prepare(
        'INSERT INTO games (game_id, player1_id) VALUES (?, ?)'
    );
    const result = stmt.run(gameId, player1Id);
    const rowId = result.lastInsertRowid;
    activeGames.set(gameId, rowId);
    turnCounters.set(rowId, 0);
    return rowId;
}

function setPlayer2(gameId, player2Id) {
    const rowId = activeGames.get(gameId);
    if (!rowId) return;
    db.prepare('UPDATE games SET player2_id = ? WHERE id = ?').run(player2Id, rowId);
}

function getActiveGameRowId(gameId) {
    return activeGames.get(gameId) || null;
}

function recordTurn(gameId, { userId, turnType, score, wordsPlayed, wordScores, tilesPlaced }) {
    const rowId = activeGames.get(gameId);
    if (!rowId) return;

    const turnNumber = (turnCounters.get(rowId) || 0) + 1;
    turnCounters.set(rowId, turnNumber);

    const stmt = db.prepare(
        `INSERT INTO turns (game_id, games_row_id, user_id, turn_number, turn_type, score, words_played, word_scores, tiles_placed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
        gameId, rowId, userId, turnNumber, turnType,
        score || 0,
        wordsPlayed ? JSON.stringify(wordsPlayed) : null,
        wordScores ? JSON.stringify(wordScores) : null,
        tilesPlaced || 0
    );

    // Update cumulative score in games table
    if (score) {
        const game = db.prepare('SELECT player1_id, player2_id FROM games WHERE id = ?').get(rowId);
        if (game) {
            if (userId === game.player1_id) {
                db.prepare('UPDATE games SET player1_score = player1_score + ?, total_turns = ? WHERE id = ?')
                    .run(score, turnNumber, rowId);
            } else if (userId === game.player2_id) {
                db.prepare('UPDATE games SET player2_score = player2_score + ?, total_turns = ? WHERE id = ?')
                    .run(score, turnNumber, rowId);
            } else {
                db.prepare('UPDATE games SET total_turns = ? WHERE id = ?').run(turnNumber, rowId);
            }
        }
    } else {
        db.prepare('UPDATE games SET total_turns = ? WHERE id = ?').run(turnNumber, rowId);
    }
}

function endGame(gameId, { winnerId, reason }) {
    const rowId = activeGames.get(gameId);
    if (!rowId) return;

    const game = db.prepare(`
        SELECT player1_id, player2_id, player1_score, player2_score, ended_at
        FROM games
        WHERE id = ?
    `).get(rowId);
    if (!game) {
        activeGames.delete(gameId);
        turnCounters.delete(rowId);
        return;
    }
    if (game.ended_at) {
        // Idempotency guard: ratings/stats are already finalized for this game.
        activeGames.delete(gameId);
        turnCounters.delete(rowId);
        return;
    }

    db.prepare(
        `UPDATE games SET winner_id = ?, game_over_reason = ?, ended_at = datetime('now') WHERE id = ?`
    ).run(winnerId || null, reason || null, rowId);

    // Update persistent player ratings + record only for human-vs-human games.
    if (game && game.player1_id && game.player2_id &&
        game.player1_id !== 'computer-player' && game.player2_id !== 'computer-player') {
        const p1 = ensurePlayer(game.player1_id);
        const p2 = ensurePlayer(game.player2_id);

        if (p1 && p2) {
            const expected1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
            const expected2 = 1 - expected1;
            let score1 = 0.5;
            let score2 = 0.5;
            if (winnerId === game.player1_id) {
                score1 = 1;
                score2 = 0;
            } else if (winnerId === game.player2_id) {
                score1 = 0;
                score2 = 1;
            }

            const newP1Rating = Math.round(p1.rating + RATING_K * (score1 - expected1));
            const newP2Rating = Math.round(p2.rating + RATING_K * (score2 - expected2));

            const p1Wins = score1 === 1 ? 1 : 0;
            const p1Losses = score1 === 0 ? 1 : 0;
            const p1Draws = score1 === 0.5 ? 1 : 0;
            const p2Wins = score2 === 1 ? 1 : 0;
            const p2Losses = score2 === 0 ? 1 : 0;
            const p2Draws = score2 === 0.5 ? 1 : 0;

            db.prepare(`
                UPDATE players
                SET rating = ?, games_played = games_played + 1, wins = wins + ?, losses = losses + ?, draws = draws + ?,
                    total_score = total_score + ?, updated_at = datetime('now')
                WHERE user_id = ?
            `).run(newP1Rating, p1Wins, p1Losses, p1Draws, game.player1_score || 0, game.player1_id);

            db.prepare(`
                UPDATE players
                SET rating = ?, games_played = games_played + 1, wins = wins + ?, losses = losses + ?, draws = draws + ?,
                    total_score = total_score + ?, updated_at = datetime('now')
                WHERE user_id = ?
            `).run(newP2Rating, p2Wins, p2Losses, p2Draws, game.player2_score || 0, game.player2_id);
        }
    }

    activeGames.delete(gameId);
    turnCounters.delete(rowId);
}

function getStats() {
    const totalVisits = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
    const totalGames = db.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const completedGames = db.prepare('SELECT COUNT(*) as count FROM games WHERE ended_at IS NOT NULL').get().count;
    const totalTurns = db.prepare('SELECT COUNT(*) as count FROM turns').get().count;
    return { totalVisits, totalGames, completedGames, totalTurns };
}

function getRecentGames(limit = 20) {
    return db.prepare(
        `SELECT g.*, p1.username as player1_name, p2.username as player2_name
         FROM games g
         LEFT JOIN players p1 ON p1.user_id = g.player1_id
         LEFT JOIN players p2 ON p2.user_id = g.player2_id
         ORDER BY g.created_at DESC
         LIMIT ?`
    ).all(limit);
}

function getGameDetail(gameId) {
    const game = db.prepare(
        `SELECT g.*, p1.username as player1_name, p2.username as player2_name
         FROM games g
         LEFT JOIN players p1 ON p1.user_id = g.player1_id
         LEFT JOIN players p2 ON p2.user_id = g.player2_id
         WHERE g.game_id = ?
         ORDER BY g.created_at DESC
         LIMIT 1`
    ).get(gameId);
    if (!game) return null;

    const turns = db.prepare(
        'SELECT * FROM turns WHERE games_row_id = ? ORDER BY turn_number ASC'
    ).all(game.id);

    return { game, turns };
}

function getVisitsPerDay(days = 30) {
    return db.prepare(
        `SELECT date(created_at) as day, COUNT(*) as count
         FROM visits
         WHERE created_at >= datetime('now', ?)
         GROUP BY day ORDER BY day DESC`
    ).all(`-${days} days`);
}

function getLeaderboard(limit = 20) {
    return db.prepare(`
        SELECT
            user_id as userId,
            username,
            rating,
            games_played as gamesPlayed,
            wins,
            losses,
            draws,
            total_score as totalScore,
            CASE
                WHEN games_played > 0 THEN ROUND((wins * 100.0) / games_played, 1)
                ELSE 0
            END as winRate
        FROM players
        ORDER BY rating DESC, wins DESC, total_score DESC
        LIMIT ?
    `).all(limit);
}

function close() {
    if (db) {
        db.close();
        console.log('Analytics DB closed');
    }
}

module.exports = {
    init,
    recordVisit,
    upsertPlayerProfile,
    getPlayerProfile,
    getDisplayName,
    startGame,
    setPlayer2,
    getActiveGameRowId,
    recordTurn,
    endGame,
    getStats,
    getRecentGames,
    getGameDetail,
    getVisitsPerDay,
    getLeaderboard,
    close,
};
