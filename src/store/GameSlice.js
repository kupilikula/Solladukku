import { createSlice } from '@reduxjs/toolkit'
import {addOtherPlayerTurn, addPlayers, endGame, hydrateGameSnapshot, initializeNewGameState, swapTiles, syncNewGame, syncPassTurn, syncSwapTiles, passTurn, setGameOver, playWord, storeUserId, updateScoreBoard} from "./actions";

export const GameSlice = createSlice({
    name: 'Game',
    initialState: {
        userId: null,
        username: null,
        gameId: null,
        otherPlayerIds: [],
        currentTurnUserId: null,  // Whose turn it is
        isMyTurn: true,           // For 2-player: starts as true for first player
        gameStarted: false,
        needsInitialDraw: false,  // Flag to trigger tile draw after sync
        autoStartPending: false,  // Flag to auto-start game after WS connects
        myInitialDraw: null,      // Tiles drawn at game start (for re-syncing late joiners)
        playerNames: {},          // Map of {userId: displayName}
        consecutivePasses: 0,     // Track consecutive passes/swaps
        gameOver: false,          // Is the game over?
        winner: null,             // Winner's userId (or 'tie')
        gameOverReason: null,     // 'tilesOut', 'consecutivePasses'
        swapMode: false,          // Is the player selecting tiles to swap?
        gameMode: null,           // 'singleplayer' or 'multiplayer'
        soloResumePending: false, // Waiting for solo resume hydration
        soloAiRack: [],           // AI rack for single-player snapshot/restore
    },
    reducers: {
        setMyTurn: (state, action) => {
            state.isMyTurn = action.payload;
        },
        setSwapMode: (state, action) => {
            state.swapMode = action.payload;
        },
        setCurrentTurnUserId: (state, action) => {
            state.currentTurnUserId = action.payload;
            state.isMyTurn = action.payload === state.userId;
        },
        setPlayerName: (state, action) => {
            state.playerNames[action.payload.userId] = action.payload.name;
        },
        clearNeedsInitialDraw: (state) => {
            state.needsInitialDraw = false;
        },
        setAutoStartPending: (state, action) => {
            state.autoStartPending = action.payload;
        },
        setNeedsInitialDraw: (state, action) => {
            state.needsInitialDraw = Boolean(action.payload);
        },
        setMyInitialDraw: (state, action) => {
            state.myInitialDraw = action.payload;
        },
        setGameMode: (state, action) => {
            state.gameMode = action.payload;
        },
        setSoloResumePending: (state, action) => {
            state.soloResumePending = Boolean(action.payload);
        },
        setSoloAiRack: (state, action) => {
            state.soloAiRack = Array.isArray(action.payload) ? action.payload.slice(0, 14) : [];
        },
    },
    extraReducers: builder => {
        builder
            .addCase(initializeNewGameState, (state, action) => {
                // Don't clear otherPlayerIds - keep playing with same opponent
                state.currentTurnUserId = state.userId;
                state.isMyTurn = true;
                state.gameStarted = true;
                state.needsInitialDraw = false;
                state.autoStartPending = false;
                state.myInitialDraw = null;
                state.consecutivePasses = 0;
                state.gameOver = false;
                state.winner = null;
                state.gameOverReason = null;
                state.soloAiRack = [];
            })
            .addCase(storeUserId, (state, action) => {
                state.userId = action.payload.userId;
                state.username = action.payload.username || state.username;
                state.gameId = action.payload.gameId || null;
                state.currentTurnUserId = action.payload.userId;
                if (action.payload.gameId) {
                    const normalizedGameId = String(action.payload.gameId).trim().toUpperCase();
                    state.gameMode = (normalizedGameId === 'SOLO' || normalizedGameId.startsWith('SOLO-'))
                        ? 'singleplayer'
                        : 'multiplayer';
                }
                if (action.payload.userId && action.payload.username) {
                    state.playerNames[action.payload.userId] = action.payload.username;
                }
            })
            .addCase(addPlayers, (state, action) => {
                state.otherPlayerIds = action.payload.otherPlayerIds;
                if (Array.isArray(action.payload.players)) {
                    action.payload.players.forEach((player) => {
                        if (player?.userId && player?.name) {
                            state.playerNames[player.userId] = player.name;
                        }
                    });
                }
                // Assign default names to other players
                action.payload.otherPlayerIds.forEach((id, index) => {
                    if (!state.playerNames[id]) {
                        state.playerNames[id] = `Player ${index + 2}`;
                    }
                });
                // If a turn was handed off before opponent joined, bind it now.
                if (state.gameStarted && !state.isMyTurn && !state.currentTurnUserId && state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
                }
            })
            .addCase(updateScoreBoard, (state, action) => {
                // A word was played - reset consecutive passes
                state.consecutivePasses = 0;
                // After my turn, it becomes the other player's turn
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
                    state.isMyTurn = false;
                } else {
                    // Opponent not in room yet: still hand off turn and wait.
                    state.currentTurnUserId = null;
                    state.isMyTurn = false;
                }
            })
            .addCase(addOtherPlayerTurn, (state, action) => {
                // Other player played a word - reset consecutive passes
                state.consecutivePasses = 0;
                // After other player's turn, it becomes my turn
                state.currentTurnUserId = state.userId;
                state.isMyTurn = true;
            })
            .addCase(syncNewGame, (state, action) => {
                // Other player started a new game - they go first
                state.currentTurnUserId = action.payload.startingPlayerId;
                state.isMyTurn = false;
                state.gameStarted = true;
                state.needsInitialDraw = true;  // Signal that we need to draw tiles
                state.consecutivePasses = 0;
                state.gameOver = false;
                state.winner = null;
                state.gameOverReason = null;
                state.soloAiRack = [];
            })
            .addCase(passTurn, (state, action) => {
                // Player passed - increment counter and switch turns
                state.consecutivePasses += 1;
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
                    state.isMyTurn = false;
                } else {
                    state.currentTurnUserId = null;
                    state.isMyTurn = false;
                }
            })
            .addCase(swapTiles, (state, action) => {
                // Player swapped tiles - increment counter and switch turns
                state.consecutivePasses += 1;
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
                    state.isMyTurn = false;
                } else {
                    state.currentTurnUserId = null;
                    state.isMyTurn = false;
                }
            })
            .addCase(syncSwapTiles, (state, action) => {
                // Opponent swapped tiles - increment counter and it's now my turn
                state.consecutivePasses += 1;
                state.currentTurnUserId = state.userId;
                state.isMyTurn = true;
            })
            .addCase(syncPassTurn, (state, action) => {
                // Opponent passed - increment counter and it's now my turn
                state.consecutivePasses += 1;
                state.currentTurnUserId = state.userId;
                state.isMyTurn = true;
            })
            .addCase(setGameOver, (state, action) => {
                state.gameOver = true;
                state.winner = action.payload.winner;
                state.gameOverReason = action.payload.reason;
            })
            .addCase(hydrateGameSnapshot, (state, action) => {
                const snapshot = action.payload?.snapshot || {};
                const game = snapshot.game || {};
                const targetMode = action.payload?.mode || 'multiplayer';

                state.gameId = action.payload?.gameId || state.gameId;
                state.gameStarted = Boolean(game.gameStarted);
                state.currentTurnUserId = game.currentTurnUserId || state.currentTurnUserId;
                state.isMyTurn = state.currentTurnUserId === state.userId;
                state.otherPlayerIds = Array.isArray(game.otherPlayerIds)
                    ? game.otherPlayerIds.filter((id) => id && id !== state.userId)
                    : state.otherPlayerIds;
                state.playerNames = {
                    ...state.playerNames,
                    ...(game.playerNames || {}),
                };
                state.consecutivePasses = Number(game.consecutivePasses || 0);
                state.gameOver = Boolean(game.gameOver);
                state.winner = game.winner || null;
                state.gameOverReason = game.gameOverReason || null;
                state.myInitialDraw = Array.isArray(game.myInitialDraw) ? game.myInitialDraw : null;
                state.needsInitialDraw = false;
                state.autoStartPending = false;
                state.swapMode = false;
                state.gameMode = targetMode;
                state.soloResumePending = false;
                state.soloAiRack = Array.isArray(game.soloAiRack)
                    ? game.soloAiRack.slice(0, 14)
                    : [];
            })
    }
})

export const { setMyTurn, setCurrentTurnUserId, setPlayerName, clearNeedsInitialDraw, setAutoStartPending, setNeedsInitialDraw, setMyInitialDraw, setSwapMode, setGameMode, setSoloResumePending, setSoloAiRack } = GameSlice.actions

export default GameSlice.reducer
