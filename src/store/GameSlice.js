import { createSlice } from '@reduxjs/toolkit'
import {addOtherPlayerTurn, addPlayers, endGame, initializeNewGameState, swapTiles, syncNewGame, syncPassTurn, syncSwapTiles, passTurn, setGameOver, playWord, storeUserId, updateScoreBoard} from "./actions";

export const GameSlice = createSlice({
    name: 'Game',
    initialState: {
        userId: null,
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
        setMyInitialDraw: (state, action) => {
            state.myInitialDraw = action.payload;
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
            })
            .addCase(storeUserId, (state, action) => {
                state.userId = action.payload.userId;
                state.gameId = action.payload.gameId || null;
                state.currentTurnUserId = action.payload.userId;
            })
            .addCase(addPlayers, (state, action) => {
                state.otherPlayerIds = action.payload.otherPlayerIds;
                // Assign default names to other players
                action.payload.otherPlayerIds.forEach((id, index) => {
                    if (!state.playerNames[id]) {
                        state.playerNames[id] = `Player ${index + 2}`;
                    }
                });
            })
            .addCase(updateScoreBoard, (state, action) => {
                // A word was played - reset consecutive passes
                state.consecutivePasses = 0;
                // After my turn, it becomes the other player's turn
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
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
            })
            .addCase(passTurn, (state, action) => {
                // Player passed - increment counter and switch turns
                state.consecutivePasses += 1;
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
                    state.isMyTurn = false;
                }
            })
            .addCase(swapTiles, (state, action) => {
                // Player swapped tiles - increment counter and switch turns
                state.consecutivePasses += 1;
                if (state.otherPlayerIds.length > 0) {
                    state.currentTurnUserId = state.otherPlayerIds[0];
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
    }
})

export const { setMyTurn, setCurrentTurnUserId, setPlayerName, clearNeedsInitialDraw, setAutoStartPending, setMyInitialDraw, setSwapMode } = GameSlice.actions

export default GameSlice.reducer