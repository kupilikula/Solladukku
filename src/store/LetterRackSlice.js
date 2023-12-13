import { createSlice } from '@reduxjs/toolkit'
import {
    initializeNewGameState,
    replenishRack,
    placeTileOnBoardFromRack,
    moveTileOnRack,
    createUyirMeyTileOnRack,
    playWord,
    placeTileOnRackFromBoard,
    returnAllUnplayedTilesToRackFromBoard,
    toggleActivatedOfTileOnRack,
    mergeTiles, splitUyirMeyTile, shuffleRack, bonusTileLetterSelected, toggleActivatedOfTile
} from "./actions";
import {TileMethods, TileSet} from "../utils/TileSet";
import constants from "../utils/constants";

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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
                    state.tilesList[action.payload.toRackSlotPos] = action.payload.tile;
                } else {
                    let emptyInd = state.tilesList.findIndex(c => c===null);
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
            .addCase(toggleActivatedOfTile, (state, action) => {
                if (action.payload.location.host==='RACK')
                state.tilesList[action.payload.location.pos].activated = !state.tilesList[action.payload.location.pos].activated;
            })
            .addCase(mergeTiles, (state, action) => {
                if (action.payload.droppedTileItem.origin.host==='RACK') {
                    state.tilesList[action.payload.droppedTileItem.origin.pos] = null;
                }
                if (action.payload.targetLocation.host==='RACK') {
                    let meyTile = action.payload.targetTile.letterType === constants.LetterTile.letterType.MEY ? action.payload.targetTile : action.payload.droppedTileItem.tile;
                    let uyirTile = action.payload.targetTile.letterType === constants.LetterTile.letterType.UYIR ? action.payload.targetTile : action.payload.droppedTileItem.tile;
                    let mergedTile = TileMethods.joinMeyTileAndUyirTile(meyTile, uyirTile);
                    state.tilesList[action.payload.targetLocation.pos] = mergedTile;
                }
            })
            .addCase(splitUyirMeyTile, (state, action) => {
                const [meyTile, uyirTile] = TileMethods.splitUyirMeyTile(action.payload.tile);
                let ind1 = state.tilesList.findIndex(t => t===null);
                if (action.payload.location.host==='RACK') {
                    if (ind1 > action.payload.location.pos) {
                        for (let k= ind1; k > (action.payload.location.pos+1); k-- ) {
                            state.tilesList[k] = state.tilesList[k-1]
                        }
                        state.tilesList[action.payload.location.pos] = meyTile;
                        state.tilesList[action.payload.location.pos+1] = uyirTile;
                    } else {
                        for (let k = ind1; k < (action.payload.location.pos-1) ; k++) {
                            state.tilesList[k] = state.tilesList[k+1];
                        }
                        state.tilesList[action.payload.location.pos-1] = meyTile;
                        state.tilesList[action.payload.location.pos] = uyirTile;
                    }
                } else if (action.payload.location.host==='WORDBOARD') {
                    state.tilesList[ind1] = meyTile;
                    let ind2 = state.tilesList.findIndex(t => t===null);
                    state.tilesList[ind2] = uyirTile;
                }
            })
            .addCase(shuffleRack, (state, action) => {
                const listCopy = state.tilesList.slice(0);
                state.tilesList = shuffleArray(listCopy);
            })
            .addCase(bonusTileLetterSelected, (state, action) => {
                if (action.payload.location.host==='RACK') {
                    state.tilesList[action.payload.location.pos].letter = action.payload.selectedLetter;
                }
            })
    }
})

export default LetterRackSlice.reducer