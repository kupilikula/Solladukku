const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'analytics.db');

let db;

// In-memory tracking: gameId → games table row id
const activeGames = new Map();
// In-memory turn counters: games row id → turn count
const turnCounters = new Map();

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

        CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
        CREATE INDEX IF NOT EXISTS idx_visits_page ON visits(page);
        CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
        CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at);
        CREATE INDEX IF NOT EXISTS idx_turns_game_id ON turns(game_id);
        CREATE INDEX IF NOT EXISTS idx_turns_games_row_id ON turns(games_row_id);
    `);

    console.log('Analytics DB initialized at', DB_PATH);
}

function recordVisit({ page, gameId, userId, ip, userAgent, referrer }) {
    const stmt = db.prepare(
        'INSERT INTO visits (page, game_id, user_id, ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(page, gameId || null, userId || null, ip || null, userAgent || null, referrer || null);
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

    db.prepare(
        `UPDATE games SET winner_id = ?, game_over_reason = ?, ended_at = datetime('now') WHERE id = ?`
    ).run(winnerId || null, reason || null, rowId);

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
        'SELECT * FROM games ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
}

function getGameDetail(gameId) {
    const game = db.prepare(
        'SELECT * FROM games WHERE game_id = ? ORDER BY created_at DESC LIMIT 1'
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

function close() {
    if (db) {
        db.close();
        console.log('Analytics DB closed');
    }
}

module.exports = {
    init,
    recordVisit,
    startGame,
    setPlayer2,
    getActiveGameRowId,
    recordTurn,
    endGame,
    getStats,
    getRecentGames,
    getGameDetail,
    getVisitsPerDay,
    close,
};
