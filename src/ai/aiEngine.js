/**
 * AI Engine for single-player mode.
 * Anchor-based word generation with prefix pruning.
 * Pure JavaScript — no React dependencies.
 */

import { TileSet, TileMethods } from '../utils/TileSet';
import { squareMultipliers } from '../utils/squareMultipliers';
import { buildGrid, findAnchors, hasPrefix, isWordValid, countBagTiles, selectWorstTiles } from './aiHelpers';
import _ from 'lodash';

const STARRED_SQUARES = [[7, 7], [3, 3], [3, 11], [11, 3], [11, 11]];
const AI_DEV_LOG = process.env.NODE_ENV === 'development';
const EARLY_EXIT_SCORE_FIRST_MOVE = 24;
const EARLY_EXIT_SCORE_NORMAL = 34;
const ALL_NON_BONUS_LETTERS = [...new Set(
    Object.values(TileSet)
        .map(t => t?.letter)
        .filter(l => typeof l === 'string' && l.length > 0)
)];

function createDebugContext() {
    return {
        startedAt: Date.now(),
        anchors: 0,
        directions: 0,
        searchCalls: 0,
        prefixRejected: 0,
        crossRejectedAtPlacement: 0,
        candidateChecks: 0,
        rejectedShort: 0,
        rejectedMainWord: 0,
        rejectedFirstMoveNoStar: 0,
        rejectedMainWordAfterExtension: 0,
        rejectedCrossWordAfterPlacement: 0,
        acceptedCandidates: [],
        bestMoveUpdates: 0,
        timedOut: false,
        earlyExitTriggered: false,
        crossMaskRejected: 0,
    };
}

function pushAcceptedCandidate(debugCtx, candidate) {
    if (!debugCtx) return;
    debugCtx.acceptedCandidates.push(candidate);
    debugCtx.acceptedCandidates.sort((a, b) => b.score - a.score);
    if (debugCtx.acceptedCandidates.length > 8) {
        debugCtx.acceptedCandidates.length = 8;
    }
}

function getWordValidCached(word, aiCtx) {
    const cached = aiCtx.wordCache.get(word);
    if (cached !== undefined) return cached;
    const valid = isWordValid(word);
    aiCtx.wordCache.set(word, valid);
    return valid;
}

function hasPrefixCached(prefix, aiCtx) {
    const cached = aiCtx.prefixCache.get(prefix);
    if (cached !== undefined) return cached;
    const valid = hasPrefix(prefix);
    aiCtx.prefixCache.set(prefix, valid);
    return valid;
}

function getCachedTileCandidates(tileIdx, rackTiles, aiCtx) {
    let cached = aiCtx.tileCandidatesCache.get(tileIdx);
    if (!cached) {
        cached = buildTileCandidates(rackTiles[tileIdx], tileIdx, rackTiles);
        aiCtx.tileCandidatesCache.set(tileIdx, cached);
    }
    return cached;
}

function rankAnchor(grid, row, col) {
    const multiplier = squareMultipliers[row][col];
    let score = 0;
    if (multiplier === 'Word3') score += 9;
    else if (multiplier === 'Starred' || multiplier === 'Word2') score += 6;
    else if (multiplier === 'Letter3') score += 4;
    else if (multiplier === 'Letter2') score += 2;

    let occupiedNeighbors = 0;
    if (row > 0 && grid[row - 1][col] !== null) occupiedNeighbors++;
    if (row < 14 && grid[row + 1][col] !== null) occupiedNeighbors++;
    if (col > 0 && grid[row][col - 1] !== null) occupiedNeighbors++;
    if (col < 14 && grid[row][col + 1] !== null) occupiedNeighbors++;
    score += occupiedNeighbors * 3;

    return score;
}

function getCrossFragments(grid, row, col, direction) {
    let prefix = '';
    let suffix = '';
    let hasCross = false;

    if (direction === 'row') {
        let r = row - 1;
        const up = [];
        while (r >= 0 && grid[r][col] !== null) {
            up.push(getTileLetter(grid[r][col]));
            r--;
            hasCross = true;
        }
        up.reverse();
        prefix = up.join('');

        r = row + 1;
        const down = [];
        while (r < 15 && grid[r][col] !== null) {
            down.push(getTileLetter(grid[r][col]));
            r++;
            hasCross = true;
        }
        suffix = down.join('');
    } else {
        let c = col - 1;
        const left = [];
        while (c >= 0 && grid[row][c] !== null) {
            left.push(getTileLetter(grid[row][c]));
            c--;
            hasCross = true;
        }
        left.reverse();
        prefix = left.join('');

        c = col + 1;
        const right = [];
        while (c < 15 && grid[row][c] !== null) {
            right.push(getTileLetter(grid[row][c]));
            c++;
            hasCross = true;
        }
        suffix = right.join('');
    }

    return { hasCross, prefix, suffix };
}

function getCrossConstraintSet(grid, row, col, direction, aiCtx) {
    const key = `${direction}:${row},${col}`;
    if (aiCtx.crossCheckCache.has(key)) {
        return aiCtx.crossCheckCache.get(key);
    }

    const { hasCross, prefix, suffix } = getCrossFragments(grid, row, col, direction);
    if (!hasCross) {
        aiCtx.crossCheckCache.set(key, null);
        return null;
    }

    const allowed = new Set();
    for (const letter of aiCtx.letterUniverse) {
        if (getWordValidCached(prefix + letter + suffix, aiCtx)) {
            allowed.add(letter);
        }
    }

    aiCtx.crossCheckCache.set(key, allowed);
    return allowed;
}

function getBonusLettersForContext(prefix, crossSet, aiCtx) {
    const crossKey = crossSet ? [...crossSet].sort().join('|') : '*';
    const cacheKey = `${prefix}::${crossKey}`;
    const cached = aiCtx.bonusLetterOptionsCache.get(cacheKey);
    if (cached) return cached;

    const baseLetters = crossSet ? [...crossSet] : aiCtx.letterUniverse;
    const letters = baseLetters.filter(letter => hasPrefixCached(prefix + letter, aiCtx));
    aiCtx.bonusLetterOptionsCache.set(cacheKey, letters);
    return letters;
}

/**
 * Build tile objects from rack keys for the AI.
 */
function buildRackTiles(rackTileKeys) {
    return rackTileKeys.map(key => {
        const tile = TileSet[key];
        if (!tile) return null;
        return { ...tile };
    }).filter(Boolean);
}

/**
 * Calculate score for a set of formed words.
 * Matches the scoring logic from ActionMenu.js.
 */
function calculateTurnScore(formedWords) {
    let wordScores = [];
    let turnScore = 0;

    formedWords.forEach(w => {
        let wScore = 0;
        let wMultiplier = w
            .filter(t => !t.alreadyPlayed && ['Word2', 'Word3', 'Starred'].includes(squareMultipliers[t.row][t.col]))
            .map(t => squareMultipliers[t.row][t.col])
            .reduce((wM, m) => {
                if (m === 'Starred') return wM * 2;
                return wM * parseInt(m.slice(-1));
            }, 1);

        w.forEach(t => {
            let sM = squareMultipliers[t.row][t.col];
            let hasM = (!t.alreadyPlayed && ['Letter2', 'Letter3'].includes(sM));
            let lM = 1;
            if (hasM) {
                lM = parseInt(sM.slice(-1));
            }
            wScore += t.tile.points * lM;
        });

        let totalWordScore = wScore * wMultiplier;
        wordScores.push(totalWordScore);
        turnScore += totalWordScore;
    });

    return { turnScore, wordScores };
}

/**
 * Get the letter string from a tile.
 */
function getTileLetter(tile) {
    return tile.letter || '';
}

/**
 * Collect cross-word tiles at a position in the perpendicular direction.
 * direction is the MAIN word direction. Cross is perpendicular.
 * Returns array of {row, col, tile, alreadyPlayed} or null if no cross word formed.
 */
function getCrossWord(grid, row, col, direction, placedTile) {
    const crossTiles = [{ row, col, tile: placedTile, alreadyPlayed: false }];

    if (direction === 'row') {
        // Main word is horizontal, cross word is vertical
        let r = row - 1;
        while (r >= 0 && grid[r][col] !== null) {
            crossTiles.unshift({ row: r, col, tile: grid[r][col], alreadyPlayed: true });
            r--;
        }
        r = row + 1;
        while (r < 15 && grid[r][col] !== null) {
            crossTiles.push({ row: r, col, tile: grid[r][col], alreadyPlayed: true });
            r++;
        }
    } else {
        // Main word is vertical, cross word is horizontal
        let c = col - 1;
        while (c >= 0 && grid[row][c] !== null) {
            crossTiles.unshift({ row, col: c, tile: grid[row][c], alreadyPlayed: true });
            c--;
        }
        c = col + 1;
        while (c < 15 && grid[row][c] !== null) {
            crossTiles.push({ row, col: c, tile: grid[row][c], alreadyPlayed: true });
            c++;
        }
    }

    if (crossTiles.length < 2) return null;
    return crossTiles;
}

/**
 * Main AI move computation.
 */
export function computeAIMove(boardState, aiRackTileKeys, letterBags, aiUserId) {
    const startTime = Date.now();
    const TIME_LIMIT = 2500;
    const debugCtx = AI_DEV_LOG ? createDebugContext() : null;

    const grid = buildGrid(boardState.playedTilesWithPositions);
    const isFirstMove = boardState.playedTilesWithPositions.length === 0;
    const aiCtx = {
        prefixCache: new Map(),
        wordCache: new Map(),
        tileCandidatesCache: new Map(),
        crossCheckCache: new Map(),
        bonusLetterOptionsCache: new Map(),
        letterUniverse: [],
    };
    const anchors = findAnchors(grid, isFirstMove)
        .sort((a, b) => rankAnchor(grid, b[0], b[1]) - rankAnchor(grid, a[0], a[1]));
    if (debugCtx) {
        debugCtx.anchors = anchors.length;
    }

    const rackTiles = buildRackTiles(aiRackTileKeys);
    if (rackTiles.length === 0) {
        if (debugCtx) {
            console.log('[AI] pass: empty rack');
        }
        return { type: 'pass' };
    }
    aiCtx.letterUniverse = [...new Set(
        rackTiles.flatMap((_, idx) => {
            const cands = getCachedTileCandidates(idx, rackTiles, aiCtx);
            return cands
                .filter(c => !c.isBonusMarker)
                .map(c => c.tile.letter)
                .filter(Boolean);
        }).concat(ALL_NON_BONUS_LETTERS)
    )];

    let bestMove = null;
    const earlyExitScore = isFirstMove ? EARLY_EXIT_SCORE_FIRST_MOVE : EARLY_EXIT_SCORE_NORMAL;

    anchorLoop:
    for (const [anchorRow, anchorCol] of anchors) {
        if (Date.now() - startTime > TIME_LIMIT) {
            if (debugCtx) debugCtx.timedOut = true;
            break;
        }

        for (const direction of ['row', 'col']) {
            if (Date.now() - startTime > TIME_LIMIT) {
                if (debugCtx) debugCtx.timedOut = true;
                break;
            }
            if (debugCtx) debugCtx.directions += 1;

            const move = findBestMoveFromAnchor(
                grid, anchorRow, anchorCol, direction, rackTiles,
                isFirstMove, startTime, TIME_LIMIT, aiCtx, debugCtx
            );
            if (move && (!bestMove || move.score > bestMove.score)) {
                bestMove = move;
                if (debugCtx) debugCtx.bestMoveUpdates += 1;
                if (bestMove.score >= earlyExitScore) {
                    if (debugCtx) debugCtx.earlyExitTriggered = true;
                    break anchorLoop;
                }
            }
        }
    }

    if (bestMove) {
        if (debugCtx) {
            console.log('[AI] play summary', {
                elapsedMs: Date.now() - startTime,
                anchors: debugCtx.anchors,
                directionsTried: debugCtx.directions,
                searchCalls: debugCtx.searchCalls,
                prefixRejected: debugCtx.prefixRejected,
                crossRejectedAtPlacement: debugCtx.crossRejectedAtPlacement,
                candidateChecks: debugCtx.candidateChecks,
                rejectShort: debugCtx.rejectedShort,
                rejectMainWord: debugCtx.rejectedMainWord,
                rejectFirstMoveNoStar: debugCtx.rejectedFirstMoveNoStar,
                rejectMainWordAfterExtension: debugCtx.rejectedMainWordAfterExtension,
                rejectCrossWordAfterPlacement: debugCtx.rejectedCrossWordAfterPlacement,
                crossMaskRejected: debugCtx.crossMaskRejected,
                bestMoveUpdates: debugCtx.bestMoveUpdates,
                timedOut: debugCtx.timedOut,
                earlyExitTriggered: debugCtx.earlyExitTriggered,
                topCandidates: debugCtx.acceptedCandidates,
            });
        }
        return buildPlayResult(bestMove, aiUserId);
    }

    // No valid move found — try swapping
    const bagTileCount = countBagTiles(letterBags);
    if (bagTileCount >= 3) {
        if (debugCtx) {
            console.log('[AI] swap summary', {
                reason: 'no-valid-move',
                elapsedMs: Date.now() - startTime,
                timedOut: debugCtx.timedOut,
                candidateChecks: debugCtx.candidateChecks,
                prefixRejected: debugCtx.prefixRejected,
                crossRejectedAtPlacement: debugCtx.crossRejectedAtPlacement,
                crossMaskRejected: debugCtx.crossMaskRejected,
                rejectMainWord: debugCtx.rejectedMainWord,
                rejectMainWordAfterExtension: debugCtx.rejectedMainWordAfterExtension,
                rejectCrossWordAfterPlacement: debugCtx.rejectedCrossWordAfterPlacement,
                earlyExitTriggered: debugCtx.earlyExitTriggered,
                topCandidates: debugCtx.acceptedCandidates,
            });
        }
        const tilesToSwap = selectWorstTiles(aiRackTileKeys, Math.min(3, aiRackTileKeys.length), TileSet);
        const drawnTiles = drawFromBags(tilesToSwap.length, letterBags);
        return {
            type: 'swap',
            swapInfo: {
                originalReturnedTiles: tilesToSwap,
                drawnTiles,
            },
        };
    }

    if (debugCtx) {
        console.log('[AI] pass summary', {
            reason: 'no-valid-move-and-low-bag',
            elapsedMs: Date.now() - startTime,
            timedOut: debugCtx.timedOut,
            candidateChecks: debugCtx.candidateChecks,
            prefixRejected: debugCtx.prefixRejected,
            crossRejectedAtPlacement: debugCtx.crossRejectedAtPlacement,
            crossMaskRejected: debugCtx.crossMaskRejected,
            rejectMainWord: debugCtx.rejectedMainWord,
            rejectMainWordAfterExtension: debugCtx.rejectedMainWordAfterExtension,
            rejectCrossWordAfterPlacement: debugCtx.rejectedCrossWordAfterPlacement,
            earlyExitTriggered: debugCtx.earlyExitTriggered,
            topCandidates: debugCtx.acceptedCandidates,
        });
    }

    return { type: 'pass' };
}

/**
 * Draw N random tiles from bags.
 */
function drawFromBags(count, letterBags) {
    let pool = [];
    Object.keys(letterBags.vowelsBag).forEach(v => {
        pool = pool.concat(Array(letterBags.vowelsBag[v]).fill(v));
    });
    Object.keys(letterBags.consonantsBag).forEach(c => {
        pool = pool.concat(Array(letterBags.consonantsBag[c]).fill(c));
    });
    Object.keys(letterBags.bonusBag).forEach(b => {
        pool = pool.concat(Array(letterBags.bonusBag[b]).fill(b));
    });
    return _.sampleSize(pool, Math.min(count, pool.length));
}

/**
 * Find the best scoring move from a given anchor in a given direction.
 * direction: 'row' = horizontal, 'col' = vertical
 */
function findBestMoveFromAnchor(grid, anchorRow, anchorCol, direction, rackTiles, isFirstMove, startTime, timeLimit, aiCtx, debugCtx = null) {
    const isHorizontal = direction === 'row';
    const fixedLine = isHorizontal ? anchorRow : anchorCol;
    const anchorMain = isHorizontal ? anchorCol : anchorRow;

    // Find existing tiles immediately before the anchor (they form a fixed prefix)
    let prefixStart = anchorMain;
    while (prefixStart > 0) {
        const r = isHorizontal ? fixedLine : prefixStart - 1;
        const c = isHorizontal ? prefixStart - 1 : fixedLine;
        if (grid[r][c] !== null) {
            prefixStart--;
        } else {
            break;
        }
    }

    // If no fixed prefix, determine how far left we can extend with new tiles
    let maxExtend = 0;
    if (prefixStart === anchorMain) {
        let pos = anchorMain - 1;
        while (pos >= 0 && maxExtend < rackTiles.length - 1) {
            const r = isHorizontal ? fixedLine : pos;
            const c = isHorizontal ? pos : fixedLine;
            if (grid[r][c] !== null) break;
            // Don't extend past positions with perpendicular neighbors (other anchors)
            let hasCrossNeighbor = false;
            if (isHorizontal) {
                if ((fixedLine > 0 && grid[fixedLine - 1][pos] !== null) ||
                    (fixedLine < 14 && grid[fixedLine + 1][pos] !== null)) {
                    hasCrossNeighbor = true;
                }
            } else {
                if ((pos > 0 && grid[pos][fixedLine - 1] !== null) ||
                    (pos < 14 && grid[pos][fixedLine + 1] !== null)) {
                    hasCrossNeighbor = true;
                }
            }
            maxExtend++;
            pos--;
            if (hasCrossNeighbor) break;
        }
    }

    let bestMove = null;

    // Try starting positions closest to anchor first.
    // This finds short playable words quickly and avoids timeouts on huge branches.
    const earliestStart = prefixStart === anchorMain
        ? anchorMain - maxExtend
        : prefixStart;
    const startPositions = [];
    for (let startPos = anchorMain; startPos >= earliestStart; startPos--) {
        startPositions.push(startPos);
    }

    for (const startPos of startPositions) {
        if (Date.now() - startTime > timeLimit) break;

        const placements = [];
        const usedRackIndices = new Set();
        const currentWord = '';

        // Search from startPos, building the word forward
        searchFromPosition(
            grid, isHorizontal, fixedLine, startPos, anchorMain,
            rackTiles, usedRackIndices, placements, currentWord,
            isFirstMove, (move) => {
                if (!bestMove || move.score > bestMove.score) {
                    bestMove = move;
                }
            },
            startTime, timeLimit, aiCtx, debugCtx
        );
    }

    return bestMove;
}

/**
 * Recursive backtracking search for valid word placements.
 * Builds a word from position `pos` along the main axis.
 */
function searchFromPosition(
    grid, isHorizontal, fixedLine, pos, anchorPos,
    rackTiles, usedRackIndices, placements, currentWord,
    isFirstMove, onMoveFound, startTime, timeLimit, aiCtx, debugCtx = null
) {
    if (debugCtx) {
        debugCtx.searchCalls += 1;
    }
    if (pos >= 15) return;
    if (Date.now() - startTime > timeLimit) return;

    const r = isHorizontal ? fixedLine : pos;
    const c = isHorizontal ? pos : fixedLine;

    if (grid[r][c] !== null) {
        // Existing tile on board — append to word and continue
        const nextWord = currentWord + getTileLetter(grid[r][c]);
        if (hasPrefixCached(nextWord, aiCtx)) {
            // If we've passed/reached the anchor and placed at least one tile
            if (pos >= anchorPos && placements.length > 0) {
                tryRecordMove(grid, isHorizontal, fixedLine, placements, nextWord, isFirstMove, onMoveFound, aiCtx, debugCtx);
            }
            searchFromPosition(
                grid, isHorizontal, fixedLine, pos + 1, anchorPos,
                rackTiles, usedRackIndices, placements, nextWord,
                isFirstMove, onMoveFound, startTime, timeLimit, aiCtx, debugCtx
            );
        } else if (debugCtx) {
            debugCtx.prefixRejected += 1;
        }
        return;
    }

    // Empty square — try placing each available rack tile
    for (let i = 0; i < rackTiles.length; i++) {
        if (usedRackIndices.has(i)) continue;
        if (Date.now() - startTime > timeLimit) return;

        const candidates = getCachedTileCandidates(i, rackTiles, aiCtx);

        for (const candidate of candidates) {
            if (Date.now() - startTime > timeLimit) return;
            const { usedIndices } = candidate;
            if (usedIndices.some(idx => usedRackIndices.has(idx))) continue;

            const crossSet = getCrossConstraintSet(grid, r, c, isHorizontal ? 'row' : 'col', aiCtx);
            const letterOptions = candidate.isBonusMarker
                ? getBonusLettersForContext(currentWord, crossSet, aiCtx)
                : [candidate.tile.letter];

            for (const letter of letterOptions) {
                if (!letter) continue;
                if (crossSet && !crossSet.has(letter)) {
                    if (debugCtx) debugCtx.crossMaskRejected += 1;
                    continue;
                }

                const nextWord = currentWord + letter;
                if (hasPrefixCached(nextWord, aiCtx)) {
                    usedIndices.forEach(idx => usedRackIndices.add(idx));
                    const placedTile = candidate.isBonusMarker
                        ? { ...candidate.tile, letter, key: '?' }
                        : candidate.tile;
                    placements.push({ row: r, col: c, tile: placedTile, usedIndices: [...usedIndices] });

                    // If we've passed/reached the anchor, check for valid word
                    if (pos >= anchorPos) {
                        tryRecordMove(grid, isHorizontal, fixedLine, placements, nextWord, isFirstMove, onMoveFound, aiCtx, debugCtx);
                    }

                    // Continue extending rightward/downward
                    searchFromPosition(
                        grid, isHorizontal, fixedLine, pos + 1, anchorPos,
                        rackTiles, usedRackIndices, placements, nextWord,
                        isFirstMove, onMoveFound, startTime, timeLimit, aiCtx, debugCtx
                    );

                    placements.pop();
                    usedIndices.forEach(idx => usedRackIndices.delete(idx));
                } else if (debugCtx) {
                    debugCtx.prefixRejected += 1;
                }
            }
        }
    }
}

/**
 * Build candidate tile placements from a rack tile.
 * Handles MEY+UYIR merging and bonus tile letter choices.
 */
function buildTileCandidates(tile, tileIdx, rackTiles) {
    const candidates = [];

    if (tile.letterType === 'MEY') {
        // Place consonant directly
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx] });
        // Try merging with each available UYIR tile to form UYIRMEY
        for (let j = 0; j < rackTiles.length; j++) {
            if (j === tileIdx) continue;
            if (rackTiles[j].letterType === 'UYIR') {
                const merged = TileMethods.joinMeyTileAndUyirTile(tile, rackTiles[j]);
                candidates.push({ tile: merged, usedIndices: [tileIdx, j] });
            }
        }
    } else if (tile.letterType === 'UYIR') {
        // Place vowel directly
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx] });
        // Try merging with each available MEY tile to form UYIRMEY
        for (let j = 0; j < rackTiles.length; j++) {
            if (j === tileIdx) continue;
            if (rackTiles[j].letterType === 'MEY') {
                const merged = TileMethods.joinMeyTileAndUyirTile(rackTiles[j], tile);
                candidates.push({ tile: merged, usedIndices: [j, tileIdx] });
            }
        }
    } else if (tile.letterType === 'UYIRMEY') {
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx] });
    } else if (tile.letterType === 'BONUS') {
        // Bonus options are generated contextually during recursive search.
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx], isBonusMarker: true });
    }

    return candidates;
}

/**
 * Try to record a valid move from the current placements.
 */
function tryRecordMove(grid, isHorizontal, fixedLine, placements, currentWord, isFirstMove, onMoveFound, aiCtx, debugCtx = null) {
    if (placements.length === 0) return;
    if (debugCtx) {
        debugCtx.candidateChecks += 1;
    }

    const word = currentWord;
    if (word.length < 2) {
        if (debugCtx) debugCtx.rejectedShort += 1;
        return;
    }
    if (!getWordValidCached(word, aiCtx)) {
        if (debugCtx) debugCtx.rejectedMainWord += 1;
        return;
    }

    // Check placement rules:
    // - First move: must use a starred square
    // - Later moves: must touch existing tiles OR use a starred square
    const newlyPlayed = placements.map(p => ({ row: p.row, col: p.col, tile: p.tile }));
    const usesStarred = newlyPlayed.some(t =>
        STARRED_SQUARES.some(([sr, sc]) => t.row === sr && t.col === sc)
    );
    if (isFirstMove) {
        if (!usesStarred) {
            if (debugCtx) debugCtx.rejectedFirstMoveNoStar += 1;
            return;
        }
    } else {
        const touchesAlreadyPlayed = placements.some((p) => {
            const { row, col } = p;
            return (
                (row > 0 && grid[row - 1][col] !== null) ||
                (row < 14 && grid[row + 1][col] !== null) ||
                (col > 0 && grid[row][col - 1] !== null) ||
                (col < 14 && grid[row][col + 1] !== null)
            );
        });
        if (!touchesAlreadyPlayed && !usesStarred) {
            if (debugCtx) debugCtx.rejectedFirstMoveNoStar += 1;
            return;
        }
    }

    // Build all formed words for scoring
    const allFormedWords = [];
    const placementMap = new Map(placements.map(p => [`${p.row},${p.col}`, p]));

    // Build the full main word (extending to include adjacent existing tiles)
    let minPos = Infinity, maxPos = -Infinity;
    placements.forEach(p => {
        const pos = isHorizontal ? p.col : p.row;
        minPos = Math.min(minPos, pos);
        maxPos = Math.max(maxPos, pos);
    });

    // Extend backward to include existing tiles
    while (minPos > 0) {
        const r = isHorizontal ? fixedLine : minPos - 1;
        const c = isHorizontal ? minPos - 1 : fixedLine;
        if (grid[r][c] !== null) minPos--;
        else break;
    }

    // Extend forward to include existing tiles
    while (maxPos < 14) {
        const r = isHorizontal ? fixedLine : maxPos + 1;
        const c = isHorizontal ? maxPos + 1 : fixedLine;
        if (grid[r][c] !== null) maxPos++;
        else break;
    }

    // Build main word tile array
    const mainWord = [];
    for (let pos = minPos; pos <= maxPos; pos++) {
        const r = isHorizontal ? fixedLine : pos;
        const c = isHorizontal ? pos : fixedLine;
        const placement = placementMap.get(`${r},${c}`);
        if (placement) {
            mainWord.push({ row: r, col: c, tile: placement.tile, alreadyPlayed: false });
        } else if (grid[r][c] !== null) {
            mainWord.push({ row: r, col: c, tile: grid[r][c], alreadyPlayed: true });
        }
    }

    if (mainWord.length < 2) return;

    // Verify the full main word is valid
    const mainWordStr = mainWord.map(t => getTileLetter(t.tile)).join('');
    if (!getWordValidCached(mainWordStr, aiCtx)) {
        if (debugCtx) debugCtx.rejectedMainWordAfterExtension += 1;
        return;
    }
    allFormedWords.push(mainWord);

    // Collect cross words
    const mainDir = isHorizontal ? 'row' : 'col';
    for (const p of placements) {
        const crossWord = getCrossWord(grid, p.row, p.col, mainDir, p.tile);
        if (crossWord) {
            const crossWordStr = crossWord.map(t => getTileLetter(t.tile)).join('');
            if (!getWordValidCached(crossWordStr, aiCtx)) {
                if (debugCtx) debugCtx.rejectedCrossWordAfterPlacement += 1;
                return; // invalid cross word, abort entire move
            }
            allFormedWords.push(crossWord);
        }
    }

    const { turnScore, wordScores } = calculateTurnScore(allFormedWords);
    pushAcceptedCandidate(debugCtx, {
        score: turnScore,
        words: allFormedWords.map(w => w.map(t => getTileLetter(t.tile)).join('')),
        placements: placements.length,
    });

    onMoveFound({
        score: turnScore,
        placements: placements.map(p => ({ ...p })),
        formedWords: allFormedWords,
        wordScores,
    });
}

/**
 * Build the final play result from the best move found.
 */
function buildPlayResult(bestMove, aiUserId) {
    const newlyPlayedTilesWithPositions = bestMove.placements.map(p => ({
        row: p.row,
        col: p.col,
        tile: p.tile,
    }));

    // Collect unique rack indices used across all placements
    const usedRackIndices = [...new Set(bestMove.placements.flatMap(p => p.usedIndices || []))];

    return {
        type: 'play',
        turnInfo: {
            turnUserId: aiUserId,
            newlyPlayedTilesWithPositions,
            turnFormedWords: bestMove.formedWords,
            turnScore: bestMove.score,
            wordScores: bestMove.wordScores,
            usedRackIndices,
        },
    };
}
