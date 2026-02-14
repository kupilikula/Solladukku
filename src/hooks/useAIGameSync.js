import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { replenishRack, initializeNewGameState, addOtherPlayerTurn, setGameOver, syncOpponentDraw, syncPassTurn, syncSwapTiles } from '../store/actions';
import { addPlayers } from '../store/actions';
import { setGameMode } from '../store/GameSlice';
import { initialConsonantsBag, initialVowelsBag, initialBonusBag } from '../utils/initialLetterBags';
import { computeAIMove } from '../ai/aiEngine';
import { isDictionaryLoaded } from '../utils/dictionary';
import _ from 'lodash';

const AI_USER_ID = 'computer-player';

// Helper to draw tiles from bags (same as useGameSync / ActionMenu)
const fetchNLettersFromBags = (nLettersToFetch, letterBags) => {
    let V = [];
    Object.keys(letterBags.vowelsBag).forEach(v => {
        V = V.concat(Array(letterBags.vowelsBag[v]).fill(v));
    });
    let C = [];
    Object.keys(letterBags.consonantsBag).forEach(c => {
        C = C.concat(Array(letterBags.consonantsBag[c]).fill(c));
    });
    let B = [];
    Object.keys(letterBags.bonusBag).forEach(b => {
        B = B.concat(Array(letterBags.bonusBag[b]).fill(b));
    });
    let X = V.concat(C).concat(B);
    return _.sampleSize(X, Math.min(nLettersToFetch, X.length));
};

/**
 * Draw AI tiles from fresh bags after deducting the player's tiles.
 */
function drawAITiles(playerTileKeys, dispatch, aiRackRef) {
    const remainingBags = {
        consonantsBag: { ...initialConsonantsBag },
        vowelsBag: { ...initialVowelsBag },
        bonusBag: { ...initialBonusBag },
    };
    playerTileKeys.forEach(tileKey => {
        if (remainingBags.consonantsBag[tileKey] !== undefined) {
            remainingBags.consonantsBag[tileKey]--;
        } else if (remainingBags.vowelsBag[tileKey] !== undefined) {
            remainingBags.vowelsBag[tileKey]--;
        } else if (remainingBags.bonusBag[tileKey] !== undefined) {
            remainingBags.bonusBag[tileKey]--;
        }
    });

    const aiTileKeys = fetchNLettersFromBags(14, remainingBags);
    aiRackRef.current = aiTileKeys;
    dispatch(syncOpponentDraw({ drawnTiles: aiTileKeys }));
    return aiTileKeys;
}

export function useAIGameSync() {
    const dispatch = useDispatch();
    const store = useStore();
    const aiRackRef = useRef([]);
    const aiDecisionRef = useRef({
        recentSwapSignatures: [],
        consecutiveAISwaps: 0,
    });
    const initializedRef = useRef(false);
    const aiTurnTimeoutRef = useRef(null);
    const prevMyInitialDrawRef = useRef(null);

    const isMyTurn = useSelector(state => state.Game.isMyTurn);
    const gameStarted = useSelector(state => state.Game.gameStarted);
    const gameOver = useSelector(state => state.Game.gameOver);
    const consecutivePasses = useSelector(state => state.Game.consecutivePasses);
    const myUserId = useSelector(state => state.Game.userId);
    const myScore = useSelector(state => state.ScoreBoard.myTotalScore);
    const opponentScore = useSelector(state => state.ScoreBoard.otherPlayersTotalScores[0] || 0);
    const myInitialDraw = useSelector(state => state.Game.myInitialDraw);

    // Initialize game on mount
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        dispatch(initializeNewGameState());

        const freshBags = {
            consonantsBag: { ...initialConsonantsBag },
            vowelsBag: { ...initialVowelsBag },
            bonusBag: { ...initialBonusBag },
        };
        const playerTiles = fetchNLettersFromBags(14, freshBags);
        dispatch(replenishRack(playerTiles));

        const aiTileKeys = drawAITiles(playerTiles, dispatch, aiRackRef);
        aiDecisionRef.current = { recentSwapSignatures: [], consecutiveAISwaps: 0 };

        dispatch(addPlayers({ otherPlayerIds: [AI_USER_ID] }));
        dispatch(setGameMode('singleplayer'));

        // Track the initial draw to detect new games
        prevMyInitialDrawRef.current = playerTiles;

        console.log('Single player game initialized. Player tiles:', playerTiles, 'AI tiles:', aiTileKeys);
    }, [dispatch]);

    // Handle "New Game" from ActionMenu: when player starts a new game,
    // myInitialDraw changes — draw new AI tiles from the fresh bags
    useEffect(() => {
        if (!myInitialDraw) return;
        if (myInitialDraw === prevMyInitialDrawRef.current) return;
        prevMyInitialDrawRef.current = myInitialDraw;

        // Player started a new game — draw AI tiles from remaining bags
        const aiTileKeys = drawAITiles(myInitialDraw, dispatch, aiRackRef);
        aiDecisionRef.current = { recentSwapSignatures: [], consecutiveAISwaps: 0 };

        // Re-add computer as opponent (otherPlayerIds persists, but just in case)
        const state = store.getState();
        if (!state.Game.otherPlayerIds.includes(AI_USER_ID)) {
            dispatch(addPlayers({ otherPlayerIds: [AI_USER_ID] }));
        }

        console.log('New game: AI re-drew tiles:', aiTileKeys);
    }, [myInitialDraw, dispatch, store]);

    // Watch for consecutive passes reaching the threshold
    useEffect(() => {
        if (!gameOver && consecutivePasses >= 4) {
            const winner = myScore > opponentScore ? myUserId : (opponentScore > myScore ? 'opponent' : 'tie');
            dispatch(setGameOver({ winner, reason: 'consecutivePasses' }));
        }
    }, [consecutivePasses, gameOver, myScore, opponentScore, myUserId, dispatch]);

    const executeAITurn = useCallback(async () => {
        const state = store.getState();
        const boardState = state.WordBoard;
        const letterBags = state.LetterBags;
        const currentMyUserId = state.Game.userId;

        let result;
        try {
            result = await computeAIMove(
                boardState,
                aiRackRef.current,
                letterBags,
                AI_USER_ID,
                {
                    recentSwapSignatures: aiDecisionRef.current.recentSwapSignatures,
                    consecutiveAISwaps: aiDecisionRef.current.consecutiveAISwaps,
                    serverValidationEnabled: true,
                    timeLimitMs: 5000,
                }
            );
        } catch (err) {
            console.error('AI move computation failed, defaulting to pass:', err);
            dispatch(syncPassTurn());
            aiDecisionRef.current.consecutiveAISwaps = 0;
            return;
        }

        if (result.type === 'play') {
            const turnInfo = result.turnInfo;

            // Remove used tiles from AI rack by index (sorted descending to preserve indices)
            const usedIndices = [...turnInfo.usedRackIndices].sort((a, b) => b - a);
            const newRack = [...aiRackRef.current];
            usedIndices.forEach(idx => {
                newRack.splice(idx, 1);
            });

            // Draw replenishment tiles from current bags
            const currentBags = store.getState().LetterBags;
            const tilesNeeded = 14 - newRack.length;
            const drawnTiles = tilesNeeded > 0 ? fetchNLettersFromBags(tilesNeeded, currentBags) : [];
            newRack.push(...drawnTiles);
            aiRackRef.current = newRack;

            const cleanTurnInfo = {
                turnUserId: turnInfo.turnUserId,
                newlyPlayedTilesWithPositions: turnInfo.newlyPlayedTilesWithPositions,
                fetchedLettersFromBag: drawnTiles,
                turnFormedWords: turnInfo.turnFormedWords,
                turnScore: turnInfo.turnScore,
                wordScores: turnInfo.wordScores,
            };

            dispatch(addOtherPlayerTurn({ turnInfo: cleanTurnInfo }));
            aiDecisionRef.current.consecutiveAISwaps = 0;

            // Check for game end: bag empty + rack empty
            const bagsAfter = store.getState().LetterBags;
            const totalRemaining = Object.values(bagsAfter.vowelsBag).reduce((s, c) => s + c, 0)
                + Object.values(bagsAfter.consonantsBag).reduce((s, c) => s + c, 0)
                + Object.values(bagsAfter.bonusBag).reduce((s, c) => s + c, 0);
            if (totalRemaining <= 0 && aiRackRef.current.length === 0) {
                const finalOpponentScore = store.getState().ScoreBoard.otherPlayersTotalScores[0] || 0;
                const finalMyScore = store.getState().ScoreBoard.myTotalScore;
                const winner = finalMyScore > finalOpponentScore ? currentMyUserId : (finalOpponentScore > finalMyScore ? 'opponent' : 'tie');
                dispatch(setGameOver({ winner, reason: 'tilesOut' }));
            }

            console.log('AI played:', cleanTurnInfo);
        } else if (result.type === 'swap') {
            const { originalReturnedTiles, drawnTiles } = result.swapInfo;

            // Update AI rack: remove returned tiles, add drawn
            const newRack = [...aiRackRef.current];
            const toRemove = [...originalReturnedTiles];
            for (let i = newRack.length - 1; i >= 0 && toRemove.length > 0; i--) {
                const removeIdx = toRemove.indexOf(newRack[i]);
                if (removeIdx !== -1) {
                    newRack.splice(i, 1);
                    toRemove.splice(removeIdx, 1);
                }
            }
            newRack.push(...drawnTiles);
            aiRackRef.current = newRack;

            dispatch(syncSwapTiles({
                returnedTiles: originalReturnedTiles,
                drawnTiles: drawnTiles,
            }));
            const swapSignature = result.swapInfo.swapSignature || [...originalReturnedTiles].sort().join('|');
            const updatedRecent = [...aiDecisionRef.current.recentSwapSignatures, swapSignature].slice(-4);
            aiDecisionRef.current.recentSwapSignatures = updatedRecent;
            aiDecisionRef.current.consecutiveAISwaps += 1;

            console.log('AI swapped tiles');
        } else {
            dispatch(syncPassTurn());
            aiDecisionRef.current.consecutiveAISwaps = 0;
            console.log('AI passed');
        }
    }, [dispatch, store]);

    // Watch for AI turn
    useEffect(() => {
        if (isMyTurn || !gameStarted || gameOver) return;

        // Wait for dictionary to load
        if (!isDictionaryLoaded()) {
            const checkInterval = setInterval(() => {
                if (isDictionaryLoaded()) {
                    clearInterval(checkInterval);
                    executeAITurn();
                }
            }, 200);
            return () => clearInterval(checkInterval);
        }

        // Simulate thinking delay (1-2.5s)
        const delay = 1000 + Math.random() * 1500;
        aiTurnTimeoutRef.current = setTimeout(() => {
            executeAITurn();
        }, delay);

        return () => {
            if (aiTurnTimeoutRef.current) {
                clearTimeout(aiTurnTimeoutRef.current);
            }
        };
    }, [isMyTurn, gameStarted, gameOver, executeAITurn]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (aiTurnTimeoutRef.current) {
                clearTimeout(aiTurnTimeoutRef.current);
            }
        };
    }, []);
}
