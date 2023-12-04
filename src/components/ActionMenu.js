import {useDispatch, useSelector} from "react-redux";
import {
    initializeNewGameState,
    playWord,
    replenishRack,
    returnAllUnplayedTilesToRackFromBoard,
    updateScoreBoard
} from "../store/actions";
import constants from "../utils/constants";
import {TileSet} from "../utils/TileSet";
import _ from 'lodash';

const computeWords = (main, unplayedTilesWithPositions, playedTilesWithPositions) => {
    const transverse = main==='row' ? 'col' : 'row';

    let formedWords = [];
    let unplayedTransverse = unplayedTilesWithPositions.map(t => t[transverse]);
    let unplayedMain = unplayedTilesWithPositions.map(t => t[main]);

    let mainAxisWord = [];
    const sortedTransverseInds = unplayedTransverse.toSorted((a,b) => (a-b));
    const gaps = constants.arrayRange(sortedTransverseInds[0], sortedTransverseInds[sortedTransverseInds.length-1], 1).filter(c => !sortedTransverseInds.includes(c));
    const noGaps = gaps.reduce( (A, g) => A && playedTilesWithPositions.find( p => p[main]===unplayedMain[0] && p[transverse]===g), true );
    if (!noGaps) {
        return {valid: false};
    }
    let leastTransverseInd = sortedTransverseInds[0];
    let leastTransNotOver = true;
    // mainAxisWord.push({...unplayedTilesWithPositions.find(t => t.row===unplayedRows[0] && t.col===leastTransverseInd), alreadyPlayed: false});
    while (leastTransverseInd > 0 && leastTransNotOver) {
        let t = playedTilesWithPositions.find(p => p[main]===unplayedMain[0] && p[transverse]===(leastTransverseInd-1));
        if (t) {
            leastTransverseInd -= 1;
            // mainAxisWord.unshift({...t, alreadyPlayed: true});
        } else {
            leastTransNotOver = false;
        }
    }

    let highestTransverseInd = sortedTransverseInds[sortedTransverseInds.length-1];
    let highestTransNotOver = true;
    while (highestTransverseInd < (15-1) && highestTransNotOver) {
        if (playedTilesWithPositions.find(p => p[main]===unplayedMain[0] && p[transverse]===(highestTransverseInd+1))) {
            highestTransverseInd += 1;
        } else {
            highestTransNotOver = false;
        }
    }
    console.log('leastTransverseInd: ', leastTransverseInd);
    console.log('highestTransverseInd: ', highestTransverseInd);

    constants.arrayRange(leastTransverseInd, highestTransverseInd, 1).forEach(c => {
        let t = unplayedTilesWithPositions.find(t => t[main]===unplayedMain[0] && t[transverse]===c);
        if (t) {
            mainAxisWord.push({...t, alreadyPlayed: false});
        } else {
            t = playedTilesWithPositions.find(t => t[main]===unplayedMain[0] && t[transverse]===c);
            mainAxisWord.push({...t, alreadyPlayed: true});
        }
    });

    formedWords.push(mainAxisWord);
    const transverseWords = [];

    constants.arrayRange(leastTransverseInd, highestTransverseInd, 1).forEach(c => {
        let transWord = [];
        if (!(mainAxisWord[c - leastTransverseInd].alreadyPlayed)) {
            let leastMainInd = unplayedMain[0];
            let leastMainNotOver = true;
            transWord.push(mainAxisWord[c-leastTransverseInd]);
            while (leastMainInd > 0 && leastMainNotOver) {
                let tUp = playedTilesWithPositions.find(t => (t[main] === (leastMainInd - 1)) && t[transverse] === c);
                if (tUp) {
                    leastMainInd -= 1;
                    transWord.unshift({...tUp, alreadyPlayed: true});
                } else {
                    leastMainNotOver = false;
                }
            }

            let highestMainInd = unplayedMain[0];
            let highestMainNotOver = true;
            while (highestMainInd < (15 - 1) && highestMainNotOver) {
                let tDown = playedTilesWithPositions.find(t => (t[main] === (highestMainInd + 1)) && t[transverse] === c);
                if (tDown) {
                    highestMainInd += 1;
                    transWord.push({...tDown, alreadyPlayed: true});
                } else {
                    highestMainNotOver = false;
                }
            }

            if (highestMainInd > leastMainInd) {
                transverseWords.push(transWord);
            }
        }
    });
    formedWords.push(...transverseWords);
    return {valid: true, formedWords: formedWords};
}

const validateWordBoardAndComputeNewWords = (unplayedTilesWithPositions, playedTilesWithPositions)  => {
    // At least one unplayed Tile used
    const numberOfTiles = unplayedTilesWithPositions.length;
    if (numberOfTiles === 0) {
        return {valid: false};
    }
    const unplayedRows = unplayedTilesWithPositions.map(t => t.row);
    const unplayedCols = unplayedTilesWithPositions.map(t => t.col);
    // All unplayed Tiles must be in the same row or column
    const allSameRow = unplayedRows.every( r => r===unplayedRows[0]);
    const allSameCol = unplayedCols.every( c => c===unplayedCols[0]);
    if (!allSameRow && !allSameCol) {
        return {valid: false};
    }

    // No gaps and compute words
    let result;
    if (allSameRow) {
        result = computeWords('row', unplayedTilesWithPositions, playedTilesWithPositions);
    } else if (allSameCol) {
        result = computeWords('col', unplayedTilesWithPositions, playedTilesWithPositions);
    }

    if (!result.valid) {
        return {valid: false};
    }

    // Must make contact with already played Tiles if there are any
    if (playedTilesWithPositions.length > 0) {
        const touchesAlreadyPlayed = result.formedWords.flat(Infinity).some( t => t.alreadyPlayed);
        if (!touchesAlreadyPlayed) {
            return {valid: false};
        }
    } else {
        //Must use center square
        if (!result.formedWords.flat(Infinity).some( t => t.row===7 && t.col===7)) {
            return {valid: false};
        }
    }
    return {valid: true, formedWords: result.formedWords};
}

const fetchNLettersFromBags = (nLettersToFetch, letterBags) => {
    let V = [];
    Object.keys(letterBags.vowelsBag).forEach(v => {
        V = V.concat(Array(letterBags.vowelsBag[v]).fill(v));
    });
    console.log('V:', V);
    let C = [];
    Object.keys(letterBags.consonantsBag).forEach(c => {
        C = C.concat(Array(letterBags.consonantsBag[c]).fill(c));
    });
    let B = [];
    Object.keys(letterBags.bonusBag).forEach(b => {
        B = B.concat(Array(letterBags.bonusBag[b]).fill(b));
    });

    let X = V.concat(C).concat(B);
    let fetchedLetters = _.sampleSize(X, Math.min(nLettersToFetch, X.length));
    return fetchedLetters;
}

export default function ActionMenu() {

    const dispatch = useDispatch();
    const unplayedTilesWithPositions = useSelector(state => state.WordBoard.unplayedTilesWithPositions);
    const playedTilesWithPositions = useSelector(state => state.WordBoard.playedTilesWithPositions);
    const rackLetters = useSelector(state => state.LetterRack.tilesList);
    const letterBags = useSelector(state => state.LetterBags);

    const fetchLettersFromBags = (rackLetters) => {
        let nVowelsOnRack= rackLetters.filter(l => l!==null && (TileSet[l].letterType===constants.LetterTile.letterType.UYIR || TileSet[l].letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nConsonantsOnRack= rackLetters.filter(l => l!==null && (TileSet[l].letterType===constants.LetterTile.letterType.MEY || TileSet[l].letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nBonusOnRack = rackLetters.filter(l => l==='?').length;
        let nLettersToFetch = 14 - nVowelsOnRack - nConsonantsOnRack - nBonusOnRack;
        console.log('nV,nC,nB,nL:', nVowelsOnRack, nConsonantsOnRack, nBonusOnRack, nLettersToFetch);
        let fetchedLetters = fetchNLettersFromBags(nLettersToFetch, letterBags);
        return fetchedLetters;
    }



    function submitWord() {
        const result = validateWordBoardAndComputeNewWords(unplayedTilesWithPositions, playedTilesWithPositions);
        if (result.valid) {
            dispatch(playWord());
            let fetchedLetters = fetchLettersFromBags(rackLetters);
            console.log('fetchedLetters:', fetchedLetters);
            dispatch(replenishRack(fetchedLetters));
            dispatch(updateScoreBoard(result.formedWords));
        }
    }

    function returnAllTilesToRack() {
        dispatch(returnAllUnplayedTilesToRackFromBoard(unplayedTilesWithPositions));
    }

    function newGame() {
        dispatch(initializeNewGameState());
        let fetchedLetters = fetchLettersFromBags([]);
        dispatch(replenishRack(fetchedLetters));
    }

    return (
        <div className="ActionMenu">
            <button id={'SubmitButton'} onClick={submitWord}>தாக்கல் செய்</button>
            <button id={'ReturnAllTilesToRack'} onClick={returnAllTilesToRack}>திருப்பி வாங்கு</button>
            <button id={'NewGame'} onClick={newGame}>புது ஆட்டம்</button>
        </div>
    )
}