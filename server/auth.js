const crypto = require('crypto');
const argon2 = require('argon2');

const ACCESS_TTL_MINUTES = Math.max(1, Number(process.env.AUTH_ACCESS_TTL_MINUTES || 15));
const REFRESH_TTL_DAYS = Math.max(1, Number(process.env.AUTH_REFRESH_TTL_DAYS || 30));
const ACCESS_SECRET = process.env.AUTH_ACCESS_TOKEN_SECRET || '';
const REFRESH_SECRET = process.env.AUTH_REFRESH_TOKEN_SECRET || '';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'solmaalai_rt';
const COOKIE_SECURE = String(process.env.AUTH_COOKIE_SECURE || '').toLowerCase() === 'true';
const APP_BASE_URL = process.env.APP_BASE_URL || '';
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';

const loginAttempts = new Map();

function isAuthEnabled() {
    return AUTH_ENABLED && Boolean(ACCESS_SECRET) && Boolean(REFRESH_SECRET);
}

function normalizeEmail(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.length > 254) return null;
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicEmailRegex.test(normalized)) return null;
    return normalized;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashFingerprint(input) {
    if (!input) return null;
    return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function generateId() {
    return crypto.randomUUID();
}

function randomToken() {
    return crypto.randomBytes(32).toString('hex');
}

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(value) {
    const normalized = String(value)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(signingInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    return `${signingInput}.${signature}`;
}

function verifySignedToken(token, secret) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, receivedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signingInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const a = Buffer.from(receivedSignature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        return payload && typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
}

async function hashPassword(password) {
    const clean = typeof password === 'string' ? password : '';
    if (clean.length < 8 || clean.length > 200) return null;
    return argon2.hash(clean, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
    });
}

async function verifyPassword(password, hash) {
    if (typeof password !== 'string' || typeof hash !== 'string' || !hash) return false;
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

function parseCookies(req) {
    const raw = req.headers.cookie;
    const result = {};
    if (!raw || typeof raw !== 'string') return result;
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) continue;
        result[key] = decodeURIComponent(value);
    }
    return result;
}

function getRefreshCookieFromReq(req) {
    const cookies = parseCookies(req);
    return cookies[COOKIE_NAME] || null;
}

function buildRefreshCookie(token, expiresAt) {
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Expires=${new Date(expiresAt).toUTCString()}`,
    ];
    if (COOKIE_SECURE) parts.push('Secure');
    return parts.join('; ');
}

function buildRefreshCookieClear() {
    const parts = [
        `${COOKIE_NAME}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0',
    ];
    if (COOKIE_SECURE) parts.push('Secure');
    return parts.join('; ');
}

function issueAccessToken({ accountId, email, sessionId }) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (ACCESS_TTL_MINUTES * 60);
    return signPayload({
        sub: accountId,
        email,
        sid: sessionId,
        typ: 'access',
        iat: now,
        exp,
        aud: APP_BASE_URL || 'solmaalai',
    }, ACCESS_SECRET);
}

function issueRefreshToken({ accountId, sessionId }) {
    const raw = `${accountId}.${sessionId}.${randomToken()}`;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (REFRESH_TTL_DAYS * 24 * 60 * 60);
    const signed = signPayload({
        sub: accountId,
        sid: sessionId,
        typ: 'refresh',
        iat: now,
        exp,
    }, REFRESH_SECRET + raw.slice(0, 24));
    return `${raw}.${signed}`;
}

function verifyAccessToken(token) {
    const payload = verifySignedToken(token, ACCESS_SECRET);
    if (!payload || payload.typ !== 'access') return null;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    return {
        accountId: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
        exp: payload.exp,
    };
}

function verifyRefreshToken(token) {
    if (typeof token !== 'string') return null;
    const firstDot = token.indexOf('.');
    const secondDot = token.indexOf('.', firstDot + 1);
    const thirdDot = token.indexOf('.', secondDot + 1);
    if (firstDot <= 0 || secondDot <= firstDot || thirdDot <= secondDot) return null;

    const rawPrefix = token.slice(0, thirdDot);
    const signed = token.slice(thirdDot + 1);
    const parts = rawPrefix.split('.');
    if (parts.length !== 3) return null;
    const accountId = parts[0];
    const sessionId = parts[1];

    const payload = verifySignedToken(signed, REFRESH_SECRET + rawPrefix.slice(0, 24));
    if (!payload || payload.typ !== 'refresh') return null;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (payload.sub !== accountId || payload.sid !== sessionId) return null;

    return {
        accountId,
        sessionId,
        tokenHash: hashToken(token),
        exp: payload.exp,
    };
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string') return null;
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
}

function getClientMeta(req) {
    const forwardedRaw = req.headers['x-forwarded-for'];
    const forwarded = typeof forwardedRaw === 'string'
        ? forwardedRaw.split(',')[0].trim()
        : null;
    const ip = forwarded || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return {
        ipHash: hashFingerprint(ip),
        userAgentHash: hashFingerprint(ua),
    };
}

function isRateLimited(key, limit = 10, windowMs = 60_000) {
    const now = Date.now();
    const state = loginAttempts.get(key) || [];
    const fresh = state.filter((t) => (now - t) < windowMs);
    if (fresh.length >= limit) {
        loginAttempts.set(key, fresh);
        return true;
    }
    fresh.push(now);
    loginAttempts.set(key, fresh);
    return false;
}

module.exports = {
    isAuthEnabled,
    normalizeEmail,
    hashPassword,
    verifyPassword,
    generateId,
    issueAccessToken,
    issueRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    getRefreshCookieFromReq,
    buildRefreshCookie,
    buildRefreshCookieClear,
    getBearerToken,
    getClientMeta,
    isRateLimited,
};
