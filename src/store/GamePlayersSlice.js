import { createSlice } from '@reduxjs/toolkit'
import {endGame, initializeNewGameState, playWord, updateScoreBoard} from "./actions";
import {squareMultipliers} from "../utils/squareMultipliers";

export const GamePlayersSlice = createSlice({
    name: 'GamePlayers',
    initialState: {
        selfPlayerId: crypto.randomUUID(),
        otherPlayerIds: [],
    },
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(initializeNewGameState, (state, action) => {
                state.otherPlayerIds = [];
            })
    }
})

export const { update } = GamePlayersSlice.actions

export default GamePlayersSlice.reducer