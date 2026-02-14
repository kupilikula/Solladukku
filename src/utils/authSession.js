let accessToken = null;

export function setAuthSessionToken(token) {
    accessToken = token || null;
}

export function getAuthSessionToken() {
    return accessToken;
}
