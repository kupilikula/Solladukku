import { createSlice } from '@reduxjs/toolkit'
import {addOtherPlayerTurn, endGame, initializeNewGameState, playWord, updateScoreBoard} from "./actions";
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
                let turnInfo = action.payload;
                // turnInfo.turnFormedWords = action.payload;

                let wScores = [];
                let turnScore = 0;
                turnInfo.turnFormedWords.forEach(
                    w => {
                        let wScore = 0;
                        let wMultiplier = w.filter( t => !t.alreadyPlayed && ['Word2', 'Word3'].includes(squareMultipliers[t.row][t.col]))
                            .map( t => squareMultipliers[t.row][t.col])
                            .reduce( (wM,m) => wM*parseInt(m.slice(-1)), 1 );
                        w.forEach( t => {
                            let sM = squareMultipliers[t.row][t.col];
                            let hasM = (!t.alreadyPlayed && ['Letter2', 'Letter3'].includes(sM));
                            let lM = 1;
                            if (hasM) {
                                lM = parseInt(sM.slice(-1));
                            }
                            wScore += t.tile.points*lM;
                        });
                        let totalWordScore = wScore*wMultiplier;
                        wScores.push(totalWordScore);
                        turnScore += totalWordScore;
                    }
                );

                turnInfo.turnScore = turnScore;
                turnInfo.wordScores = wScores;
                state.allTurns.push(turnInfo);
                state.myTotalScore += turnScore;
                console.log('line51:', turnInfo);
            })
            .addCase(initializeNewGameState, (state, action) => {
                state.myCompletedTurns = 0;
                state.allTurns = [];
                state.myTotalScore = 0;
                state.otherPlayersTotalScores = [];
            })
            .addCase(addOtherPlayerTurn, (state, action) => {
                let alreadyPlayedUserIds = [];
                state.allTurns.forEach( (t,i) => {
                    if (!alreadyPlayedUserIds.includes(t.turnUserId)) {
                        alreadyPlayedUserIds.push(t.turnUserId);
                    }
                });

                let uInd = alreadyPlayedUserIds.findIndex(action.payload.turnUserId);
                if (uInd!==-1) {
                   state.otherPlayersTotalScores[uInd] += action.payload.turnScore;
                } else {
                    state.otherPlayersTotalScores.push(action.payload.turnScore);
                }
            })
    }
})

export const { update } = ScoreBoardSlice.actions

export default ScoreBoardSlice.reducer