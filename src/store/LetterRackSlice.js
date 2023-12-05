import { createSlice } from '@reduxjs/toolkit'
import {
    initializeNewGameState,
    replenishRack, placeTileOnBoardFromRack,
    moveTileOnRack,
    createUyirMeyTileOnRack,
    playWord, placeTileOnRackFromBoard, returnAllUnplayedTilesToRackFromBoard, toggleActivatedOfTileOnRack
} from "./actions";
import {TileSet} from "../utils/TileSet";

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
                    state.tilesList[state.tilesList.findIndex(x => x===null)] = TileSet[l];
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
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
                    } else if (action.payload.toRackSlotPos < action.payload.origin.pos) {
                        for (let k=action.payload.origin.pos; k > action.payload.toRackSlotPos; k--) {
                            state.tilesList[k] = state.tilesList[k-1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
                    }
                }
            })
            .addCase(placeTileOnRackFromBoard,  (state, action) => {
                // state.tilesList = [...state.tilesList.slice(0, action.payload.origin.pos), ...state.tilesList.slice(action.payload.origin.pos+1) ];
                if (state.tilesList[action.payload.toRackSlotPos]===null) {
                    console.log('line42');
                    state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
                } else {
                    let emptyInd = state.tilesList.findIndex(c => c===null);
                    console.log('emptyInd:', emptyInd);
                    if (emptyInd > action.payload.toRackSlotPos) {
                        for( let k=emptyInd; k > action.payload.toRackSlotPos; k--) {
                            state.tilesList[k] = state.tilesList[k-1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
                    } else if (emptyInd < action.payload.toRackSlotPos) {
                        for (let k= emptyInd; k < action.payload.toRackSlotPos; k++) {
                            state.tilesList[k] = state.tilesList[k+1];
                        }
                        state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
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
                    state.tilesList[ind] = t.tile;
                })
            })
            .addCase(toggleActivatedOfTileOnRack, (state, action) => {
                state.tilesList[action.payload].activated = !state.tilesList[action.payload].activated;
            })
    }
})

export default LetterRackSlice.reducer