const crypto = require('crypto');
const http = require('http');
const https = require('https');

const GEO_PROVIDER = String(process.env.GEO_PROVIDER || 'none').toLowerCase();
const GEO_LOOKUP_TIMEOUT_MS = Math.max(100, Number(process.env.GEO_LOOKUP_TIMEOUT_MS || 800));
const GEO_CACHE_TTL_MS = Math.max(1000, Number(process.env.GEO_CACHE_TTL_MS || (24 * 60 * 60 * 1000)));
const GEO_IP_HASH_SALT = String(process.env.GEO_IP_HASH_SALT || '');

const geoCache = new Map();

function normalizeIp(input) {
    if (!input || typeof input !== 'string') return null;
    let ip = input.trim();
    if (!ip) return null;
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1') ip = '127.0.0.1';
    return ip;
}

function isPrivateIp(ip) {
    if (!ip) return true;
    if (ip.includes(':')) {
        const lower = ip.toLowerCase();
        return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
    }

    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
}

function hashIp(ip) {
    const normalized = normalizeIp(ip);
    if (!normalized) return null;
    const data = `${GEO_IP_HASH_SALT}:${normalized}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

function requestJson(urlString, timeoutMs = GEO_LOOKUP_TIMEOUT_MS) {
    const isHttps = urlString.startsWith('https://');
    const lib = isHttps ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.get(urlString, { timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString();
                if (body.length > 1024 * 1024) {
                    req.destroy(new Error('Geo response too large'));
                }
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Geo HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch {
                    reject(new Error('Geo JSON parse failed'));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Geo timeout')));
        req.on('error', reject);
    });
}

function sanitizeGeo(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 120) : null;
}

async function resolveViaIpwhoIs(ip) {
    const payload = await requestJson(
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,region,city,timezone`
    );
    if (!payload || payload.success !== true) return null;
    const timezone = typeof payload.timezone === 'string'
        ? payload.timezone
        : payload.timezone?.id;
    return {
        countryCode: sanitizeGeo(payload.country_code),
        country: sanitizeGeo(payload.country),
        region: sanitizeGeo(payload.region),
        city: sanitizeGeo(payload.city),
        timezone: sanitizeGeo(timezone),
        source: 'ipwho.is',
    };
}

async function resolveViaIpApi(ip) {
    const payload = await requestJson(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,timezone`
    );
    if (!payload || payload.status !== 'success') return null;
    return {
        countryCode: sanitizeGeo(payload.countryCode),
        country: sanitizeGeo(payload.country),
        region: sanitizeGeo(payload.regionName),
        city: sanitizeGeo(payload.city),
        timezone: sanitizeGeo(payload.timezone),
        source: 'ip-api.com',
    };
}

async function lookupGeo(ip) {
    if (GEO_PROVIDER === 'ipwhois') return resolveViaIpwhoIs(ip);
    if (GEO_PROVIDER === 'ipapi') return resolveViaIpApi(ip);
    return null;
}

async function resolveGeoForIp(ipInput) {
    const ip = normalizeIp(ipInput);
    if (!ip || isPrivateIp(ip) || GEO_PROVIDER === 'none') return null;

    const now = Date.now();
    const cached = geoCache.get(ip);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    try {
        const geo = await lookupGeo(ip);
        geoCache.set(ip, {
            value: geo || null,
            expiresAt: now + GEO_CACHE_TTL_MS,
        });
        return geo || null;
    } catch {
        geoCache.set(ip, {
            value: null,
            expiresAt: now + Math.min(GEO_CACHE_TTL_MS, 60 * 1000),
        });
        return null;
    }
}

module.exports = {
    normalizeIp,
    hashIp,
    resolveGeoForIp,
};
