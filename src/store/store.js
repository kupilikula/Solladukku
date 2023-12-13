import { configureStore } from '@reduxjs/toolkit'

import wordBoardReducer from './WordBoardSlice';
import scoreBoardReducer from './ScoreBoardSlice';
import letterRackReducer from './LetterRackSlice';
import letterBagsReducer from './LetterBagsSlice';
import gamePlayersReducer from './GamePlayersSlice';

export default configureStore({
    reducer: {
        WordBoard: wordBoardReducer,
        ScoreBoard: scoreBoardReducer,
        LetterRack: letterRackReducer,
        LetterBags: letterBagsReducer,
        GamePlayers: gamePlayersReducer,
    },
})