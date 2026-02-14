import { getApiBaseUrl } from './runtimeUrls';

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
    return headers;
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

export async function login({ email, password }) {
    return authRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password },
    });
}

export async function logout() {
    return authRequest('/api/auth/logout', { method: 'POST' });
}

export async function refreshSession() {
    return authRequest('/api/auth/refresh', { method: 'POST' });
}

export async function getMe(accessToken) {
    return authRequest('/api/auth/me', {
        method: 'GET',
        accessToken,
    });
}
