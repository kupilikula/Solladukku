import { createSlice } from '@reduxjs/toolkit'
import {endGame, initializeNewGameState, playWord} from "./actions";

export const ScoreBoardSlice = createSlice({
    name: 'ScoreBoard',
    initialState: {
        turnNumber: 0,
        scores: [],
        totalScore: 0,
    },
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(playWord, (state, action) => {

            })
            .addCase(initializeNewGameState, (state, action) => {})
            .addCase(endGame, (state, action) => {})
    }
})

export const { update } = ScoreBoardSlice.actions

export default ScoreBoardSlice.reducer