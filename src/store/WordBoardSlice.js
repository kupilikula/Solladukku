import { createSlice } from '@reduxjs/toolkit'
import Square from "../components/Square";

export const WordBoardSlice = createSlice({
    name: 'WordBoard',
    initialState: {
        words: [],
        tiles: Array.from({length: 15}, (_, j) => j)
            .map( j =>
                Array.from({length: 15}, (_, i) => i).map( i => {
                    return j==3 && (i == 6 || i==7) ? 'கு' : '';
                }) ),
    },
    reducers: {
        add: (state, action) => {
            // Redux Toolkit allows us to write "mutating" logic in reducers. It
            // doesn't actually mutate the state because it uses the immer library,
            // which detects changes to a "draft state" and produces a brand new
            // immutable state based off those changes
            state.words.push(action.payload)
        },
    }
})

export const { add } = WordBoardSlice.actions

export default WordBoardSlice.reducer