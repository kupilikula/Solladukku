import {createSlice} from '@reduxjs/toolkit'
import {initialConsonantsBag, initialVowelsBag, initialBonusBag} from "../utils/initialLetterBags";
import {initializeNewGameState, replenishRack, playWord, addOtherPlayerTurn} from "./actions";
import {TileMethods} from "../utils/TileSet";

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
            action.payload.forEach(l => {
                if (TileMethods.isConsonant(l)) {
                    state.consonantsBag[l] -= 1;
                } else if (TileMethods.isVowel(l)) {
                    state.vowelsBag[l] -= 1;
                } else {
                    state.bonusBag[l] -= 1;
                }
            })
        })
            .addCase(initializeNewGameState, (state, action) => {
                state.consonantsBag = initialConsonantsBag;
                state.vowelsBag = initialVowelsBag;
                state.bonusBag = initialBonusBag
            })
            .addCase(addOtherPlayerTurn, (state, action) => {
                let fetchedLetters = action.payload.turnInfo.fetchedLetters;
                //TODO: Refactor Duplicated Code
                fetchedLetters.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] -= 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] -= 1;
                    } else {
                        state.bonusBag[l] -= 1;
                    }
                })
            })
    }
})

export const {update} = LetterBagsSlice.actions

export default LetterBagsSlice.reducer