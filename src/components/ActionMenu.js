import {useDispatch, useSelector} from "react-redux";
import {playWord, updateScoreBoard} from "../store/actions";
import constants from "../utils/constants";


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
    }

    return {valid: true, formedWords: result.formedWords};
}


export default function ActionMenu() {

    const dispatch = useDispatch();
    const unplayedTilesWithPositions = useSelector(state => state.WordBoard.unplayedTilesWithPositions);
    const playedTilesWithPositions = useSelector(state => state.WordBoard.playedTilesWithPositions);

    function submitWord() {
        const result = validateWordBoardAndComputeNewWords(unplayedTilesWithPositions, playedTilesWithPositions);
        console.log('line142:', result);
        if (result.valid) {
            dispatch(playWord());
            dispatch(updateScoreBoard({}))
        }
    }

    return (
        <div className="ActionMenu">
            <button id={'SubmitButton'} onClick={submitWord}>தாக்கல் செய்</button>
        </div>
    )
}