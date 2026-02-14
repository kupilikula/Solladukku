import {createSlice} from '@reduxjs/toolkit'
import {initialConsonantsBag, initialVowelsBag, initialBonusBag} from "../utils/initialLetterBags";
import {initializeNewGameState, syncNewGame, syncOpponentDraw, syncSwapTiles, swapTiles, replenishRack, playWord, addOtherPlayerTurn, hydrateGameSnapshot} from "./actions";
import {TileMethods} from "../utils/TileSet";

// Create fresh copies for initial state
const getInitialState = () => ({
    consonantsBag: {...initialConsonantsBag},
    vowelsBag: {...initialVowelsBag},
    bonusBag: {...initialBonusBag},
});

export const LetterBagsSlice = createSlice({
    name: 'LetterBags',
    initialState: getInitialState(),
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
                state.consonantsBag = {...initialConsonantsBag};
                state.vowelsBag = {...initialVowelsBag};
                state.bonusBag = {...initialBonusBag};
            })
            .addCase(addOtherPlayerTurn, (state, action) => {
                const fetchedLetters = action.payload.turnInfo.fetchedLettersFromBag || [];
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
            .addCase(syncNewGame, (state, action) => {
                // Reset bags to initial state
                state.consonantsBag = {...initialConsonantsBag};
                state.vowelsBag = {...initialVowelsBag};
                state.bonusBag = {...initialBonusBag};

                // Deduct tiles that the other player drew
                const otherPlayerTiles = action.payload.drawnTiles || [];
                otherPlayerTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] -= 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] -= 1;
                    } else {
                        state.bonusBag[l] -= 1;
                    }
                });
            })
            .addCase(syncOpponentDraw, (state, action) => {
                // Deduct tiles that the opponent drew
                const drawnTiles = action.payload.drawnTiles || [];
                drawnTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] -= 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] -= 1;
                    } else {
                        state.bonusBag[l] -= 1;
                    }
                });
            })
            .addCase(swapTiles, (state, action) => {
                // Return swapped tiles to the bag
                const returnedTiles = action.payload.returnedTiles || [];
                returnedTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] += 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] += 1;
                    } else {
                        state.bonusBag[l] += 1;
                    }
                });
                // Deduct the newly drawn tiles
                const drawnTiles = action.payload.drawnTiles || [];
                drawnTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] -= 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] -= 1;
                    } else {
                        state.bonusBag[l] -= 1;
                    }
                });
            })
            .addCase(syncSwapTiles, (state, action) => {
                // Opponent swapped tiles - return their tiles and deduct new ones
                const returnedTiles = action.payload.returnedTiles || [];
                returnedTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] += 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] += 1;
                    } else {
                        state.bonusBag[l] += 1;
                    }
                });
                const drawnTiles = action.payload.drawnTiles || [];
                drawnTiles.forEach(l => {
                    if (TileMethods.isConsonant(l)) {
                        state.consonantsBag[l] -= 1;
                    } else if (TileMethods.isVowel(l)) {
                        state.vowelsBag[l] -= 1;
                    } else {
                        state.bonusBag[l] -= 1;
                    }
                });
            })
            .addCase(hydrateGameSnapshot, (state, action) => {
                const snapshotBags = action.payload?.snapshot?.letterBags || {};
                if (snapshotBags.consonantsBag && snapshotBags.vowelsBag && snapshotBags.bonusBag) {
                    state.consonantsBag = { ...snapshotBags.consonantsBag };
                    state.vowelsBag = { ...snapshotBags.vowelsBag };
                    state.bonusBag = { ...snapshotBags.bonusBag };
                }
            })
    }
})

export const {update} = LetterBagsSlice.actions

export default LetterBagsSlice.reducer
