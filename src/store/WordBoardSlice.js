import { createSlice } from '@reduxjs/toolkit'
import Square from "../components/Square";
import {
    initializeNewGameState,
    moveTileOnBoardFromBoard,
    placeTileOnBoardFromRack,
    placeTileOnRackFromBoard,
    playWord, returnAllUnplayedTilesToRackFromBoard
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

            })
            .addCase(initializeNewGameState, (state, action) => {
                state.playedTilesWithPositions = [];
                state.unplayedTilesWithPositions = [];
            })
            .addCase(placeTileOnBoardFromRack, (state, action) => {
            state.unplayedTilesWithPositions.push(action.payload);
        })
            .addCase(moveTileOnBoardFromBoard, (state, action) => {
                console.log('line33:', action.payload);
                const ind = state.unplayedTilesWithPositions.findIndex(t => (t.row === action.payload.origin.pos.row && t.col === action.payload.origin.pos.col));
                state.unplayedTilesWithPositions[ind].row = action.payload.row;
                state.unplayedTilesWithPositions[ind].col = action.payload.col;
                // state.unplayedTilesWithPositions.push()
            })
            .addCase(placeTileOnRackFromBoard, (state, action) => {

            })
            .addCase(returnAllUnplayedTilesToRackFromBoard, (state, action) => {

            })

    }
})

export const { add } = WordBoardSlice.actions

export default WordBoardSlice.reducer