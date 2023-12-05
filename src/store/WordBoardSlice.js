import { createSlice } from '@reduxjs/toolkit'
import {
    deactivateAllUnplayedTilesOnBoard,
    initializeNewGameState,
    moveTileOnBoardFromBoard,
    placeTileOnBoardFromRack,
    placeTileOnRackFromBoard,
    playWord, returnAllUnplayedTilesToRackFromBoard, toggleActivatedOfTileOnBoard
} from "./actions";

export const WordBoardSlice = createSlice({
    name: 'WordBoard',
    initialState: {
        playedTilesWithPositions: [],
        unplayedTilesWithPositions: [],
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(playWord, (state, action) => {
                state.playedTilesWithPositions.push(...state.unplayedTilesWithPositions);
                state.unplayedTilesWithPositions = [];
                // let inds = state.playedTilesWithPositions.reduce( (I, t, i) => {
                //     if (t.activated) {
                //         I.push(i);
                //     }
                //     return I;
                // },[]);
                // inds.forEach( i => state.playedTilesWithPositions[i].activated = false);
            })
            .addCase(initializeNewGameState, (state, action) => {
                state.playedTilesWithPositions = [];
                state.unplayedTilesWithPositions = [];
            })
            .addCase(placeTileOnBoardFromRack, (state, action) => {
            state.unplayedTilesWithPositions.push(action.payload);
        })
            .addCase(moveTileOnBoardFromBoard, (state, action) => {
                const ind = state.unplayedTilesWithPositions.findIndex(t => (t.row === action.payload.origin.pos.row && t.col === action.payload.origin.pos.col));
                state.unplayedTilesWithPositions[ind].row = action.payload.row;
                state.unplayedTilesWithPositions[ind].col = action.payload.col;
            })
            .addCase(placeTileOnRackFromBoard, (state, action) => {
                const ind = state.unplayedTilesWithPositions.findIndex(t => (t.row === action.payload.origin.pos.row && t.col === action.payload.origin.pos.col));
                state.unplayedTilesWithPositions = state.unplayedTilesWithPositions.filter( (t,i) => i!==ind);
            })
            .addCase(returnAllUnplayedTilesToRackFromBoard, (state, action) => {
                state.unplayedTilesWithPositions = [];
            })
            .addCase(toggleActivatedOfTileOnBoard, (state, action) => {
                let ind = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.row && t.col===action.payload.col);
                state.unplayedTilesWithPositions[ind].tile.activated = !state.unplayedTilesWithPositions[ind].tile.activated;
            })
            .addCase(deactivateAllUnplayedTilesOnBoard, (state, action) => {
                let inds = state.unplayedTilesWithPositions.reduce( (I, t, i) => {
                    if (t.tile.activated) {
                        I.push(i);
                    }
                    return I;
                },[]);
                console.log('line61, inds:', inds);
                inds.forEach( i => {state.unplayedTilesWithPositions[i].tile.activated = false;});
            })


    }
})

export const { add } = WordBoardSlice.actions

export default WordBoardSlice.reducer