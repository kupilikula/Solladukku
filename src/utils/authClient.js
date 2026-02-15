import { getApiBaseUrl } from './runtimeUrls';

let inFlightRefreshRequest = null;
let recentRefreshResult = null;
let recentRefreshAt = 0;
const RECENT_REFRESH_DEDUPE_MS = 5000;

async function readJsonSafe(resp) {
    try {
        return await resp.json();
    } catch {
        return null;
    }
}

function buildHeaders(accessToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const csrfToken = readCookie('solmaalai_csrf');
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    return headers;
}

function readCookie(name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|; )${escapedName}=([^;]*)`);
    const match = document.cookie.match(pattern);
    if (!match) return '';
    try {
        return decodeURIComponent(match[1] || '');
    } catch {
        return match[1] || '';
    }
}

export async function authRequest(path, { method = 'GET', body, accessToken } = {}) {
    const resp = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers: buildHeaders(accessToken),
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await readJsonSafe(resp);
    return { resp, data };
}

export async function signup({ email, password, username, userId }) {
    return authRequest('/api/auth/signup', {
        method: 'POST',
        body: { email, password, username, userId },
    });
}

export async function login({ email, password, userId }) {
    return authRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password, userId },
    });
}

export async function logout() {
    return authRequest('/api/auth/logout', { method: 'POST' });
}

export async function refreshSession() {
    const now = Date.now();
    if (recentRefreshResult && now - recentRefreshAt <= RECENT_REFRESH_DEDUPE_MS) {
        return recentRefreshResult;
    }
    if (inFlightRefreshRequest) {
        return inFlightRefreshRequest;
    }
    inFlightRefreshRequest = authRequest('/api/auth/refresh', { method: 'POST' })
        .then((result) => {
            recentRefreshResult = result;
            recentRefreshAt = Date.now();
            return result;
        })
        .finally(() => {
            inFlightRefreshRequest = null;
        });
    return inFlightRefreshRequest;
}

export async function getMe(accessToken) {
    return authRequest('/api/auth/me', {
        method: 'GET',
        accessToken,
    });
}

export async function verifyEmail({ token }) {
    return authRequest('/api/auth/verify-email', {
        method: 'POST',
        body: { token },
    });
}

export async function resendVerification(accessToken) {
    return authRequest('/api/auth/resend-verification', {
        method: 'POST',
        accessToken,
    });
}

export async function forgotPassword({ email }) {
    return authRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: { email },
    });
}

export async function resetPassword({ token, password }) {
    return authRequest('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password },
    });
}
