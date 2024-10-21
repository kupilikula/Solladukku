import {useDispatch, useSelector} from "react-redux";
import {
    deactivateAllUnplayedTilesOnBoard,
    initializeNewGameState,
    playWord,
    replenishRack,
    returnAllUnplayedTilesToRackFromBoard, shuffleRack,
    updateScoreBoard
} from "../store/actions";
import constants from "../utils/constants";
import _ from 'lodash';
import { FaShuffle } from "react-icons/fa6";
import {FaAngleDoubleDown, FaPlay, FaQuestion} from "react-icons/fa";
import {MdAutorenew} from "react-icons/md";
import {IoMdSwap} from "react-icons/io";
import {TbMailShare} from "react-icons/tb";
import { Tooltip } from 'react-tooltip'


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
    return {valid: true, formedWords: formedWords, newlyPlayedTilesWithPositions: unplayedTilesWithPositions};
}

const arrayIncludes = (targetArray, searchArray) => {
    return targetArray.some(
        r => r.length === searchArray.length &&
            r.every((value, index) => searchArray[index] === value)
    );
};
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

    // Must make contact with already played Tiles or use a Starred Square.
    const starredSquaresList = [[7,7], [3,3],[3,11],[11,3],[11,11]];
    const touchesAlreadyPlayed = result.formedWords.flat(Infinity).some( t => t.alreadyPlayed);
    const usesStarredSquare = result.formedWords.flat(Infinity).some(t =>
    {
        console.log('line 144:', starredSquaresList, [t.row,t.col]);
        return !t.alreadyPlayed && arrayIncludes(starredSquaresList, [t.row, t.col]);
    });
    console.log('line 143:', touchesAlreadyPlayed, usesStarredSquare);
    // console.log('line144:',starredSquaresList, [t.row, t.col]);
    if (touchesAlreadyPlayed || usesStarredSquare) {
        return result;
    } else {
        return {valid: false};
    }
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

export default function ActionMenu(props) {

    const dispatch = useDispatch();
    const unplayedTilesWithPositions = useSelector(state => state.WordBoard.unplayedTilesWithPositions);
    const playedTilesWithPositions = useSelector(state => state.WordBoard.playedTilesWithPositions);
    const rackTiles = useSelector(state => state.LetterRack.tilesList);
    const letterBags = useSelector(state => state.LetterBags);
    const scoreBoard = useSelector(state => state.ScoreBoard);
    const myUserId = useSelector(state => state.Game.userId);

    const fetchLettersFromBags = (rackTiles) => {
        let nVowelsOnRack= rackTiles.filter(l => l && (l.letterType===constants.LetterTile.letterType.UYIR || l.letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nConsonantsOnRack= rackTiles.filter(l => l && (l.letterType===constants.LetterTile.letterType.MEY || l.letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nBonusOnRack = rackTiles.filter(l => l && l.key==='?').length;
        let nLettersToFetch = 14 - nVowelsOnRack - nConsonantsOnRack - nBonusOnRack;
        console.log('nV,nC,nB,nL:', nVowelsOnRack, nConsonantsOnRack, nBonusOnRack, nLettersToFetch);
        let fetchedLetters = fetchNLettersFromBags(nLettersToFetch, letterBags);
        return fetchedLetters;
    }



    function submitWord() {
        const result = validateWordBoardAndComputeNewWords(unplayedTilesWithPositions, playedTilesWithPositions);
        if (result.valid) {
            dispatch(deactivateAllUnplayedTilesOnBoard());
            dispatch(playWord());
            let fetchedLettersFromBag = fetchLettersFromBags(rackTiles);
            console.log('fetchedLetters:', fetchedLettersFromBag);
            dispatch(replenishRack(fetchedLettersFromBag));
            const preliminaryTurnInfo = {
                turnUserId: myUserId,
                turnFormedWords: result.formedWords,
                newlyPlayedTilesWithPositions: result.newlyPlayedTilesWithPositions,
                fetchedLettersFromBag: fetchedLettersFromBag,
                turnScore: null,
                wordScores: null,
            };

            dispatch(updateScoreBoard(preliminaryTurnInfo));
            console.log('props', props);
            console.log('T:', scoreBoard.allTurns[scoreBoard.allTurns.length-1])
            // TODO: Move this websocket send to redux
            // props.wsConnection.send({messageType: 'turn', turnInfo: scoreBoard.allTurns[scoreBoard.allTurns.length-1]});
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

    function shuffleRackButton() {
        dispatch(shuffleRack());
    }

    function swapLetters() {

    }

    function showHelp() {

    }

    function invite() {

    }

    return (
        <div className="ActionMenu">
            <button id={'ReturnAllTilesToRack'} className={'ActionMenuButton'} onClick={returnAllTilesToRack} data-tooltip-id="return-tooltip"><FaAngleDoubleDown size={26}/>
            </button>
            <button id={'Shuffle'} className={'ActionMenuButton'} onClick={shuffleRackButton} data-tooltip-id="shuffle-tooltip"><FaShuffle size={26}/></button>
            <button id={'Swap'} className={'ActionMenuButton'} onClick={swapLetters} data-tooltip-id="swap-tooltip"><IoMdSwap size={26}/></button>
            <button id={'SubmitButton'} className={'ActionMenuButton'} onClick={submitWord}><FaPlay size={26}/>
            </button>
            <button id={'Help'} className={'ActionMenuButton'} onClick={showHelp} data-tooltip-id="help-tooltip"><FaQuestion size={26} />
            </button>
            <button id={'Invite'} className={'ActionMenuButton'} onClick={invite} data-tooltip-id="invite-tooltip"><TbMailShare size={26} />
            </button>
            <button id={'NewGame'} className={'ActionMenuButton'} onClick={newGame} data-tooltip-id="newGame-tooltip" ><MdAutorenew size={26}/>
            </button>
            <Tooltip id="newGame-tooltip" content="புது விளையாட்டு" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="help-tooltip" content="உதவி" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="invite-tooltip" content="அழைப்பு" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="shuffle-tooltip" content="வரிசையை மாற்று" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="swap-tooltip" content="எழுத்துகளை மாற்று" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="return-tooltip" content="எழுத்துகளை மீட்டெடு" style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
        </div>
    )
}