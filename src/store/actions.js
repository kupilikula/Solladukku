import {createAction} from '@reduxjs/toolkit';

const replenishRack = createAction('game/replenishRack');
const toggleActivatedOfTile = createAction('game/toggleActivatedOfTile');
const deactivateAllUnplayedTilesOnBoard = createAction('game/deactivateAllUnplayedTilesOnBoard');
const placeTileOnBoardFromRack = createAction('game/placeTileOnBoardFromRack');
const moveTileOnBoardFromBoard = createAction('game/moveTileOnBoardFromBoard');
const placeTileOnRackFromBoard = createAction('game/placeTileOnRackFromBoard');
const returnAllUnplayedTilesToRackFromBoard = createAction('game/returnAllUnplayedTilesToRackFromBoard');
const moveTileOnRack = createAction('game/moveTileOnRack');
const playWord = createAction('game/playWord');
const createUyirMeyTileOnRack = createAction('game/createUyirMeyTileOnRack');
const updateScoreBoard = createAction('game/updateScoreBoard');
const initializeNewGameState = createAction('game/initializeNewGameState');
const endGame = createAction('game/endGame');
const mergeTiles = createAction('game/mergeTiles');
const splitUyirMeyTile = createAction('game/splitUyirMeyTile');
const shuffleRack = createAction('game/shuffleRack');
const bonusTileLetterSelected = createAction('game/bonusTileLetterSelected');

export {replenishRack, shuffleRack, mergeTiles, splitUyirMeyTile, bonusTileLetterSelected, toggleActivatedOfTile, deactivateAllUnplayedTilesOnBoard,placeTileOnBoardFromRack, moveTileOnBoardFromBoard, placeTileOnRackFromBoard, returnAllUnplayedTilesToRackFromBoard, moveTileOnRack, playWord, createUyirMeyTileOnRack, updateScoreBoard, initializeNewGameState, endGame};