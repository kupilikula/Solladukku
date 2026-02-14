import { createSlice } from '@reduxjs/toolkit'
import {addOtherPlayerTurn, endGame, hydrateGameSnapshot, initializeNewGameState, swapTiles, syncNewGame, passTurn, syncPassTurn, syncSwapTiles, playWord, updateScoreBoard} from "./actions";
import {squareMultipliers} from "../utils/squareMultipliers";

export const ScoreBoardSlice = createSlice({
    name: 'ScoreBoard',
    initialState: {
        myCompletedTurns: 0,
        allTurns: [],
        // turnWords: [],
        // wordScores: [],
        // turnScores: [],
        myTotalScore: 0,
        otherPlayersTotalScores: [],
    },
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(updateScoreBoard, (state, action) => {
                state.myCompletedTurns += 1;
                let turnInfo = { ...action.payload };

                // Use pre-calculated scores if available, otherwise calculate
                if (turnInfo.turnScore === null || turnInfo.turnScore === undefined) {
                    let wScores = [];
                    let turnScore = 0;
                    turnInfo.turnFormedWords.forEach(
                        w => {
                            let wScore = 0;
                            let wMultiplier = w.filter(t => !t.alreadyPlayed && ['Word2', 'Word3', 'Starred'].includes(squareMultipliers[t.row][t.col]))
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
                            wScores.push(totalWordScore);
                            turnScore += totalWordScore;
                        }
                    );
                    turnInfo.turnScore = turnScore;
                    turnInfo.wordScores = wScores;
                }

                state.allTurns.push(turnInfo);
                state.myTotalScore += turnInfo.turnScore;
                console.log('updateScoreBoard:', turnInfo);
            })
            .addCase(initializeNewGameState, (state, action) => {
                state.myCompletedTurns = 0;
                state.allTurns = [];
                state.myTotalScore = 0;
                state.otherPlayersTotalScores = [];
            })
            .addCase(syncNewGame, (state, action) => {
                state.myCompletedTurns = 0;
                state.allTurns = [];
                state.myTotalScore = 0;
                state.otherPlayersTotalScores = [];
            })
            .addCase(passTurn, (state, action) => {
                state.allTurns.push({
                    turnType: 'pass',
                    turnUserId: 'me',
                    turnScore: 0,
                });
            })
            .addCase(syncPassTurn, (state, action) => {
                state.allTurns.push({
                    turnType: 'pass',
                    turnUserId: 'opponent',
                    turnScore: 0,
                });
            })
            .addCase(swapTiles, (state, action) => {
                state.allTurns.push({
                    turnType: 'swap',
                    turnUserId: 'me',
                    turnScore: 0,
                    swappedTileCount: (action.payload?.returnedTiles || []).length,
                });
            })
            .addCase(syncSwapTiles, (state, action) => {
                state.allTurns.push({
                    turnType: 'swap',
                    turnUserId: 'opponent',
                    turnScore: 0,
                    swappedTileCount: (action.payload?.returnedTiles || []).length,
                });
            })
            .addCase(addOtherPlayerTurn, (state, action) => {
                const turnInfo = action.payload.turnInfo;

                // Add turn to history
                state.allTurns.push(turnInfo);

                // Update opponent's score
                // Find if this player already has a score entry
                let existingPlayerIndex = -1;
                const otherPlayerUserIds = [];
                state.allTurns.forEach((t) => {
                    if (!otherPlayerUserIds.includes(t.turnUserId) && t.turnUserId !== turnInfo.turnUserId) {
                        // This is tracking unique other players, but we need to track THIS player
                    }
                });

                // For simplicity in 2-player game, just update the first opponent's score
                if (state.otherPlayersTotalScores.length === 0) {
                    state.otherPlayersTotalScores.push(turnInfo.turnScore);
                } else {
                    state.otherPlayersTotalScores[0] += turnInfo.turnScore;
                }
            })
            .addCase(hydrateGameSnapshot, (state, action) => {
                const snapshotScore = action.payload?.snapshot?.scoreBoard || {};
                state.myCompletedTurns = Number(snapshotScore.myCompletedTurns || 0);
                state.myTotalScore = Number(snapshotScore.myTotalScore || 0);
                state.otherPlayersTotalScores = Array.isArray(snapshotScore.otherPlayersTotalScores)
                    ? snapshotScore.otherPlayersTotalScores
                    : [];
                state.allTurns = Array.isArray(snapshotScore.allTurns)
                    ? snapshotScore.allTurns
                    : [];
            })
    }
})

export const { update } = ScoreBoardSlice.actions

export default ScoreBoardSlice.reducer
