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

/**
 * Load the dictionary file. Safe to call multiple times; subsequent calls
 * return the same promise.
 */
export function loadDictionary() {
    if (dictionary) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch('/tamil_dictionary.txt')
        .then(res => {
            if (!res.ok) throw new Error(`Dictionary fetch failed: ${res.status}`);
            return res.text();
        })
        .then(text => {
            const words = text.split('\n').filter(Boolean);
            if (words.length < 1000) {
                console.warn(`Dictionary too small (${words.length} entries) — likely an LFS pointer. Falling back to permissive mode.`);
                return; // leave dictionary as null → permissive fallback
            }
            dictionary = words; // already sorted by build script
            console.log(`Dictionary loaded: ${dictionary.length} words`);
        })
        .catch(err => {
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
            serverValidationCache.set(word, true);
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
