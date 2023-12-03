import { createSlice } from '@reduxjs/toolkit'
import {
    initializeNewGameState,
    replenishRack, placeTileOnBoardFromRack,
    moveTileOnRack,
    createUyirMeyTileOnRack,
    playWord
} from "./actions";

export const LetterRackSlice = createSlice({
    name: 'LetterRack',
    initialState: {
        tilesList: ['க்','ச்','ட்','ம்','ர்','ன்','ந்','?','அ','அ','உ','இ', 'ஆ','உ'],
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(replenishRack, (state, action) => {

        })
            .addCase(moveTileOnRack, (state, action) => {})
            .addCase(placeTileOnBoardFromRack, (state, action) => {
                 state.tilesList = [...state.tilesList.slice(0, action.payload.origin.pos), ...state.tilesList.slice(action.payload.origin.pos+1) ];
            })
            .addCase(createUyirMeyTileOnRack, (state, action) => {})
            .addCase(initializeNewGameState, (state, action) => {})
    }
})

export default LetterRackSlice.reducer