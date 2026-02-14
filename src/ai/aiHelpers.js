/**
 * AI Helper utilities for the computer player.
 * Pure functions with no React dependencies.
 */

import { getDictionary } from '../utils/dictionary';

/**
 * Build a 15x15 grid from the board's playedTilesWithPositions.
 * grid[row][col] = tile object or null
 */
export function buildGrid(playedTilesWithPositions) {
    const grid = Array(15).fill(null).map(() => Array(15).fill(null));
    playedTilesWithPositions.forEach(t => {
        grid[t.row][t.col] = t.tile;
    });
    return grid;
}

/**
 * Find anchor squares on the board.
 * First move: return the starred squares.
 * Otherwise: empty squares orthogonally adjacent to at least one played tile.
 */
export function findAnchors(grid, isFirstMove) {
    const starredSquares = [[7, 7], [3, 3], [3, 11], [11, 3], [11, 11]];
    if (isFirstMove) {
        return starredSquares;
    }

    const anchorSet = new Set();
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            if (grid[r][c] !== null) continue; // occupied, skip
            // Check if any orthogonal neighbor is occupied
            if (
                (r > 0 && grid[r - 1][c] !== null) ||
                (r < 14 && grid[r + 1][c] !== null) ||
                (c > 0 && grid[r][c - 1] !== null) ||
                (c < 14 && grid[r][c + 1] !== null)
            ) {
                anchorSet.add(`${r},${c}`);
            }
        }
    }

    // Per game rules, an empty starred square is always a valid anchor, even after turn 1.
    for (const [r, c] of starredSquares) {
        if (grid[r][c] === null) {
            anchorSet.add(`${r},${c}`);
        }
    }

    return [...anchorSet].map(key => key.split(',').map(Number));
}

/**
 * Check if any word in the sorted dictionary starts with the given prefix.
 * Uses binary search for O(log n) performance.
 * Uses Unicode codepoint comparison (not localeCompare) to match dictionary sort order.
 */
export function hasPrefix(prefix) {
    const dictionary = getDictionary();
    if (!dictionary || dictionary.length === 0) return false;

    let lo = 0;
    let hi = dictionary.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const entry = dictionary[mid];

        if (entry.startsWith(prefix)) return true;
        if (entry < prefix) lo = mid + 1;
        else hi = mid - 1;
    }

    // Check the insertion point
    if (lo < dictionary.length && dictionary[lo].startsWith(prefix)) return true;
    return false;
}

/**
 * Check if a word exists in the dictionary. Binary search, O(log n).
 */
export function isWordValid(word) {
    const dictionary = getDictionary();
    if (!dictionary) return true; // permissive if not loaded

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
 * Count total tiles remaining in the letter bags.
 */
export function countBagTiles(letterBags) {
    const vowelCount = Object.values(letterBags.vowelsBag).reduce((sum, c) => sum + c, 0);
    const consonantCount = Object.values(letterBags.consonantsBag).reduce((sum, c) => sum + c, 0);
    const bonusCount = Object.values(letterBags.bonusBag).reduce((sum, c) => sum + c, 0);
    return vowelCount + consonantCount + bonusCount;
}

/**
 * Select the worst tiles from rack to swap (highest point, least useful).
 * Returns array of tile keys to swap.
 */
export function selectWorstTiles(rackTileKeys, count, TileSet) {
    // Score each tile: higher points = worse to keep
    const scored = rackTileKeys.map((key, idx) => ({
        key,
        idx,
        points: TileSet[key] ? TileSet[key].points : 0,
    }));
    scored.sort((a, b) => b.points - a.points);
    return scored.slice(0, count).map(s => s.key);
}

/**
 * Adaptive swap selector to avoid repeated dead-loop swaps.
 * Scores tiles by "replace value" (high points, duplicates, rack imbalance)
 * while trying to preserve bonus tiles and avoid repeating the same swap set.
 */
export function selectAdaptiveSwapTiles(rackTileKeys, count, TileSet, options = {}) {
    const {
        avoidSignatures = new Set(),
        maxCount = Math.min(5, rackTileKeys.length),
    } = options;

    if (!Array.isArray(rackTileKeys) || rackTileKeys.length === 0) return [];
    const cappedCount = Math.max(1, Math.min(count, maxCount, rackTileKeys.length));

    const typeCounts = rackTileKeys.reduce((acc, key) => {
        const tile = TileSet[key];
        const type = tile?.letterType || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    const keyCounts = rackTileKeys.reduce((acc, key) => {
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const scored = rackTileKeys.map((key, idx) => {
        const tile = TileSet[key];
        const points = tile?.points || 0;
        const letterType = tile?.letterType || 'UNKNOWN';
        const duplicates = (keyCounts[key] || 1) - 1;
        const isBonus = letterType === 'BONUS';

        let score = points * 2 + duplicates * 1.5;
        if (letterType === 'UYIR' && (typeCounts.UYIR || 0) > 7) score += 2;
        if (letterType === 'MEY' && (typeCounts.MEY || 0) > 7) score += 2;
        if (isBonus) score -= 6; // Keep wildcard unless rack is very poor.

        return { key, idx, score, points };
    }).sort((a, b) => b.score - a.score || b.points - a.points);

    // Build best candidate set first.
    const top = scored.slice(0, cappedCount).map(s => s.key);
    const signature = [...top].sort().join('|');
    if (!avoidSignatures.has(signature)) return top;

    // If that set was used recently, rotate in nearby candidates to diversify.
    const candidatePool = scored.slice(0, Math.min(scored.length, cappedCount + 4)).map(s => s.key);
    let best = top;
    for (let i = 0; i < candidatePool.length; i++) {
        const trial = [...top];
        const replacement = candidatePool[i];
        if (trial.includes(replacement)) continue;
        trial[trial.length - 1] = replacement;
        const trialSig = [...trial].sort().join('|');
        if (!avoidSignatures.has(trialSig)) {
            best = trial;
            break;
        }
    }

    return best;
}
