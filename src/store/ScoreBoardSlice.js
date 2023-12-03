import { createSlice } from '@reduxjs/toolkit'
import {endGame, initializeNewGameState, playWord, updateScoreBoard} from "./actions";
import {squareMultipliers} from "../utils/squareMultipliers";

export const ScoreBoardSlice = createSlice({
    name: 'ScoreBoard',
    initialState: {
        completedTurns: 0,
        turnWords: [],
        wordScores: [],
        turnScores: [],
        totalScore: 0,
    },
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(updateScoreBoard, (state, action) => {
                state.completedTurns += 1;
                state.turnWords.push(action.payload);

                let wScores = [];
                let turnScore = 0;
                action.payload.forEach(
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
                state.turnScores.push(turnScore);
                state.wordScores.push(wScores);
                state.totalScore += turnScore;
            })
            .addCase(initializeNewGameState, (state, action) => {
                state.completedTurns = 0;
                state.turnWords = [];
                state.wordScores = [];
                state.turnScores = [];
                state.totalScore = 0;
            })
    }
})

export const { update } = ScoreBoardSlice.actions

export default ScoreBoardSlice.reducer