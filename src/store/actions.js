import {createAction} from '@reduxjs/toolkit';

const replenishRack = createAction('game/replenishRack');
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

export {replenishRack, placeTileOnBoardFromRack, moveTileOnBoardFromBoard, placeTileOnRackFromBoard, returnAllUnplayedTilesToRackFromBoard, moveTileOnRack, playWord, createUyirMeyTileOnRack, updateScoreBoard, initializeNewGameState, endGame};