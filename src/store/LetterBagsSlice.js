import { createSlice } from '@reduxjs/toolkit'
import {initialConsonantsBag, initialVowelsBag, initialBonusBag} from "../utils/initialLetterBags";
import {initializeNewGameState, replenishRack, playWord} from "./actions";

export const LetterBagsSlice = createSlice({
    name: 'LetterBags',
    initialState: {
        consonantsBag: initialConsonantsBag,
        vowelsBag: initialVowelsBag,
        bonusBag: initialBonusBag,
    },
    reducers: {},
    extraReducers: (builder) => {
    builder.addCase(replenishRack, (state, action) => {

        })
        .addCase(initializeNewGameState, (state, action) => {
            state.consonantsBag = initialConsonantsBag;
            state.vowelsBag = initialVowelsBag;
            state.bonusBag = initialBonusBag
        })
    }
})

export const { update } = LetterBagsSlice.actions

export default LetterBagsSlice.reducer