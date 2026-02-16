/**
 * Client-side Tamil orthography shortcuts used only for server-fallback paths.
 *
 * These checks are intentionally conservative:
 * - They reject only patterns that are high-confidence invalid for this game corpus.
 * - Dictionary hits are still accepted before this utility is consulted.
 */

const TAMIL_PUNCT_OR_MARKS = new Set([
    '\u0BCD', // pulli (virama)
    '\u0BBE', // aa
    '\u0BBF', // i
    '\u0BC0', // ii
    '\u0BC1', // u
    '\u0BC2', // uu
    '\u0BC6', // e
    '\u0BC7', // ee
    '\u0BC8', // ai
    '\u0BCA', // o
    '\u0BCB', // oo
    '\u0BCC', // au
    '\u0BD7', // au length mark
]);

// Base letters that are not valid word starts for server-fallback candidates.
// This is restricted to high-confidence non-starters observed from current
// dictionary + FST lexicon audits.
const DISALLOWED_INITIAL_BASES = new Set(['ங', 'ன', 'ற', 'ழ', 'ள']);

export const ORTHOGRAPHY_INVALID_REASON = Object.freeze({
    EMPTY: 'empty',
    STARTS_WITH_MARK: 'starts_with_mark',
    STARTS_WITH_DISALLOWED_BASE: 'starts_with_disallowed_base',
});

/**
 * Returns `{ invalid, reason }` for conservative client-side shortcut checks.
 * Should be used only after local dictionary miss.
 */
export function getTamilOrthographyInvalidReason(word) {
    if (typeof word !== 'string' || word.length === 0) {
        return { invalid: true, reason: ORTHOGRAPHY_INVALID_REASON.EMPTY };
    }

    const first = word[0];
    if (TAMIL_PUNCT_OR_MARKS.has(first)) {
        return { invalid: true, reason: ORTHOGRAPHY_INVALID_REASON.STARTS_WITH_MARK };
    }

    if (DISALLOWED_INITIAL_BASES.has(first)) {
        return { invalid: true, reason: ORTHOGRAPHY_INVALID_REASON.STARTS_WITH_DISALLOWED_BASE };
    }

    return { invalid: false, reason: null };
}

export function isTamilOrthographyDefinitelyInvalid(word) {
    return getTamilOrthographyInvalidReason(word).invalid;
}
