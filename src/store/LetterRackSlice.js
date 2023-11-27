import { createSlice } from '@reduxjs/toolkit'

export const LetterRackSlice = createSlice({
    name: 'LetterRack',
    initialState: {
        consonants: ['க்','ச்','ட்','ம்','ர்','ன்','ந்'],
        vowels: ['அ','அ','உ','இ', 'ஆ','உ'],
    },
    reducers: {
        update: (state, action) => {
            // Redux Toolkit allows us to write "mutating" logic in reducers. It
            // doesn't actually mutate the state because it uses the immer library,
            // which detects changes to a "draft state" and produces a brand new
            // immutable state based off those changes
            state.consonants[action.payload.consonantIndex] = (action.payload.consonant);
            state.consonants[action.payload.vowelIndex] = (action.payload.vowel);
        },
    }
})

export const { update } = LetterRackSlice.actions

export default LetterRackSlice.reducer