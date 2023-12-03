import { createSlice } from '@reduxjs/toolkit'
import {
    initializeNewGameState,
    replenishRack, placeTileOnBoardFromRack,
    moveTileOnRack,
    createUyirMeyTileOnRack,
    playWord, placeTileOnRackFromBoard, returnAllUnplayedTilesToRackFromBoard
} from "./actions";

export const LetterRackSlice = createSlice({
    name: 'LetterRack',
    initialState: {
        tilesList: Array(14).fill(null),
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(replenishRack, (state, action) => {
                action.payload.forEach(l => {
                    state.tilesList[state.tilesList.findIndex(x => x===null)] = l
                });
        })
            .addCase(moveTileOnRack, (state, action) => {
                if (state.tilesList[action.payload.toRackSlotPos]===null) {
                    state.tilesList[action.payload.toRackSlotPos] = state.tilesList[action.payload.origin.pos];
                    state.tilesList[action.payload.origin.pos] = null;
                } else {
                    if (action.payload.toRackSlotPos > action.payload.origin.pos) {
                        for (let k=action.payload.origin.pos; k < action.payload.toRackSlotPos; k++) {
                            state.tilesList[k] = state.tilesList[k+1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile.key;
                    } else if (action.payload.toRackSlotPos < action.payload.origin.pos) {
                        for (let k=action.payload.origin.pos; k > action.payload.toRackSlotPos; k--) {
                            state.tilesList[k] = state.tilesList[k-1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile.key;
                    }
                }
            })
            .addCase(placeTileOnRackFromBoard,  (state, action) => {
                // state.tilesList = [...state.tilesList.slice(0, action.payload.origin.pos), ...state.tilesList.slice(action.payload.origin.pos+1) ];
                if (state.tilesList[action.payload.toRackSlotPos]===null) {
                    console.log('line42');
                    state.tilesList[action.payload.toRackSlotPos] = action.payload.tile.key;
                } else {
                    let emptyInd = state.tilesList.findIndex(c => c===null);
                    console.log('emptyInd:', emptyInd);
                    if (emptyInd > action.payload.toRackSlotPos) {
                        for( let k=emptyInd; k > action.payload.toRackSlotPos; k--) {
                            state.tilesList[k] = state.tilesList[k-1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile.key;
                    } else if (emptyInd < action.payload.toRackSlotPos) {
                        for (let k= emptyInd; k < action.payload.toRackSlotPos; k++) {
                            state.tilesList[k] = state.tilesList[k+1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile.key;
                    }
                }
            })
            .addCase(placeTileOnBoardFromRack, (state, action) => {
                 // state.tilesList = [...state.tilesList.slice(0, action.payload.origin.pos), ...state.tilesList.slice(action.payload.origin.pos+1) ];
                state.tilesList[action.payload.origin.pos] = null;
            })
            .addCase(createUyirMeyTileOnRack, (state, action) => {})
            .addCase(initializeNewGameState, (state, action) => {
                state.tilesList = Array(14).fill(null);
            })
            .addCase(returnAllUnplayedTilesToRackFromBoard, (state, action) => {
                action.payload.forEach(t => {
                    let ind = state.tilesList.findIndex(c => c===null);
                    state.tilesList[ind] = t.tile.key;
                })
            })
    }
})

export default LetterRackSlice.reducer