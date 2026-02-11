import {createAction} from '@reduxjs/toolkit';

const storeUserId = createAction('game/storeUserId');
const addPlayers = createAction('game/addPlayers');
const addOtherPlayerTurn = createAction('game/addOtherPlayerTurn');
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
const syncNewGame = createAction('game/syncNewGame'); // When other player starts a new game
const syncOpponentDraw = createAction('game/syncOpponentDraw'); // When other player draws tiles
const swapTiles = createAction('game/swapTiles'); // Swap selected tiles
const passTurn = createAction('game/passTurn'); // Pass without playing
const syncSwapTiles = createAction('game/syncSwapTiles'); // When opponent swaps tiles
const syncPassTurn = createAction('game/syncPassTurn'); // When opponent passes their turn
const setGameOver = createAction('game/setGameOver'); // End the game
const endGame = createAction('game/endGame');
const mergeTiles = createAction('game/mergeTiles');
const splitUyirMeyTile = createAction('game/splitUyirMeyTile');
const shuffleRack = createAction('game/shuffleRack');
const bonusTileLetterSelected = createAction('game/bonusTileLetterSelected');
const deactivateAllRackTiles = createAction('game/deactivateAllRackTiles');

export {storeUserId, addPlayers, addOtherPlayerTurn, replenishRack, shuffleRack, mergeTiles, splitUyirMeyTile, bonusTileLetterSelected, toggleActivatedOfTile, deactivateAllUnplayedTilesOnBoard, deactivateAllRackTiles, placeTileOnBoardFromRack, moveTileOnBoardFromBoard, placeTileOnRackFromBoard, returnAllUnplayedTilesToRackFromBoard, moveTileOnRack, playWord, createUyirMeyTileOnRack, updateScoreBoard, initializeNewGameState, syncNewGame, syncOpponentDraw, swapTiles, passTurn, syncPassTurn, syncSwapTiles, setGameOver, endGame};