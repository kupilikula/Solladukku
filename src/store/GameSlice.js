import { createSlice } from '@reduxjs/toolkit'
import {addPlayers, endGame, initializeNewGameState, playWord, storeUserId, updateScoreBoard} from "./actions";

export const GameSlice = createSlice({
    name: 'Game',
    initialState: {
        userId: null,
        otherPlayerIds: [],
    },
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(initializeNewGameState, (state, action) => {
                state.otherPlayerIds = [];
            })
            .addCase(storeUserId, (state, action) => {
                state.userId = action.payload.userId;
                // state.connection = action.payload.connection;
            })
            .addCase(addPlayers, (state, action) => {
                state.otherPlayerIds = action.payload.otherPlayerIds;
            })
    }
})

export const { update } = GameSlice.actions

export default GameSlice.reducer