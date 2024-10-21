import { createSlice } from '@reduxjs/toolkit'
import {
    addOtherPlayerTurn,
    bonusTileLetterSelected,
    deactivateAllUnplayedTilesOnBoard,
    initializeNewGameState,
    mergeTiles,
    moveTileOnBoardFromBoard,
    placeTileOnBoardFromRack,
    placeTileOnRackFromBoard,
    playWord,
    returnAllUnplayedTilesToRackFromBoard,
    splitUyirMeyTile,
    toggleActivatedOfTile,
    toggleActivatedOfTileOnBoard
} from "./actions";
import constants from "../utils/constants";
import {TileMethods} from "../utils/TileSet";

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
            .addCase(addOtherPlayerTurn, (state, action) => {
                state.unplayedTilesWithPositions = [];
                state.playedTilesWithPositions.push(...action.payload.turnInfo.newlyPlayedTilesWithPositions);
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
            .addCase(toggleActivatedOfTile, (state, action) => {
                if (action.payload.location.host==='WORDBOARD') {
                    let ind = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.location.pos.row && t.col===action.payload.location.pos.col);
                    state.unplayedTilesWithPositions[ind].tile.activated = !state.unplayedTilesWithPositions[ind].tile.activated;
                }
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
            .addCase(mergeTiles, (state, action) => {
                if (action.payload.droppedTileItem.origin.host==='WORDBOARD') {
                    let i = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.droppedTileItem.origin.pos.row && t.col===action.payload.droppedTileItem.origin.pos.col);
                    if (i>=0) {
                        state.unplayedTilesWithPositions = state.unplayedTilesWithPositions.slice(0,i).concat(state.unplayedTilesWithPositions.slice(i+1));
                    }
                }
                if (action.payload.targetLocation.host==='WORDBOARD') {
                    let meyTile = action.payload.targetTile.letterType === constants.LetterTile.letterType.MEY ? action.payload.targetTile : action.payload.droppedTileItem.tile;
                    let uyirTile = action.payload.targetTile.letterType === constants.LetterTile.letterType.UYIR ? action.payload.targetTile : action.payload.droppedTileItem.tile;
                    let mergedTile = TileMethods.joinMeyTileAndUyirTile(meyTile, uyirTile);
                    let i = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.targetLocation.pos.row && t.col===action.payload.targetLocation.pos.col);
                    if (i>=0) {
                        state.unplayedTilesWithPositions[i].tile = mergedTile;
                    }
                }
            })
            .addCase(splitUyirMeyTile, (state, action) => {
                if (action.payload.location.host==='WORDBOARD') {
                    let ind = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.location.pos.row && t.col===action.payload.location.pos.col);
                    state.unplayedTilesWithPositions = state.unplayedTilesWithPositions.slice(0,ind).concat(state.unplayedTilesWithPositions.slice(ind+1));
                }
            })
            .addCase(bonusTileLetterSelected, (state, action) => {
                if (action.payload.location.host==='WORDBOARD') {
                    let ind = state.unplayedTilesWithPositions.findIndex(t => t.row===action.payload.location.pos.row && t.col===action.payload.location.pos.col);
                    state.unplayedTilesWithPositions[ind].tile.letter = action.payload.selectedLetter;
                }
            })



    }
})

export const { add } = WordBoardSlice.actions

export default WordBoardSlice.reducer