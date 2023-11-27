import { createSlice } from '@reduxjs/toolkit'
import {initialConsonantBag, initialVowelBag} from "../utils/tamilLetters";

export const LetterBagsSlice = createSlice({
    name: 'LetterBags',
    initialState: {
        consonantBag: initialConsonantBag,
        vowelBag: initialVowelBag,
    },
    reducers: {
        update: (state, action) => {
            // Redux Toolkit allows us to write "mutating" logic in reducers. It
            // doesn't actually mutate the state because it uses the immer library,
            // which detects changes to a "draft state" and produces a brand new
            // immutable state based off those changes
            action.payload.consonantIndices.forEach(i => state.consonantBag[i] -= 1);
            action.payload.vowelIndices.forEach(i => state.vowelBag[i] -= 1);
        },
        restore: (state, action) => {
            state.consonantBag = initialConsonantBag;
            state.vowelBag = initialVowelBag;
        }
    }
})

export const { update } = LetterBagsSlice.actions

export default LetterBagsSlice.reducer