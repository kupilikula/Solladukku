import { configureStore } from '@reduxjs/toolkit'

import wordBoardReducer from './WordBoardSlice';
import scoreBoardReducer from './ScoreBoardSlice';
import letterRackReducer from './LetterRackSlice';
import letterBagsReducer from './LetterBagsSlice';

export default configureStore({
    reducer: {
        WordBoard: wordBoardReducer,
        ScoreBoard: scoreBoardReducer,
        LetterRack: letterRackReducer,
        LetterBags: letterBagsReducer,
    },
})