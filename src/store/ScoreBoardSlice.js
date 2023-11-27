import { createSlice } from '@reduxjs/toolkit'

export const ScoreBoardSlice = createSlice({
    name: 'ScoreBoard',
    initialState: {
        scores: [],
        totalScore: 0,
    },
    reducers: {
        update: (state, action) => {
            // Redux Toolkit allows us to write "mutating" logic in reducers. It
            // doesn't actually mutate the state because it uses the immer library,
            // which detects changes to a "draft state" and produces a brand new
            // immutable state based off those changes
            state.scores.push(action.payload);
            state.totalScore += action.payload;
        },
    }
})

export const { update } = ScoreBoardSlice.actions

export default ScoreBoardSlice.reducer