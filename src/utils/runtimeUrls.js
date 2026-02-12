const LOCAL_DEV_PORTS = new Set(['3000', '5173', '4173']);

function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getLocalDevApiBaseUrl() {
    const { protocol, hostname, port } = window.location;
    if (!isLocalHost(hostname)) return null;
    if (!LOCAL_DEV_PORTS.has(port)) return null;
    return `${protocol}//${hostname}:8000`;
}

export function getApiBaseUrl() {
    return getLocalDevApiBaseUrl() || window.location.origin;
}

export function getWsBaseUrl() {
    const localApiBase = getLocalDevApiBaseUrl();
    if (localApiBase) {
        return localApiBase.replace(/^http(s?):\/\//, 'ws$1://');
    }
    return window.location.protocol === 'https:'
        ? `wss://${window.location.host}`
        : `ws://${window.location.host}`;
}
