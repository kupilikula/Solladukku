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
 * Check if a cross word at this position would be valid.
 */
function isCrossWordValid(grid, row, col, direction, placedTile) {
    const crossWord = getCrossWord(grid, row, col, direction, placedTile);
    if (!crossWord) return true;
    const word = crossWord.map(t => getTileLetter(t.tile)).join('');
    return isWordValid(word);
}

/**
 * Main AI move computation.
 */
export function computeAIMove(boardState, aiRackTileKeys, letterBags, aiUserId) {
    const startTime = Date.now();
    const TIME_LIMIT = 2500;

    const grid = buildGrid(boardState.playedTilesWithPositions);
    const isFirstMove = boardState.playedTilesWithPositions.length === 0;
    const anchors = findAnchors(grid, isFirstMove);

    const rackTiles = buildRackTiles(aiRackTileKeys);
    if (rackTiles.length === 0) {
        return { type: 'pass' };
    }

    let bestMove = null;

    for (const [anchorRow, anchorCol] of anchors) {
        if (Date.now() - startTime > TIME_LIMIT && bestMove) break;

        for (const direction of ['row', 'col']) {
            if (Date.now() - startTime > TIME_LIMIT && bestMove) break;

            const move = findBestMoveFromAnchor(
                grid, anchorRow, anchorCol, direction, rackTiles,
                isFirstMove, startTime, TIME_LIMIT
            );
            if (move && (!bestMove || move.score > bestMove.score)) {
                bestMove = move;
            }
        }
    }

    if (bestMove) {
        return buildPlayResult(bestMove, aiUserId);
    }

    // No valid move found — try swapping
    const bagTileCount = countBagTiles(letterBags);
    if (bagTileCount >= 3) {
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
function findBestMoveFromAnchor(grid, anchorRow, anchorCol, direction, rackTiles, isFirstMove, startTime, timeLimit) {
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

    // Try different starting positions
    const earliestStart = prefixStart === anchorMain
        ? anchorMain - maxExtend
        : prefixStart;

    for (let startPos = earliestStart; startPos <= anchorMain; startPos++) {
        if (Date.now() - startTime > timeLimit && bestMove) break;

        const placements = [];
        const usedRackIndices = new Set();
        const currentLetters = [];

        // Search from startPos, building the word forward
        searchFromPosition(
            grid, isHorizontal, fixedLine, startPos, anchorMain,
            rackTiles, usedRackIndices, placements, currentLetters,
            isFirstMove, (move) => {
                if (!bestMove || move.score > bestMove.score) {
                    bestMove = move;
                }
            },
            startTime, timeLimit
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
    rackTiles, usedRackIndices, placements, currentLetters,
    isFirstMove, onMoveFound, startTime, timeLimit
) {
    if (pos >= 15) return;
    if (Date.now() - startTime > timeLimit) return;

    const r = isHorizontal ? fixedLine : pos;
    const c = isHorizontal ? pos : fixedLine;

    if (grid[r][c] !== null) {
        // Existing tile on board — add to word and continue
        currentLetters.push(getTileLetter(grid[r][c]));

        const prefix = currentLetters.join('');
        if (hasPrefix(prefix)) {
            // If we've passed/reached the anchor and placed at least one tile
            if (pos >= anchorPos && placements.length > 0) {
                tryRecordMove(grid, isHorizontal, fixedLine, placements, currentLetters, isFirstMove, onMoveFound);
            }
            searchFromPosition(
                grid, isHorizontal, fixedLine, pos + 1, anchorPos,
                rackTiles, usedRackIndices, placements, currentLetters,
                isFirstMove, onMoveFound, startTime, timeLimit
            );
        }

        currentLetters.pop();
        return;
    }

    // Empty square — try placing each available rack tile
    for (let i = 0; i < rackTiles.length; i++) {
        if (usedRackIndices.has(i)) continue;
        if (Date.now() - startTime > timeLimit) return;

        const tile = rackTiles[i];
        const candidates = buildTileCandidates(tile, i, rackTiles, usedRackIndices);

        for (const { tile: tryTile, usedIndices } of candidates) {
            if (Date.now() - startTime > timeLimit) return;

            const letter = getTileLetter(tryTile);
            if (!letter) continue;

            // Check cross word validity at this position
            if (!isCrossWordValid(grid, r, c, isHorizontal ? 'row' : 'col', tryTile)) {
                continue;
            }

            currentLetters.push(letter);
            const prefix = currentLetters.join('');

            if (hasPrefix(prefix)) {
                usedIndices.forEach(idx => usedRackIndices.add(idx));
                placements.push({ row: r, col: c, tile: tryTile, usedIndices: [...usedIndices] });

                // If we've passed/reached the anchor, check for valid word
                if (pos >= anchorPos) {
                    tryRecordMove(grid, isHorizontal, fixedLine, placements, currentLetters, isFirstMove, onMoveFound);
                }

                // Continue extending rightward/downward
                searchFromPosition(
                    grid, isHorizontal, fixedLine, pos + 1, anchorPos,
                    rackTiles, usedRackIndices, placements, currentLetters,
                    isFirstMove, onMoveFound, startTime, timeLimit
                );

                placements.pop();
                usedIndices.forEach(idx => usedRackIndices.delete(idx));
            }

            currentLetters.pop();
        }
    }
}

/**
 * Build candidate tile placements from a rack tile.
 * Handles MEY+UYIR merging and bonus tile letter choices.
 */
function buildTileCandidates(tile, tileIdx, rackTiles, usedRackIndices) {
    const candidates = [];

    if (tile.letterType === 'MEY') {
        // Place consonant directly
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx] });
        // Try merging with each available UYIR tile to form UYIRMEY
        for (let j = 0; j < rackTiles.length; j++) {
            if (j === tileIdx || usedRackIndices.has(j)) continue;
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
            if (j === tileIdx || usedRackIndices.has(j)) continue;
            if (rackTiles[j].letterType === 'MEY') {
                const merged = TileMethods.joinMeyTileAndUyirTile(rackTiles[j], tile);
                candidates.push({ tile: merged, usedIndices: [j, tileIdx] });
            }
        }
    } else if (tile.letterType === 'UYIRMEY') {
        candidates.push({ tile: { ...tile }, usedIndices: [tileIdx] });
    } else if (tile.letterType === 'BONUS') {
        // Try common Tamil letters with 0 points
        const commonLetters = [
            'அ', 'இ', 'உ', 'க', 'த', 'ப', 'ம', 'ர', 'ல', 'ன',
            'கா', 'தி', 'பு', 'மா', 'ரு', 'லி', 'னி', 'கு', 'தா', 'பா',
        ];
        for (const letter of commonLetters) {
            candidates.push({ tile: { ...tile, letter, key: '?' }, usedIndices: [tileIdx] });
        }
    }

    return candidates;
}

/**
 * Try to record a valid move from the current placements.
 */
function tryRecordMove(grid, isHorizontal, fixedLine, placements, currentLetters, isFirstMove, onMoveFound) {
    if (placements.length === 0) return;

    const word = currentLetters.join('');
    if (word.length < 2) return;
    if (!isWordValid(word)) return;

    // Check placement rules: must touch existing tile or use starred square
    const newlyPlayed = placements.map(p => ({ row: p.row, col: p.col, tile: p.tile }));
    if (isFirstMove) {
        const usesStarred = newlyPlayed.some(t =>
            STARRED_SQUARES.some(([sr, sc]) => t.row === sr && t.col === sc)
        );
        if (!usesStarred) return;
    }

    // Build all formed words for scoring
    const allFormedWords = [];

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
        const placement = placements.find(p => p.row === r && p.col === c);
        if (placement) {
            mainWord.push({ row: r, col: c, tile: placement.tile, alreadyPlayed: false });
        } else if (grid[r][c] !== null) {
            mainWord.push({ row: r, col: c, tile: grid[r][c], alreadyPlayed: true });
        }
    }

    if (mainWord.length < 2) return;

    // Verify the full main word is valid
    const mainWordStr = mainWord.map(t => getTileLetter(t.tile)).join('');
    if (!isWordValid(mainWordStr)) return;
    allFormedWords.push(mainWord);

    // Collect cross words
    const mainDir = isHorizontal ? 'row' : 'col';
    for (const p of placements) {
        const crossWord = getCrossWord(grid, p.row, p.col, mainDir, p.tile);
        if (crossWord) {
            const crossWordStr = crossWord.map(t => getTileLetter(t.tile)).join('');
            if (!isWordValid(crossWordStr)) return; // invalid cross word, abort entire move
            allFormedWords.push(crossWord);
        }
    }

    const { turnScore, wordScores } = calculateTurnScore(allFormedWords);

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
