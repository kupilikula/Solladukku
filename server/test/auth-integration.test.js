const assert = require('node:assert/strict');
const http = require('node:http');
const { test, before, after } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(__dirname, 'tmp-auth-integration.db');

let serverProc = null;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        try {
            const res = await requestJson({
                method: 'GET',
                path: '/health',
            });
            if (res.status === 200) return;
        } catch {
            // keep waiting
        }
        await sleep(200);
    }
    throw new Error('Timed out waiting for server to become ready');
}

function extractCookies(setCookieHeaders = []) {
    const jarUpdates = {};
    for (const header of setCookieHeaders) {
        if (typeof header !== 'string') continue;
        const [pair] = header.split(';');
        const eqIdx = pair.indexOf('=');
        if (eqIdx <= 0) continue;
        const name = pair.slice(0, eqIdx).trim();
        const value = pair.slice(eqIdx + 1).trim();
        jarUpdates[name] = value;
    }
    return jarUpdates;
}

function buildCookieHeader(cookieJar = {}) {
    return Object.entries(cookieJar)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

function requestJson({ method = 'GET', path: reqPath, body = null, headers = {}, cookieJar = null }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const requestHeaders = {
            ...headers,
        };
        if (payload) {
            requestHeaders['Content-Type'] = 'application/json';
            requestHeaders['Content-Length'] = Buffer.byteLength(payload);
        }
        if (cookieJar) {
            const cookieHeader = buildCookieHeader(cookieJar);
            if (cookieHeader) {
                requestHeaders.Cookie = cookieHeader;
            }
        }

        const req = http.request(
            `${BASE_URL}${reqPath}`,
            { method, headers: requestHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let data = null;
                    try {
                        data = raw ? JSON.parse(raw) : null;
                    } catch {
                        data = null;
                    }
                    const setCookieHeaders = res.headers['set-cookie'] || [];
                    if (cookieJar && Array.isArray(setCookieHeaders)) {
                        Object.assign(cookieJar, extractCookies(setCookieHeaders));
                    }
                    resolve({
                        status: res.statusCode || 0,
                        data,
                        headers: res.headers,
                        setCookieHeaders,
                    });
                });
            }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function makeUser(prefix) {
    const rand = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    return {
        email: `${prefix}-${rand}@example.com`,
        username: `${prefix}${String(Math.floor(Math.random() * 1e5)).slice(0, 5)}`,
        password: 'S3curePass!234',
        userId: `${prefix}-user-${Math.floor(Math.random() * 1e9)}`,
    };
}

async function signupAccount(user, cookieJar) {
    return requestJson({
        method: 'POST',
        path: '/api/auth/signup',
        cookieJar,
        body: {
            email: user.email,
            password: user.password,
            username: user.username,
            userId: user.userId,
        },
    });
}

function waitForWsClose(ws) {
    return new Promise((resolve) => {
        ws.on('close', (code, reasonBuffer) => {
            resolve({
                code,
                reason: reasonBuffer ? reasonBuffer.toString() : '',
            });
        });
    });
}

function waitForWsOpen(ws) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket open timeout')), 4000);
        ws.once('open', () => {
            clearTimeout(timeout);
            resolve();
        });
        ws.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

before(async () => {
    for (const suffix of ['', '-wal', '-shm']) {
        const target = `${DB_PATH}${suffix}`;
        if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    }
    serverProc = spawn('node', ['index.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(PORT),
            ANALYTICS_DB_PATH: DB_PATH,
            AUTH_ENABLED: 'true',
            GUEST_MODE_ENABLED: 'true',
            AUTH_ACCESS_TOKEN_SECRET: 'test-access-secret',
            AUTH_REFRESH_TOKEN_SECRET: 'test-refresh-secret',
            AUTH_COOKIE_SECURE: 'false',
            APP_BASE_URL: BASE_URL,
            ALLOWED_ORIGINS: '',
            STRICT_SERVER_VALIDATION: 'false',
            AUTH_CLEANUP_INTERVAL_MINUTES: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', () => {});
    await waitForServerReady();
});

after(async () => {
    if (serverProc && !serverProc.killed) {
        serverProc.kill('SIGINT');
        await new Promise((resolve) => serverProc.once('exit', resolve));
    }
    for (const suffix of ['', '-wal', '-shm']) {
        const target = `${DB_PATH}${suffix}`;
        if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    }
});

test('auth lifecycle enforces CSRF on refresh/logout and supports token rotation', async () => {
    const cookieJar = {};
    const user = makeUser('authflow');
    const signup = await signupAccount(user, cookieJar);
    assert.equal(signup.status, 200);
    assert.ok(signup.data?.accessToken);
    assert.ok(cookieJar.solmaalai_rt);
    assert.ok(cookieJar.solmaalai_csrf);

    const refreshWithoutCsrf = await requestJson({
        method: 'POST',
        path: '/api/auth/refresh',
        cookieJar,
    });
    assert.equal(refreshWithoutCsrf.status, 403);

    const refreshWithCsrf = await requestJson({
        method: 'POST',
        path: '/api/auth/refresh',
        cookieJar,
        headers: {
            'X-CSRF-Token': cookieJar.solmaalai_csrf,
        },
    });
    assert.equal(refreshWithCsrf.status, 200);
    assert.ok(refreshWithCsrf.data?.accessToken);
    assert.ok(cookieJar.solmaalai_rt);
    assert.ok(cookieJar.solmaalai_csrf);

    const logoutWithoutCsrf = await requestJson({
        method: 'POST',
        path: '/api/auth/logout',
        cookieJar,
    });
    assert.equal(logoutWithoutCsrf.status, 403);

    const logoutWithCsrf = await requestJson({
        method: 'POST',
        path: '/api/auth/logout',
        cookieJar,
        headers: {
            'X-CSRF-Token': cookieJar.solmaalai_csrf,
        },
    });
    assert.equal(logoutWithCsrf.status, 200);

    const refreshAfterLogout = await requestJson({
        method: 'POST',
        path: '/api/auth/refresh',
        cookieJar,
        headers: {
            'X-CSRF-Token': cookieJar.solmaalai_csrf || 'missing',
        },
    });
    assert.equal(refreshAfterLogout.status, 401);
});

test('api/games detail is account-authorized (owner allowed, non-owner forbidden)', async () => {
    const ownerJar = {};
    const owner = makeUser('owner');
    const ownerSignup = await signupAccount(owner, ownerJar);
    assert.equal(ownerSignup.status, 200);
    const ownerAccess = ownerSignup.data?.accessToken;
    assert.ok(ownerAccess);

    const gameId = `solo-${Math.random().toString(36).slice(2, 10)}`;
    const startSolo = await requestJson({
        method: 'POST',
        path: '/api/solo/start',
        headers: {
            Authorization: `Bearer ${ownerAccess}`,
        },
        body: {
            gameId,
            userId: owner.userId,
            username: owner.username,
        },
    });
    assert.equal(startSolo.status, 200);

    const ownerDetail = await requestJson({
        method: 'GET',
        path: `/api/games/${encodeURIComponent(gameId)}?userId=${encodeURIComponent(owner.userId)}`,
        headers: {
            Authorization: `Bearer ${ownerAccess}`,
        },
    });
    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.data?.game?.game_id, gameId);

    const otherJar = {};
    const other = makeUser('other');
    const otherSignup = await signupAccount(other, otherJar);
    assert.equal(otherSignup.status, 200);
    const otherAccess = otherSignup.data?.accessToken;

    const forbidden = await requestJson({
        method: 'GET',
        path: `/api/games/${encodeURIComponent(gameId)}?userId=${encodeURIComponent(other.userId)}`,
        headers: {
            Authorization: `Bearer ${otherAccess}`,
        },
    });
    assert.equal(forbidden.status, 403);
});

test('websocket rejects invalid/disabled auth and keeps room-full behavior', async () => {
    const invalidWs = new WebSocket(`ws://127.0.0.1:${PORT}/wsinvalid/u1?token=bad-token`);
    const invalidClose = await waitForWsClose(invalidWs);
    assert.equal(invalidClose.code, 4004);

    const disabledJar = {};
    const disabledUser = makeUser('disabled');
    const disabledSignup = await signupAccount(disabledUser, disabledJar);
    assert.equal(disabledSignup.status, 200);
    const disabledAccess = disabledSignup.data?.accessToken;
    assert.ok(disabledAccess);

    const db = new Database(DB_PATH);
    db.prepare(`UPDATE accounts SET status = 'disabled' WHERE email = ?`).run(disabledUser.email);
    db.close();

    const disabledWs = new WebSocket(`ws://127.0.0.1:${PORT}/wsdisabled/u2?token=${encodeURIComponent(disabledAccess)}`);
    const disabledClose = await waitForWsClose(disabledWs);
    assert.equal(disabledClose.code, 4005);

    const ws1 = new WebSocket(`ws://127.0.0.1:${PORT}/roomfull/p1`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/roomfull/p2`);
    await waitForWsOpen(ws1);
    await waitForWsOpen(ws2);

    const ws3 = new WebSocket(`ws://127.0.0.1:${PORT}/roomfull/p3`);
    const roomFullClose = await waitForWsClose(ws3);
    assert.equal(roomFullClose.code, 4001);

    ws1.close();
    ws2.close();
});
