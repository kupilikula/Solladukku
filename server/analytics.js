const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.ANALYTICS_DB_PATH || path.join(__dirname, 'analytics.db');

let db;

// In-memory tracking: gameId → games table row id
const activeGames = new Map();
// In-memory turn counters: games row id → turn count
const turnCounters = new Map();

const RATING_K = 24;

function ensureSchemaMigrationsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT (datetime('now'))
        );
    `);
}

function hasAppliedMigration(name) {
    const row = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1').get(name);
    return Boolean(row);
}

function applyMigration(name, sqlStatements) {
    if (hasAppliedMigration(name)) return;
    const tx = db.transaction(() => {
        for (const sql of sqlStatements) {
            db.exec(sql);
        }
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    });
    tx();
}

function addColumnsIfMissing(tableName, columns) {
    const existing = new Set(
        db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name)
    );
    for (const column of columns) {
        if (!existing.has(column.name)) {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.definition}`);
        }
    }
}

function sanitizeUsername(username) {
    if (typeof username !== 'string') return null;
    const trimmed = username.trim().slice(0, 24);
    if (!trimmed) return null;
    return trimmed;
}

function normalizeUsernameKey(username) {
    const clean = sanitizeUsername(username);
    if (!clean) return null;
    return clean.toLowerCase();
}

function claimUniqueUsernameOrSuggest(userId, desiredUsername) {
    const clean = sanitizeUsername(desiredUsername);
    const baseKey = normalizeUsernameKey(desiredUsername);
    if (!userId || typeof userId !== 'string' || !clean || !baseKey) {
        return { ok: false, reason: 'invalid' };
    }

    const existing = db.prepare(`
        SELECT user_id as userId, username
        FROM players
        WHERE lower(username) = ?
        LIMIT 1
    `).get(baseKey);

    if (!existing || existing.userId === userId) {
        return { ok: true, username: clean };
    }

    const makeCandidate = (suffixNumber) => {
        const suffix = String(suffixNumber);
        const maxBaseLen = Math.max(1, 24 - suffix.length);
        return `${clean.slice(0, maxBaseLen)}${suffix}`;
    };

    let suggestion = null;
    for (let i = 1; i <= 9999; i += 1) {
        const candidate = makeCandidate(i);
        const candidateKey = candidate.toLowerCase();
        const clash = db.prepare('SELECT 1 FROM players WHERE lower(username) = ? LIMIT 1').get(candidateKey);
        if (!clash) {
            suggestion = candidate;
            break;
        }
    }

    return { ok: false, reason: 'taken', suggestion };
}

function ensureUniquePlayerUsernames() {
    const rows = db.prepare(`
        SELECT user_id as userId, username, created_at as createdAt
        FROM players
        ORDER BY datetime(created_at) ASC, user_id ASC
    `).all();
    if (!rows.length) return;

    const used = new Set();
    const updates = [];

    const buildCandidate = (baseName, suffixNumber) => {
        const suffix = String(suffixNumber);
        const maxBaseLen = Math.max(1, 24 - suffix.length);
        return `${baseName.slice(0, maxBaseLen)}${suffix}`;
    };

    for (const row of rows) {
        const clean = sanitizeUsername(row.username) || `player${row.userId.slice(0, 4)}`;
        let candidate = clean;
        let key = candidate.toLowerCase();
        if (used.has(key)) {
            let i = 1;
            while (i <= 99999) {
                const next = buildCandidate(clean, i);
                const nextKey = next.toLowerCase();
                if (!used.has(nextKey)) {
                    candidate = next;
                    key = nextKey;
                    break;
                }
                i += 1;
            }
        }
        used.add(key);
        if (candidate !== row.username) {
            updates.push({ userId: row.userId, username: candidate });
        }
    }

    if (!updates.length) return;

    const tx = db.transaction((pending) => {
        const stmt = db.prepare(`
            UPDATE players
            SET username = ?, updated_at = datetime('now')
            WHERE user_id = ?
        `);
        pending.forEach((u) => stmt.run(u.username, u.userId));
    });
    tx(updates);
    console.log(`[analytics] normalized ${updates.length} duplicate username(s) before unique index migration`);
}

function init() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureSchemaMigrationsTable();

    db.exec(`
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT NOT NULL,
            game_id TEXT,
            user_id TEXT,
            account_id TEXT,
            ip TEXT,
            user_agent TEXT,
            referrer TEXT,
            country_code TEXT,
            country TEXT,
            region TEXT,
            city TEXT,
            timezone TEXT,
            geo_source TEXT,
            geo_resolved_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            game_type TEXT DEFAULT 'multiplayer',
            account_id TEXT,
            player1_id TEXT,
            player2_id TEXT,
            player1_score INTEGER DEFAULT 0,
            player2_score INTEGER DEFAULT 0,
            winner_id TEXT,
            game_over_reason TEXT,
            total_turns INTEGER DEFAULT 0,
            player1_country_code TEXT,
            player2_country_code TEXT,
            started_country_code TEXT,
            ended_country_code TEXT,
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            games_row_id INTEGER REFERENCES games(id),
            user_id TEXT,
            account_id TEXT,
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
            last_country_code TEXT,
            last_country TEXT,
            last_region TEXT,
            last_city TEXT,
            last_seen_ip_hash TEXT,
            last_seen_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_state_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            games_row_id INTEGER NOT NULL REFERENCES games(id),
            user_id TEXT NOT NULL,
            account_id TEXT,
            state_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(games_row_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
        CREATE INDEX IF NOT EXISTS idx_visits_page ON visits(page);
        CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
        CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at);
        CREATE INDEX IF NOT EXISTS idx_turns_game_id ON turns(game_id);
        CREATE INDEX IF NOT EXISTS idx_turns_games_row_id ON turns(games_row_id);
        CREATE INDEX IF NOT EXISTS idx_turns_user_id ON turns(user_id);
        CREATE INDEX IF NOT EXISTS idx_games_player1_id ON games(player1_id);
        CREATE INDEX IF NOT EXISTS idx_games_player2_id ON games(player2_id);
        CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
        CREATE INDEX IF NOT EXISTS idx_snapshots_game_id ON game_state_snapshots(game_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_games_row_id ON game_state_snapshots(games_row_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_user_id ON game_state_snapshots(user_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at ON game_state_snapshots(updated_at DESC);
    `);

    // Lightweight migrations for existing DBs.
    addColumnsIfMissing('turns', [
        { name: 'placed_tiles_json', definition: 'placed_tiles_json TEXT' },
        { name: 'formed_words_json', definition: 'formed_words_json TEXT' },
    ]);
    addColumnsIfMissing('visits', [
        { name: 'country_code', definition: 'country_code TEXT' },
        { name: 'country', definition: 'country TEXT' },
        { name: 'region', definition: 'region TEXT' },
        { name: 'city', definition: 'city TEXT' },
        { name: 'timezone', definition: 'timezone TEXT' },
        { name: 'geo_source', definition: 'geo_source TEXT' },
        { name: 'geo_resolved_at', definition: 'geo_resolved_at TEXT' },
    ]);
    addColumnsIfMissing('players', [
        { name: 'last_country_code', definition: 'last_country_code TEXT' },
        { name: 'last_country', definition: 'last_country TEXT' },
        { name: 'last_region', definition: 'last_region TEXT' },
        { name: 'last_city', definition: 'last_city TEXT' },
        { name: 'last_seen_ip_hash', definition: 'last_seen_ip_hash TEXT' },
        { name: 'last_seen_at', definition: 'last_seen_at TEXT' },
    ]);
    addColumnsIfMissing('games', [
        { name: 'game_type', definition: `game_type TEXT DEFAULT 'multiplayer'` },
        { name: 'account_id', definition: 'account_id TEXT' },
        { name: 'player1_country_code', definition: 'player1_country_code TEXT' },
        { name: 'player2_country_code', definition: 'player2_country_code TEXT' },
        { name: 'started_country_code', definition: 'started_country_code TEXT' },
        { name: 'ended_country_code', definition: 'ended_country_code TEXT' },
    ]);
    addColumnsIfMissing('turns', [
        { name: 'account_id', definition: 'account_id TEXT' },
    ]);
    addColumnsIfMissing('game_state_snapshots', [
        { name: 'account_id', definition: 'account_id TEXT' },
    ]);
    addColumnsIfMissing('visits', [
        { name: 'account_id', definition: 'account_id TEXT' },
    ]);

    applyMigration('2026-02-14-auth-core', [
        `CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email_verified_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS account_profiles (
            account_id TEXT PRIMARY KEY REFERENCES accounts(id),
            username TEXT NOT NULL,
            rating INTEGER NOT NULL DEFAULT 1000,
            games_played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_account_profiles_username_ci_unique ON account_profiles(lower(username))`,
        `CREATE TABLE IF NOT EXISTS account_sessions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            refresh_token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT,
            ip_hash TEXT,
            user_agent_hash TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_account_sessions_account_id ON account_sessions(account_id)`,
        `CREATE INDEX IF NOT EXISTS idx_account_sessions_refresh_hash ON account_sessions(refresh_token_hash)`,
        `CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS account_player_links (
            account_id TEXT NOT NULL REFERENCES accounts(id),
            player_user_id TEXT NOT NULL,
            linked_at TEXT DEFAULT (datetime('now')),
            UNIQUE(account_id, player_user_id),
            UNIQUE(player_user_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_games_account_id ON games(account_id)`,
        `CREATE INDEX IF NOT EXISTS idx_turns_account_id ON turns(account_id)`,
        `CREATE INDEX IF NOT EXISTS idx_snapshots_account_id ON game_state_snapshots(account_id)`,
        `CREATE INDEX IF NOT EXISTS idx_visits_account_id ON visits(account_id)`,
    ]);

    // Ensure existing rows are deduplicated before creating unique username index.
    ensureUniquePlayerUsernames();

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_visits_country_code ON visits(country_code);
        CREATE INDEX IF NOT EXISTS idx_games_started_country_code ON games(started_country_code);
        CREATE INDEX IF NOT EXISTS idx_players_last_country_code ON players(last_country_code);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_ci_unique ON players(lower(username));
    `);

    console.log('Analytics DB initialized at', DB_PATH);
}

function recordVisit({ page, gameId, userId, accountId, ip, userAgent, referrer, geo }) {
    const geoResolvedAt = geo
        ? new Date().toISOString().slice(0, 19).replace('T', ' ')
        : null;
    const stmt = db.prepare(
        `INSERT INTO visits (
            page, game_id, user_id, account_id, ip, user_agent, referrer,
            country_code, country, region, city, timezone, geo_source, geo_resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
        page,
        gameId || null,
        userId || null,
        accountId || null,
        ip || null,
        userAgent || null,
        referrer || null,
        geo?.countryCode || null,
        geo?.country || null,
        geo?.region || null,
        geo?.city || null,
        geo?.timezone || null,
        geo?.source || null,
        geoResolvedAt
    );
}

function upsertPlayerProfile({ userId, username, geo, ipHash }) {
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

    if (geo || ipHash) {
        db.prepare(`
            UPDATE players
            SET
                last_country_code = COALESCE(?, last_country_code),
                last_country = COALESCE(?, last_country),
                last_region = COALESCE(?, last_region),
                last_city = COALESCE(?, last_city),
                last_seen_ip_hash = COALESCE(?, last_seen_ip_hash),
                last_seen_at = datetime('now'),
                updated_at = datetime('now')
            WHERE user_id = ?
        `).run(
            geo?.countryCode || null,
            geo?.country || null,
            geo?.region || null,
            geo?.city || null,
            ipHash || null,
            userId
        );
    }

    return getPlayerProfile(userId);
}

function getPlayerProfile(userId) {
    if (!userId || typeof userId !== 'string') return null;
    return db.prepare(`
        SELECT user_id as userId, username, rating, games_played as gamesPlayed,
               wins, losses, draws, total_score as totalScore,
               last_country_code as lastCountryCode,
               last_country as lastCountry,
               last_region as lastRegion,
               last_city as lastCity,
               last_seen_at as lastSeenAt
        FROM players
        WHERE user_id = ?
    `).get(userId) || null;
}

function getDisplayName(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const row = db.prepare('SELECT username FROM players WHERE user_id = ?').get(userId);
    return row?.username || null;
}

function getPlayerLastCountryCode(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const row = db.prepare('SELECT last_country_code FROM players WHERE user_id = ?').get(userId);
    return row?.last_country_code || null;
}

function ensurePlayer(userId, fallbackName) {
    if (!userId) return null;
    const current = getPlayerProfile(userId);
    if (current) return current;
    const fallback = sanitizeUsername(fallbackName) || `Player-${userId.slice(0, 6)}`;
    return upsertPlayerProfile({ userId, username: fallback });
}

function getAccountByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    return db.prepare(`
        SELECT id, email, password_hash as passwordHash, email_verified_at as emailVerifiedAt, status
        FROM accounts
        WHERE email = ?
        LIMIT 1
    `).get(email) || null;
}

function getAccountById(accountId) {
    if (!accountId || typeof accountId !== 'string') return null;
    return db.prepare(`
        SELECT id, email, password_hash as passwordHash, email_verified_at as emailVerifiedAt, status
        FROM accounts
        WHERE id = ?
        LIMIT 1
    `).get(accountId) || null;
}

function getAccountProfile(accountId) {
    if (!accountId || typeof accountId !== 'string') return null;
    return db.prepare(`
        SELECT
            ap.account_id as accountId,
            ap.username,
            ap.rating,
            ap.games_played as gamesPlayed,
            ap.wins,
            ap.losses,
            ap.draws,
            ap.total_score as totalScore,
            a.email,
            a.email_verified_at as emailVerifiedAt,
            a.status
        FROM account_profiles ap
        JOIN accounts a ON a.id = ap.account_id
        WHERE ap.account_id = ?
        LIMIT 1
    `).get(accountId) || null;
}

function claimUniqueAccountUsernameOrSuggest(accountId, desiredUsername) {
    const clean = sanitizeUsername(desiredUsername);
    const baseKey = normalizeUsernameKey(desiredUsername);
    if (!accountId || typeof accountId !== 'string' || !clean || !baseKey) {
        return { ok: false, reason: 'invalid' };
    }

    const existing = db.prepare(`
        SELECT account_id as accountId, username
        FROM account_profiles
        WHERE lower(username) = ?
        LIMIT 1
    `).get(baseKey);

    if (!existing || existing.accountId === accountId) {
        return { ok: true, username: clean };
    }

    const makeCandidate = (suffixNumber) => {
        const suffix = String(suffixNumber);
        const maxBaseLen = Math.max(1, 24 - suffix.length);
        return `${clean.slice(0, maxBaseLen)}${suffix}`;
    };

    let suggestion = null;
    for (let i = 1; i <= 9999; i += 1) {
        const candidate = makeCandidate(i);
        const clash = db.prepare('SELECT 1 FROM account_profiles WHERE lower(username) = ? LIMIT 1')
            .get(candidate.toLowerCase());
        if (!clash) {
            suggestion = candidate;
            break;
        }
    }
    return { ok: false, reason: 'taken', suggestion };
}

function createAccountWithProfile({ accountId, email, passwordHash, username, linkedGuestUserId = null }) {
    if (!accountId || !email || !passwordHash || !username) return null;
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return null;

    const result = db.transaction(() => {
        db.prepare(`
            INSERT INTO accounts (id, email, password_hash)
            VALUES (?, ?, ?)
        `).run(accountId, email, passwordHash);
        db.prepare(`
            INSERT INTO account_profiles (account_id, username)
            VALUES (?, ?)
        `).run(accountId, cleanUsername);

        if (linkedGuestUserId && typeof linkedGuestUserId === 'string') {
            db.prepare(`
                INSERT INTO account_player_links (account_id, player_user_id)
                VALUES (?, ?)
                ON CONFLICT(player_user_id) DO NOTHING
            `).run(accountId, linkedGuestUserId);
        }
    });
    result();
    return getAccountProfile(accountId);
}

function linkAccountToPlayer(accountId, playerUserId) {
    if (!accountId || typeof accountId !== 'string') return { ok: false, reason: 'invalid' };
    if (!playerUserId || typeof playerUserId !== 'string') return { ok: false, reason: 'invalid' };

    const existing = db.prepare(`
        SELECT account_id as accountId
        FROM account_player_links
        WHERE player_user_id = ?
        LIMIT 1
    `).get(playerUserId);

    if (existing && existing.accountId && existing.accountId !== accountId) {
        return { ok: false, reason: 'already_linked' };
    }

    db.prepare(`
        INSERT INTO account_player_links (account_id, player_user_id)
        VALUES (?, ?)
        ON CONFLICT(player_user_id) DO NOTHING
    `).run(accountId, playerUserId);

    return { ok: true };
}

function getLinkedPlayerUserIds(accountId) {
    if (!accountId || typeof accountId !== 'string') return [];
    const rows = db.prepare(`
        SELECT player_user_id as playerUserId
        FROM account_player_links
        WHERE account_id = ?
    `).all(accountId);
    return rows.map((row) => row.playerUserId).filter(Boolean);
}

function updateAccountProfileUsername(accountId, username) {
    const clean = sanitizeUsername(username);
    if (!accountId || typeof accountId !== 'string' || !clean) return null;
    db.prepare(`
        UPDATE account_profiles
        SET username = ?, updated_at = datetime('now')
        WHERE account_id = ?
    `).run(clean, accountId);
    return getAccountProfile(accountId);
}

function createAccountSession({ sessionId, accountId, refreshTokenHash, expiresAt, ipHash = null, userAgentHash = null }) {
    db.prepare(`
        INSERT INTO account_sessions (
            id, account_id, refresh_token_hash, expires_at, ip_hash, user_agent_hash
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, accountId, refreshTokenHash, expiresAt, ipHash, userAgentHash);
}

function findAccountSessionById(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    return db.prepare(`
        SELECT id, account_id as accountId, refresh_token_hash as refreshTokenHash,
               expires_at as expiresAt, revoked_at as revokedAt, ip_hash as ipHash, user_agent_hash as userAgentHash
        FROM account_sessions
        WHERE id = ?
        LIMIT 1
    `).get(sessionId) || null;
}

function rotateAccountSession({ sessionId, refreshTokenHash, expiresAt, ipHash = null, userAgentHash = null }) {
    db.prepare(`
        UPDATE account_sessions
        SET
            refresh_token_hash = ?,
            expires_at = ?,
            revoked_at = NULL,
            ip_hash = COALESCE(?, ip_hash),
            user_agent_hash = COALESCE(?, user_agent_hash),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(refreshTokenHash, expiresAt, ipHash, userAgentHash, sessionId);
}

function revokeAccountSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return;
    db.prepare(`
        UPDATE account_sessions
        SET revoked_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND revoked_at IS NULL
    `).run(sessionId);
}

function createEmailVerificationToken({ id, accountId, tokenHash, expiresAt }) {
    if (!id || !accountId || !tokenHash || !expiresAt) return false;
    db.prepare(`
        INSERT INTO email_verification_tokens (id, account_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(id, accountId, tokenHash, expiresAt);
    return true;
}

function consumeEmailVerificationToken({ id, tokenHash }) {
    if (!id || !tokenHash) return null;
    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const row = db.prepare(`
        SELECT id, account_id as accountId
        FROM email_verification_tokens
        WHERE id = ? AND token_hash = ? AND used_at IS NULL AND expires_at >= ?
        LIMIT 1
    `).get(id, tokenHash, nowSql);
    if (!row) return null;
    const result = db.prepare(`
        UPDATE email_verification_tokens
        SET used_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND used_at IS NULL
    `).run(id);
    if (!result.changes) return null;
    return row;
}

function createPasswordResetToken({ id, accountId, tokenHash, expiresAt }) {
    if (!id || !accountId || !tokenHash || !expiresAt) return false;
    db.prepare(`
        INSERT INTO password_reset_tokens (id, account_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(id, accountId, tokenHash, expiresAt);
    return true;
}

function consumePasswordResetToken({ id, tokenHash }) {
    if (!id || !tokenHash) return null;
    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const row = db.prepare(`
        SELECT id, account_id as accountId
        FROM password_reset_tokens
        WHERE id = ? AND token_hash = ? AND used_at IS NULL AND expires_at >= ?
        LIMIT 1
    `).get(id, tokenHash, nowSql);
    if (!row) return null;
    const result = db.prepare(`
        UPDATE password_reset_tokens
        SET used_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND used_at IS NULL
    `).run(id);
    if (!result.changes) return null;
    return row;
}

function markAccountEmailVerified(accountId) {
    if (!accountId || typeof accountId !== 'string') return false;
    const result = db.prepare(`
        UPDATE accounts
        SET email_verified_at = COALESCE(email_verified_at, datetime('now')),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(accountId);
    return Boolean(result.changes);
}

function updateAccountPasswordHash(accountId, passwordHash) {
    if (!accountId || typeof accountId !== 'string') return false;
    if (!passwordHash || typeof passwordHash !== 'string') return false;
    const result = db.prepare(`
        UPDATE accounts
        SET password_hash = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(passwordHash, accountId);
    return Boolean(result.changes);
}

function startGame(gameId, player1Id, options = {}) {
    const {
        gameType = 'multiplayer',
        accountId = null,
        player1CountryCode = null,
        startedCountryCode = null,
    } = options;
    const stmt = db.prepare(
        `INSERT INTO games (
            game_id, game_type, account_id, player1_id, player1_country_code, started_country_code
        ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(gameId, gameType, accountId, player1Id, player1CountryCode, startedCountryCode);
    const rowId = result.lastInsertRowid;
    activeGames.set(gameId, rowId);
    turnCounters.set(rowId, 0);
    return rowId;
}

function setPlayer2(gameId, player2Id, options = {}) {
    const rowId = activeGames.get(gameId);
    if (!rowId) return;
    const { player2CountryCode = null } = options;
    db.prepare(`
        UPDATE games
        SET
            player2_id = ?,
            player2_country_code = COALESCE(?, player2_country_code)
        WHERE id = ?
    `).run(player2Id, player2CountryCode, rowId);
}

function getActiveGameRowId(gameId) {
    return activeGames.get(gameId) || null;
}

function ensureGameSession(gameId, player1Id, options = {}) {
    const existing = db.prepare(`
        SELECT id, ended_at
        FROM games
        WHERE game_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(gameId);

    if (existing && !existing.ended_at) {
        activeGames.set(gameId, existing.id);
        const turnCount = db.prepare(`
            SELECT COALESCE(MAX(turn_number), 0) as maxTurn
            FROM turns
            WHERE games_row_id = ?
        `).get(existing.id)?.maxTurn || 0;
        turnCounters.set(existing.id, Number(turnCount || 0));
        return existing.id;
    }

    return startGame(gameId, player1Id, options);
}

function recordTurn(gameId, {
    userId,
    accountId = null,
    turnType,
    score,
    wordsPlayed,
    wordScores,
    tilesPlaced,
    placedTiles,
    formedWords,
}) {
    let rowId = activeGames.get(gameId);
    if (!rowId) {
        const row = db.prepare(`
            SELECT id, ended_at
            FROM games
            WHERE game_id = ?
            ORDER BY
                CASE WHEN ended_at IS NULL THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 1
        `).get(gameId);
        if (!row) return;
        rowId = row.id;
        activeGames.set(gameId, rowId);
        const turnCount = db.prepare(`
            SELECT COALESCE(MAX(turn_number), 0) as maxTurn
            FROM turns
            WHERE games_row_id = ?
        `).get(rowId)?.maxTurn || 0;
        turnCounters.set(rowId, Number(turnCount || 0));
    }

    const turnNumber = (turnCounters.get(rowId) || 0) + 1;
    turnCounters.set(rowId, turnNumber);

    const stmt = db.prepare(
        `INSERT INTO turns (
            game_id, games_row_id, user_id, account_id, turn_number, turn_type, score,
            words_played, word_scores, tiles_placed, placed_tiles_json, formed_words_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
        gameId, rowId, userId, accountId, turnNumber, turnType,
        score || 0,
        wordsPlayed ? JSON.stringify(wordsPlayed) : null,
        wordScores ? JSON.stringify(wordScores) : null,
        tilesPlaced || 0,
        placedTiles ? JSON.stringify(placedTiles) : null,
        formedWords ? JSON.stringify(formedWords) : null
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

function endGame(gameId, { winnerId, reason, endedCountryCode = null }) {
    let rowId = activeGames.get(gameId);
    if (!rowId) {
        const row = db.prepare(`
            SELECT id
            FROM games
            WHERE game_id = ?
            ORDER BY
                CASE WHEN ended_at IS NULL THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 1
        `).get(gameId);
        if (!row) return;
        rowId = row.id;
    }

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
        `UPDATE games
         SET
            winner_id = ?,
            game_over_reason = ?,
            ended_country_code = COALESCE(?, ended_country_code),
            ended_at = datetime('now')
         WHERE id = ?`
    ).run(winnerId || null, reason || null, endedCountryCode || null, rowId);

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

function getRecentGames(limit = 20, offset = 0, query = '') {
    const hasQuery = typeof query === 'string' && query.trim().length > 0;
    const like = `%${query.trim()}%`;
    const whereClause = hasQuery
        ? `WHERE (
            g.game_id LIKE ? OR
            g.player1_id LIKE ? OR
            g.player2_id LIKE ? OR
            p1.username LIKE ? OR
            p2.username LIKE ?
        )`
        : '';

    const total = hasQuery
        ? db.prepare(
            `SELECT COUNT(*) as count
             FROM games g
             LEFT JOIN players p1 ON p1.user_id = g.player1_id
             LEFT JOIN players p2 ON p2.user_id = g.player2_id
             ${whereClause}`
        ).get(like, like, like, like, like).count
        : db.prepare('SELECT COUNT(*) as count FROM games').get().count;

    const params = hasQuery
        ? [like, like, like, like, like, limit, offset]
        : [limit, offset];

    const items = db.prepare(
        `SELECT g.*, p1.username as player1_name, p2.username as player2_name
         FROM games g
         LEFT JOIN players p1 ON p1.user_id = g.player1_id
         LEFT JOIN players p2 ON p2.user_id = g.player2_id
         ${whereClause}
         ORDER BY g.created_at DESC
         LIMIT ? OFFSET ?`
    ).all(...params);

    return { items, total, limit, offset };
}

function parseJsonSafe(value) {
    if (!value || typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function normalizeTurnRow(turn) {
    if (!turn) return turn;
    return {
        ...turn,
        wordsPlayed: parseJsonSafe(turn.words_played) || [],
        wordScores: parseJsonSafe(turn.word_scores) || [],
        placedTiles: parseJsonSafe(turn.placed_tiles_json) || [],
        formedWords: parseJsonSafe(turn.formed_words_json) || [],
    };
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
        `SELECT id, game_id, games_row_id, user_id, turn_number, turn_type, score,
                words_played, word_scores, tiles_placed, placed_tiles_json, formed_words_json, created_at
         FROM turns
         WHERE games_row_id = ?
         ORDER BY turn_number ASC`
    ).all(game.id).map(normalizeTurnRow);

    const latestSnapshot = db.prepare(
        `SELECT user_id, state_json, updated_at
         FROM game_state_snapshots
         WHERE games_row_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
    ).get(game.id);

    return {
        game,
        turns,
        latestSnapshot: latestSnapshot
            ? {
                userId: latestSnapshot.user_id,
                updatedAt: latestSnapshot.updated_at,
                state: parseJsonSafe(latestSnapshot.state_json),
            }
            : null,
    };
}

function getUserGames(userId, limit = 20) {
    if (!userId || typeof userId !== 'string') {
        return { items: [], total: 0, limit: 0 };
    }
    const safeLimit = Math.max(1, Math.min(limit || 20, 100));
    const total = db.prepare(`
        SELECT COUNT(*) as count
        FROM games g
        WHERE g.player1_id = ? OR g.player2_id = ?
    `).get(userId, userId).count;

    const items = db.prepare(`
        SELECT
            g.id,
            g.game_id as gameId,
            g.game_type as gameType,
            g.player1_id as player1Id,
            g.player2_id as player2Id,
            g.player1_score as player1Score,
            g.player2_score as player2Score,
            g.winner_id as winnerId,
            g.game_over_reason as gameOverReason,
            g.total_turns as totalTurns,
            g.started_at as startedAt,
            g.ended_at as endedAt,
            p1.username as player1Name,
            p2.username as player2Name,
            s.updated_at as snapshotUpdatedAt
        FROM games g
        LEFT JOIN players p1 ON p1.user_id = g.player1_id
        LEFT JOIN players p2 ON p2.user_id = g.player2_id
        LEFT JOIN game_state_snapshots s
            ON s.games_row_id = g.id AND s.user_id = ?
        WHERE g.player1_id = ? OR g.player2_id = ?
        ORDER BY
            CASE WHEN g.ended_at IS NULL THEN 0 ELSE 1 END,
            COALESCE(g.ended_at, g.started_at, g.created_at) DESC
        LIMIT ?
    `).all(userId, userId, userId, safeLimit);

    return {
        items: items.map((item) => ({
            ...item,
            status: item.endedAt ? 'finished' : 'in_progress',
            hasSnapshotForUser: Boolean(item.snapshotUpdatedAt),
        })),
        total,
        limit: safeLimit,
    };
}

function getAccountGames(accountId, linkedUserIds = [], limit = 20) {
    if (!accountId || typeof accountId !== 'string') {
        return { items: [], total: 0, limit: 0 };
    }
    const safeLimit = Math.max(1, Math.min(limit || 20, 100));
    const userIds = Array.from(new Set((linkedUserIds || []).filter((id) => typeof id === 'string' && id)));
    const userClause = userIds.length
        ? ` OR g.player1_id IN (${userIds.map(() => '?').join(',')}) OR g.player2_id IN (${userIds.map(() => '?').join(',')})`
        : '';
    const totalParams = [accountId, ...userIds, ...userIds];
    const total = db.prepare(`
        SELECT COUNT(*) as count
        FROM games g
        WHERE g.account_id = ?${userClause}
    `).get(...totalParams).count;

    const snapshotClause = userIds.length
        ? `s.account_id = ? OR s.user_id IN (${userIds.map(() => '?').join(',')})`
        : `s.account_id = ?`;
    const snapshotParams = [accountId, ...userIds];
    const itemParams = [...snapshotParams, accountId, ...userIds, ...userIds, safeLimit];
    const items = db.prepare(`
        SELECT
            g.id,
            g.game_id as gameId,
            g.game_type as gameType,
            g.player1_id as player1Id,
            g.player2_id as player2Id,
            g.player1_score as player1Score,
            g.player2_score as player2Score,
            g.winner_id as winnerId,
            g.game_over_reason as gameOverReason,
            g.total_turns as totalTurns,
            g.started_at as startedAt,
            g.ended_at as endedAt,
            p1.username as player1Name,
            p2.username as player2Name,
            (
                SELECT MAX(s.updated_at)
                FROM game_state_snapshots s
                WHERE s.games_row_id = g.id AND (${snapshotClause})
            ) as snapshotUpdatedAt
        FROM games g
        LEFT JOIN players p1 ON p1.user_id = g.player1_id
        LEFT JOIN players p2 ON p2.user_id = g.player2_id
        WHERE g.account_id = ?${userClause}
        ORDER BY
            CASE WHEN g.ended_at IS NULL THEN 0 ELSE 1 END,
            COALESCE(g.ended_at, g.started_at, g.created_at) DESC
        LIMIT ?
    `).all(...itemParams);

    return {
        items: items.map((item) => ({
            ...item,
            status: item.endedAt ? 'finished' : 'in_progress',
            hasSnapshotForUser: Boolean(item.snapshotUpdatedAt),
        })),
        total,
        limit: safeLimit,
    };
}

function getUserGameDetail(userId, gameId) {
    if (!userId || typeof userId !== 'string') return null;
    if (!gameId || typeof gameId !== 'string') return null;

    const game = db.prepare(`
        SELECT g.*, p1.username as player1_name, p2.username as player2_name
        FROM games g
        LEFT JOIN players p1 ON p1.user_id = g.player1_id
        LEFT JOIN players p2 ON p2.user_id = g.player2_id
        WHERE g.game_id = ? AND (g.player1_id = ? OR g.player2_id = ?)
        ORDER BY g.created_at DESC
        LIMIT 1
    `).get(gameId, userId, userId);
    if (!game) return null;

    const turns = db.prepare(
        `SELECT id, game_id, games_row_id, user_id, turn_number, turn_type, score,
                words_played, word_scores, tiles_placed, placed_tiles_json, formed_words_json, created_at
         FROM turns
         WHERE games_row_id = ?
         ORDER BY turn_number ASC`
    ).all(game.id).map(normalizeTurnRow);

    const snapshotForUser = db.prepare(
        `SELECT user_id, state_json, updated_at
         FROM game_state_snapshots
         WHERE games_row_id = ? AND user_id = ?
         LIMIT 1`
    ).get(game.id, userId);

    const latestSnapshot = db.prepare(
        `SELECT user_id, state_json, updated_at
         FROM game_state_snapshots
         WHERE games_row_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
    ).get(game.id);

    return {
        game,
        turns,
        snapshotForUser: snapshotForUser
            ? {
                userId: snapshotForUser.user_id,
                updatedAt: snapshotForUser.updated_at,
                state: parseJsonSafe(snapshotForUser.state_json),
            }
            : null,
        latestSnapshot: latestSnapshot
            ? {
                userId: latestSnapshot.user_id,
                updatedAt: latestSnapshot.updated_at,
                state: parseJsonSafe(latestSnapshot.state_json),
            }
            : null,
    };
}

function getAccountGameDetail(accountId, gameId, linkedUserIds = []) {
    if (!accountId || typeof accountId !== 'string') return null;
    if (!gameId || typeof gameId !== 'string') return null;
    const userIds = Array.from(new Set((linkedUserIds || []).filter((id) => typeof id === 'string' && id)));
    const userClause = userIds.length
        ? ` OR g.player1_id IN (${userIds.map(() => '?').join(',')}) OR g.player2_id IN (${userIds.map(() => '?').join(',')})`
        : '';
    const gameParams = [gameId, accountId, ...userIds, ...userIds];
    const game = db.prepare(`
        SELECT g.*, p1.username as player1_name, p2.username as player2_name
        FROM games g
        LEFT JOIN players p1 ON p1.user_id = g.player1_id
        LEFT JOIN players p2 ON p2.user_id = g.player2_id
        WHERE g.game_id = ? AND (g.account_id = ?${userClause})
        ORDER BY g.created_at DESC
        LIMIT 1
    `).get(...gameParams);
    if (!game) return null;

    const turns = db.prepare(
        `SELECT id, game_id, games_row_id, user_id, turn_number, turn_type, score,
                words_played, word_scores, tiles_placed, placed_tiles_json, formed_words_json, created_at
         FROM turns
         WHERE games_row_id = ?
         ORDER BY turn_number ASC`
    ).all(game.id).map(normalizeTurnRow);

    const snapshotClause = userIds.length
        ? `account_id = ? OR user_id IN (${userIds.map(() => '?').join(',')})`
        : `account_id = ?`;
    const snapshotParams = [game.id, accountId, ...userIds];
    const snapshotForAccount = db.prepare(
        `SELECT user_id, state_json, updated_at
         FROM game_state_snapshots
         WHERE games_row_id = ? AND (${snapshotClause})
         ORDER BY
            CASE WHEN account_id = ? THEN 0 ELSE 1 END,
            updated_at DESC
         LIMIT 1`
    ).get(...snapshotParams, accountId);

    const latestSnapshot = db.prepare(
        `SELECT user_id, state_json, updated_at
         FROM game_state_snapshots
         WHERE games_row_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
    ).get(game.id);

    return {
        game,
        turns,
        snapshotForUser: snapshotForAccount
            ? {
                userId: snapshotForAccount.user_id,
                updatedAt: snapshotForAccount.updated_at,
                state: parseJsonSafe(snapshotForAccount.state_json),
            }
            : null,
        latestSnapshot: latestSnapshot
            ? {
                userId: latestSnapshot.user_id,
                updatedAt: latestSnapshot.updated_at,
                state: parseJsonSafe(latestSnapshot.state_json),
            }
            : null,
    };
}

function saveGameStateSnapshot({ gameId, userId, accountId = null, state }) {
    if (!gameId || typeof gameId !== 'string') {
        console.log('[analytics snapshot] invalid gameId', { gameId, userId });
        return false;
    }
    if (!userId || typeof userId !== 'string') {
        console.log('[analytics snapshot] invalid userId', { gameId, userId });
        return false;
    }
    if (!state || typeof state !== 'object') {
        console.log('[analytics snapshot] invalid state payload', { gameId, userId });
        return false;
    }

    let stateJson;
    try {
        stateJson = JSON.stringify(state);
    } catch {
        console.log('[analytics snapshot] state stringify failed', { gameId, userId });
        return false;
    }

    const activeRowId = activeGames.get(gameId);
    let rowId = activeRowId || null;
    if (!rowId) {
        const row = db.prepare(`
            SELECT id
            FROM games
            WHERE game_id = ?
            ORDER BY
                CASE WHEN ended_at IS NULL THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 1
        `).get(gameId);
        rowId = row?.id || null;
    }
    if (!rowId) {
        console.log('[analytics snapshot] no game row found', { gameId, userId });
        return false;
    }

    db.prepare(`
        INSERT INTO game_state_snapshots (game_id, games_row_id, user_id, account_id, state_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(games_row_id, user_id)
        DO UPDATE SET
            game_id = excluded.game_id,
            account_id = COALESCE(excluded.account_id, game_state_snapshots.account_id),
            state_json = excluded.state_json,
            updated_at = datetime('now')
    `).run(gameId, rowId, userId, accountId, stateJson);

    return true;
}

function getVisitsPerDay(days = 30) {
    return db.prepare(
        `SELECT date(created_at) as day, COUNT(*) as count
         FROM visits
         WHERE created_at >= datetime('now', ?)
         GROUP BY day ORDER BY day DESC`
    ).all(`-${days} days`);
}

function getVisitsByCountry(days = 30, limit = 20) {
    return db.prepare(
        `SELECT
            COALESCE(country_code, 'UNK') as countryCode,
            COALESCE(country, 'Unknown') as country,
            COUNT(*) as count
         FROM visits
         WHERE created_at >= datetime('now', ?)
         GROUP BY countryCode, country
         ORDER BY count DESC
         LIMIT ?`
    ).all(`-${days} days`, limit);
}

function getPlayersByCountry(limit = 20) {
    return db.prepare(
        `SELECT
            COALESCE(last_country_code, 'UNK') as countryCode,
            COALESCE(last_country, 'Unknown') as country,
            COUNT(*) as count
         FROM players
         GROUP BY countryCode, country
         ORDER BY count DESC
         LIMIT ?`
    ).all(limit);
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

function getAdminSummary() {
    const baseStats = getStats();
    const gameStats = db.prepare(`
        SELECT
            COALESCE(AVG(total_turns), 0) as avgTurnsPerGame,
            COALESCE(AVG(player1_score + player2_score), 0) as avgCombinedScorePerGame
        FROM games
    `).get();
    const activePlayers30d = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM visits
        WHERE user_id IS NOT NULL AND created_at >= datetime('now', '-30 days')
    `).get().count;
    const turnTypeBreakdown = db.prepare(`
        SELECT turn_type as turnType, COUNT(*) as count
        FROM turns
        GROUP BY turn_type
        ORDER BY count DESC
    `).all();
    const topVisitCountries = getVisitsByCountry(30, 5);

    return {
        ...baseStats,
        activePlayers30d,
        avgTurnsPerGame: Number(gameStats.avgTurnsPerGame || 0),
        avgCombinedScorePerGame: Number(gameStats.avgCombinedScorePerGame || 0),
        completionRate: baseStats.totalGames > 0
            ? Number(((baseStats.completedGames * 100) / baseStats.totalGames).toFixed(1))
            : 0,
        turnTypeBreakdown,
        topVisitCountries,
    };
}

function getPlayers(limit = 20, offset = 0, query = '') {
    const hasQuery = typeof query === 'string' && query.trim().length > 0;
    const like = `%${query.trim()}%`;
    const whereClause = hasQuery
        ? `WHERE (user_id LIKE ? OR username LIKE ?)`
        : '';
    const total = hasQuery
        ? db.prepare(`SELECT COUNT(*) as count FROM players ${whereClause}`).get(like, like).count
        : db.prepare('SELECT COUNT(*) as count FROM players').get().count;
    const items = hasQuery
        ? db.prepare(`
            SELECT
                user_id as userId,
                username,
                rating,
                games_played as gamesPlayed,
                wins,
                losses,
                draws,
                total_score as totalScore,
                last_country_code as lastCountryCode,
                last_country as lastCountry,
                last_region as lastRegion,
                last_city as lastCity,
                last_seen_at as lastSeenAt,
                created_at as createdAt,
                updated_at as updatedAt
            FROM players
            ${whereClause}
            ORDER BY rating DESC, wins DESC, total_score DESC
            LIMIT ? OFFSET ?
        `).all(like, like, limit, offset)
        : db.prepare(`
            SELECT
                user_id as userId,
                username,
                rating,
                games_played as gamesPlayed,
                wins,
                losses,
                draws,
                total_score as totalScore,
                last_country_code as lastCountryCode,
                last_country as lastCountry,
                last_region as lastRegion,
                last_city as lastCity,
                last_seen_at as lastSeenAt,
                created_at as createdAt,
                updated_at as updatedAt
            FROM players
            ORDER BY rating DESC, wins DESC, total_score DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

    return { items, total, limit, offset };
}

function getPlayerDetail(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const profile = db.prepare(`
        SELECT
            user_id as userId,
            username,
            rating,
            games_played as gamesPlayed,
            wins,
            losses,
            draws,
            total_score as totalScore,
            last_country_code as lastCountryCode,
            last_country as lastCountry,
            last_region as lastRegion,
            last_city as lastCity,
            last_seen_at as lastSeenAt,
            created_at as createdAt,
            updated_at as updatedAt
        FROM players
        WHERE user_id = ?
    `).get(userId);
    if (!profile) return null;

    const recentGames = db.prepare(`
        SELECT g.*, p1.username as player1_name, p2.username as player2_name
        FROM games g
        LEFT JOIN players p1 ON p1.user_id = g.player1_id
        LEFT JOIN players p2 ON p2.user_id = g.player2_id
        WHERE g.player1_id = ? OR g.player2_id = ?
        ORDER BY g.created_at DESC
        LIMIT 20
    `).all(userId, userId);

    const recentTurns = db.prepare(`
        SELECT id, game_id, games_row_id, user_id, turn_number, turn_type, score,
               words_played, word_scores, tiles_placed, placed_tiles_json, formed_words_json, created_at
        FROM turns
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
    `).all(userId).map(normalizeTurnRow);

    return { profile, recentGames, recentTurns };
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
    claimUniqueUsernameOrSuggest,
    claimUniqueAccountUsernameOrSuggest,
    getPlayerProfile,
    getDisplayName,
    getPlayerLastCountryCode,
    getAccountByEmail,
    getAccountById,
    getAccountProfile,
    createAccountWithProfile,
    linkAccountToPlayer,
    getLinkedPlayerUserIds,
    updateAccountProfileUsername,
    createAccountSession,
    findAccountSessionById,
    rotateAccountSession,
    revokeAccountSession,
    createEmailVerificationToken,
    consumeEmailVerificationToken,
    createPasswordResetToken,
    consumePasswordResetToken,
    markAccountEmailVerified,
    updateAccountPasswordHash,
    startGame,
    ensureGameSession,
    setPlayer2,
    getActiveGameRowId,
    recordTurn,
    endGame,
    getStats,
    getRecentGames,
    getGameDetail,
    getUserGames,
    getAccountGames,
    getUserGameDetail,
    getAccountGameDetail,
    saveGameStateSnapshot,
    getVisitsPerDay,
    getVisitsByCountry,
    getPlayersByCountry,
    getLeaderboard,
    getAdminSummary,
    getPlayers,
    getPlayerDetail,
    close,
};
