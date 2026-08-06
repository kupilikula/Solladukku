/**
 * Lazy FST-surface prefix index for the computer player.
 *
 * The Bloom filter can return false positives, which only cause extra search
 * branches. Final words are still accepted exclusively by the dictionary or
 * the server-side FST validator.
 */

const MAGIC = 'SMAIPF02';
const HEADER_SIZE = 24;
const INDEX_VERSION_OVERRIDE = process.env.REACT_APP_AI_PREFIX_INDEX_VERSION || '';

let prefixBits = null;
let prefixBitCount = 0;
let prefixHashCount = 0;
let wordBits = null;
let wordBitCount = 0;
let wordHashCount = 0;
let loadingPromise = null;
const CACHE_NAME = 'solmaalai-ai-assets-v1';

function hashPair(text) {
    const bytes = new TextEncoder().encode(text);
    let first = 2166136261;
    let second = (2166136261 ^ 0x9E3779B9) >>> 0;
    for (const byte of bytes) {
        first = Math.imul((first ^ byte) >>> 0, 16777619) >>> 0;
        second = Math.imul((second ^ byte) >>> 0, 16777619) >>> 0;
    }
    return [first, second | 1];
}

function bloomHas(bits, bitCount, hashCount, value) {
    if (!bits || !value) return false;
    const [first, second] = hashPair(value);
    for (let index = 0; index < hashCount; index++) {
        const bit = (first + Math.imul(index, second)) >>> 0;
        const boundedBit = bit % bitCount;
        if ((bits[boundedBit >>> 3] & (1 << (boundedBit & 7))) === 0) {
            return false;
        }
    }
    return true;
}

function hydrateAIPrefixIndex(buffer) {
    const source = ArrayBuffer.isView(buffer)
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        : buffer;
    if (!source || typeof source.byteLength !== 'number' || source.byteLength <= HEADER_SIZE) {
        throw new Error('AI prefix index payload is empty or truncated');
    }
    const header = new Uint8Array(source, 0, 8);
    const magic = new TextDecoder('ascii').decode(header);
    if (magic !== MAGIC) {
        throw new Error(`Unexpected AI prefix index format: ${magic}`);
    }

    const view = new DataView(source);
    const bitCount = view.getUint32(8, true);
    const hashCount = view.getUint8(12);
    const terminalBitCount = view.getUint32(16, true);
    const terminalHashCount = view.getUint8(20);
    const expectedSize = HEADER_SIZE + bitCount / 8 + terminalBitCount / 8;
    if (!bitCount || bitCount % 8 || !hashCount ||
        !terminalBitCount || terminalBitCount % 8 || !terminalHashCount ||
        source.byteLength !== expectedSize) {
        throw new Error('AI prefix index header does not match payload size');
    }

    prefixBitCount = bitCount;
    prefixHashCount = hashCount;
    prefixBits = new Uint8Array(source, HEADER_SIZE, bitCount / 8);
    wordBitCount = terminalBitCount;
    wordHashCount = terminalHashCount;
    wordBits = new Uint8Array(source, HEADER_SIZE + bitCount / 8);
}

export function loadAIPrefixIndex() {
    if (prefixBits) return Promise.resolve(true);
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        let version = INDEX_VERSION_OVERRIDE;
        if (!version) {
            try {
                const manifestResponse = await fetch('/tamil_ai_prefixes.manifest.json', {
                    cache: 'no-cache',
                });
                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();
                    version = manifest?.artifact_sha256 || '';
                }
            } catch (error) {
                console.warn('AI prefix manifest unavailable; using deployment cache headers:', error);
            }
        }
        const url = `/tamil_ai_prefixes.bloom${version ? `?v=${encodeURIComponent(version)}` : ''}`;
        let response = null;
        if (typeof window !== 'undefined' && 'caches' in window) {
            const cache = await window.caches.open(CACHE_NAME);
            response = await cache.match(url);
            if (!response) {
                response = await fetch(url);
                if (response.ok) await cache.put(url, response.clone());
            }
        } else {
            response = await fetch(url);
        }
        if (!response.ok) {
            throw new Error(`AI prefix index fetch failed: ${response.status}`);
        }
        hydrateAIPrefixIndex(await response.arrayBuffer());
        return true;
    })().catch((error) => {
        console.error('FST-aware AI prefix index unavailable; using headword prefixes only:', error);
        return false;
    }).finally(() => {
        loadingPromise = null;
    });

    return loadingPromise;
}

export function hasAIPrefix(prefix) {
    return bloomHas(prefixBits, prefixBitCount, prefixHashCount, prefix);
}

export function hasAIWord(word) {
    return bloomHas(wordBits, wordBitCount, wordHashCount, word);
}

export const __testing = {
    hydrateAIPrefixIndex,
    reset() {
        prefixBits = null;
        prefixBitCount = 0;
        prefixHashCount = 0;
        wordBits = null;
        wordBitCount = 0;
        wordHashCount = 0;
        loadingPromise = null;
    },
};
