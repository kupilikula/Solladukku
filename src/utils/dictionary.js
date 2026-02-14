import { getApiBaseUrl } from './runtimeUrls';

/**
 * Tamil dictionary for word validation.
 *
 * Loads public/tamil_dictionary.txt (sorted, one word per line) and provides
 * O(log n) lookup via binary search on a sorted array. This is more memory-
 * efficient than a Set for 1.7M+ entries.
 */

let dictionary = null;    // sorted string array once loaded
let loadingPromise = null; // dedup concurrent calls
let loadError = null;
const DICTIONARY_CACHE_VERSION = process.env.REACT_APP_DICTIONARY_CACHE_VERSION || '2026-02-14-1';
const DICT_DB_NAME = 'solmaalai-cache';
const DICT_DB_VERSION = 1;
const DICT_STORE_NAME = 'assets';
const DICT_CACHE_KEY = 'tamil_dictionary.txt';

function openDictionaryDb() {
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve(null);
    }
    return new Promise(resolve => {
        try {
            const request = window.indexedDB.open(DICT_DB_NAME, DICT_DB_VERSION);
            request.onerror = () => resolve(null);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(DICT_STORE_NAME)) {
                    db.createObjectStore(DICT_STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
        } catch (err) {
            console.warn('IndexedDB unavailable for dictionary cache:', err);
            resolve(null);
        }
    });
}

async function readCachedDictionaryRecord() {
    const db = await openDictionaryDb();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const tx = db.transaction(DICT_STORE_NAME, 'readonly');
            const store = tx.objectStore(DICT_STORE_NAME);
            const request = store.get(DICT_CACHE_KEY);
            request.onerror = () => {
                db.close();
                resolve(null);
            };
            request.onsuccess = () => {
                db.close();
                resolve(request.result || null);
            };
        } catch (err) {
            db.close();
            console.warn('Failed reading dictionary cache:', err);
            resolve(null);
        }
    });
}

async function writeCachedDictionaryRecord(record) {
    const db = await openDictionaryDb();
    if (!db) return false;
    return new Promise(resolve => {
        try {
            const tx = db.transaction(DICT_STORE_NAME, 'readwrite');
            const store = tx.objectStore(DICT_STORE_NAME);
            const request = store.put(record);
            request.onerror = () => {
                db.close();
                resolve(false);
            };
            request.onsuccess = () => {
                db.close();
                resolve(true);
            };
        } catch (err) {
            db.close();
            console.warn('Failed writing dictionary cache:', err);
            resolve(false);
        }
    });
}

function hydrateDictionary(text, sourceLabel) {
    const words = text.split('\n').filter(Boolean);
    if (words.length < 1000) {
        console.warn(`Dictionary too small (${words.length} entries) from ${sourceLabel} — likely an LFS pointer. Falling back to permissive mode.`);
        return false;
    }
    dictionary = words; // already sorted by build script
    console.log(`Dictionary loaded from ${sourceLabel}: ${dictionary.length} words`);
    return true;
}

/**
 * Load the dictionary file. Safe to call multiple times; subsequent calls
 * return the same promise.
 */
export function loadDictionary() {
    if (dictionary) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        let cachedRecord = null;
        try {
            try {
                cachedRecord = await readCachedDictionaryRecord();
                if (cachedRecord?.version === DICTIONARY_CACHE_VERSION && typeof cachedRecord.text === 'string') {
                    const loaded = hydrateDictionary(cachedRecord.text, 'IndexedDB cache');
                    if (loaded) return;
                }
            } catch (err) {
                console.warn('Dictionary cache read failed, falling back to network:', err);
            }

            const res = await fetch('/tamil_dictionary.txt');
            if (!res.ok) {
                throw new Error(`Dictionary fetch failed: ${res.status}`);
            }
            const text = await res.text();
            const loadedFromNetwork = hydrateDictionary(text, 'network');

            if (loadedFromNetwork) {
                const cached = await writeCachedDictionaryRecord({
                    key: DICT_CACHE_KEY,
                    version: DICTIONARY_CACHE_VERSION,
                    text,
                    cachedAt: Date.now(),
                });
                if (!cached) {
                    console.warn('Dictionary cache write skipped/failed.');
                }
                return;
            }

            if (cachedRecord?.text && hydrateDictionary(cachedRecord.text, 'stale IndexedDB cache')) {
                console.warn('Using stale cached dictionary because network payload was invalid.');
                return;
            }
        } catch (err) {
            if (cachedRecord?.text && hydrateDictionary(cachedRecord.text, 'stale IndexedDB cache')) {
                console.warn('Dictionary network load failed, using stale cached dictionary.');
                return;
            }
            throw err;
        }
    })().catch(err => {
        loadError = err;
        loadingPromise = null; // allow retry
        console.error('Failed to load dictionary:', err);
    });

    return loadingPromise;
}

export function isDictionaryLoaded() {
    return dictionary !== null;
}

export function getDictionary() {
    return dictionary;
}

export function getDictionaryError() {
    return loadError;
}

/**
 * Binary search on the sorted dictionary array.
 * Uses simple < / > comparison (Unicode codepoint order) to match
 * the Python sorted() order used by the build script.
 * Do NOT use localeCompare — locale-aware Tamil sort order differs
 * from codepoint order and breaks the binary search.
 */
function binarySearch(word) {
    let lo = 0;
    let hi = dictionary.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const entry = dictionary[mid];
        if (entry === word) return true;
        if (entry < word) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}

/**
 * Check if a word is in the dictionary.
 * Returns true if valid, false if invalid.
 * If dictionary hasn't loaded yet, returns true (permissive fallback).
 */
export function isValidWord(word) {
    if (!dictionary) return true; // don't block play if dictionary failed to load
    return binarySearch(word);
}

/**
 * Check multiple words at once (local dictionary only). Returns:
 *   { valid: boolean, invalidWords: string[] }
 */
export function validateWords(words) {
    if (!dictionary) return { valid: true, invalidWords: [] };
    const invalidWords = words.filter(w => !binarySearch(w));
    return { valid: invalidWords.length === 0, invalidWords };
}

// ─── Server-side FST validation with caching ─────────────────────────

// Session-level cache: Map<word, boolean> — same word is never re-queried
const serverValidationCache = new Map();

/**
 * Validate words that failed local dictionary lookup by asking the server.
 * Uses the WebSocket sendRequest() for request-response pattern.
 *
 * @param {string[]} words - Words to validate on the server
 * @param {function} sendRequest - WebSocketContext's sendRequest function
 * @returns {Promise<{ valid: boolean, invalidWords: string[] }>}
 */
export async function validateWordsWithServer(words, sendRequest) {
    if (!words || words.length === 0) {
        return { valid: true, invalidWords: [] };
    }

    // Check cache first — only send uncached words to server
    const uncachedWords = [];
    const cachedResults = {};

    for (const word of words) {
        if (serverValidationCache.has(word)) {
            cachedResults[word] = serverValidationCache.get(word);
        } else {
            uncachedWords.push(word);
        }
    }

    // If all words are cached, return immediately
    if (uncachedWords.length === 0) {
        const invalidWords = words.filter(w => !cachedResults[w]);
        return { valid: invalidWords.length === 0, invalidWords };
    }

    // Send uncached words to server for FST validation
    const serverResults = await sendRequest({
        messageType: 'validateWords',
        words: uncachedWords,
    });

    // If server returned null (timeout/disconnected), accept permissively
    if (!serverResults) {
        console.log('Server validation unavailable, accepting words permissively');
        for (const word of uncachedWords) {
            cachedResults[word] = true;
        }
    } else {
        // Cache and merge results
        for (const word of uncachedWords) {
            const isValid = serverResults[word] ?? true; // Permissive if missing
            serverValidationCache.set(word, isValid);
            cachedResults[word] = isValid;
        }
    }

    const invalidWords = words.filter(w => !cachedResults[w]);
    return { valid: invalidWords.length === 0, invalidWords };
}

/**
 * Validate words via HTTP API (for single-player / no WebSocket mode).
 * Uses the same session cache as WebSocket validation.
 *
 * @param {string[]} words - Words to validate on the server
 * @returns {Promise<{ valid: boolean, invalidWords: string[] }>}
 */
export async function validateWordsWithHttpServer(words) {
    if (!words || words.length === 0) {
        return { valid: true, invalidWords: [] };
    }

    const uncachedWords = [];
    const cachedResults = {};

    for (const word of words) {
        if (serverValidationCache.has(word)) {
            cachedResults[word] = serverValidationCache.get(word);
        } else {
            uncachedWords.push(word);
        }
    }

    if (uncachedWords.length === 0) {
        const invalidWords = words.filter(w => !cachedResults[w]);
        return { valid: invalidWords.length === 0, invalidWords };
    }

    let apiResults = null;
    try {
        const res = await fetch(getApiBaseUrl() + '/api/validate-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: uncachedWords }),
        });
        if (res.ok) {
            const data = await res.json();
            apiResults = data?.results || null;
        }
    } catch (err) {
        console.error('HTTP server validation unavailable, accepting words permissively:', err);
    }

    if (!apiResults) {
        for (const word of uncachedWords) {
            cachedResults[word] = true;
        }
    } else {
        for (const word of uncachedWords) {
            const isValid = apiResults[word] ?? true; // permissive if missing
            serverValidationCache.set(word, isValid);
            cachedResults[word] = isValid;
        }
    }

    const invalidWords = words.filter(w => !cachedResults[w]);
    return { valid: invalidWords.length === 0, invalidWords };
}
