import {useState, useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {
    deactivateAllUnplayedTilesOnBoard,
    deactivateAllRackTiles,
    initializeNewGameState,
    playWord,
    replenishRack,
    returnAllUnplayedTilesToRackFromBoard, shuffleRack,
    updateScoreBoard,
    swapTiles,
    passTurn,
    setGameOver
} from "../store/actions";
import { setSwapMode, setMyInitialDraw } from "../store/GameSlice";
import constants from "../utils/constants";
import _ from 'lodash';
import { FaShuffle } from "react-icons/fa6";
import {FaAngleDoubleDown, FaPlay, FaQuestion, FaForward, FaCheck, FaTimes} from "react-icons/fa";
import {MdAutorenew} from "react-icons/md";
import {IoMdSwap} from "react-icons/io";
import {TbMailShare} from "react-icons/tb";
import { Tooltip } from 'react-tooltip'
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';
import { squareMultipliers } from '../utils/squareMultipliers';
import { initialConsonantsBag, initialVowelsBag, initialBonusBag } from '../utils/initialLetterBags';
import { validateWords, validateWordsWithServer } from '../utils/dictionary';


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

// Calculate score for formed words
const calculateTurnScore = (formedWords) => {
    let wordScores = [];
    let turnScore = 0;

    formedWords.forEach(w => {
        let wScore = 0;
        let wMultiplier = w.filter(t => !t.alreadyPlayed && ['Word2', 'Word3', 'Starred'].includes(squareMultipliers[t.row][t.col]))
            .map(t => squareMultipliers[t.row][t.col])
            .reduce((wM, m) => {
                if (m === 'Starred') return wM * 2;
                return wM * parseInt(m.slice(-1));
            }, 1);

        w.forEach(t => {
            let sM = squareMultipliers[t.row][t.col];
            let hasM = (!t.alreadyPlayed && ['Letter2', 'Letter3'].includes(sM));
            let lM = 1;
            if (hasM) {
                lM = parseInt(sM.slice(-1));
            }
            wScore += t.tile.points * lM;
        });

        let totalWordScore = wScore * wMultiplier;
        wordScores.push(totalWordScore);
        turnScore += totalWordScore;
    });

    return { turnScore, wordScores };
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

function HelpModal({ onClose, t }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200000,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: 12,
                padding: '30px',
                maxWidth: 480,
                maxHeight: '80vh',
                overflowY: 'auto',
                fontFamily: 'Tamil Sangam MN, sans-serif',
                position: 'relative',
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: 22, color: '#1A5276' }}>
                    {t.helpTitle}
                </h2>
                {t.helpSections.map((section, i) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1A5276', marginBottom: 4 }}>
                            {section.title}
                        </div>
                        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.5 }}>
                            {section.body}
                        </div>
                    </div>
                ))}
                <button onClick={onClose} style={{
                    marginTop: 10,
                    backgroundColor: '#1A5276',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 24px',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'Tamil Sangam MN, sans-serif',
                }}>
                    {t.helpClose}
                </button>
            </div>
        </div>
    );
}

function ConfirmDialog({ message, onConfirm, onCancel, t }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200000,
        }} onClick={onCancel}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: 10,
                padding: '24px 32px',
                textAlign: 'center',
                fontFamily: 'Tamil Sangam MN, sans-serif',
                minWidth: 260,
            }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 15, color: '#333', marginBottom: 20 }}>
                    {message}
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button onClick={onCancel} style={{
                        backgroundColor: '#ddd',
                        color: '#333',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 24px',
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}>
                        {t.no}
                    </button>
                    <button onClick={onConfirm} style={{
                        backgroundColor: '#1A5276',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 24px',
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}>
                        {t.yes}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ActionMenu() {

    const dispatch = useDispatch();
    const { sendTurn, sendMessage, sendRequest, isConnected } = useWebSocket();
    const unplayedTilesWithPositions = useSelector(state => state.WordBoard.unplayedTilesWithPositions);
    const playedTilesWithPositions = useSelector(state => state.WordBoard.playedTilesWithPositions);
    const rackTiles = useSelector(state => state.LetterRack.tilesList);
    const letterBags = useSelector(state => state.LetterBags);
    const myUserId = useSelector(state => state.Game.userId);
    const isMyTurn = useSelector(state => state.Game.isMyTurn);
    const gameOver = useSelector(state => state.Game.gameOver);
    const gameStarted = useSelector(state => state.Game.gameStarted);
    const consecutivePasses = useSelector(state => state.Game.consecutivePasses);
    const myScore = useSelector(state => state.ScoreBoard.myTotalScore);
    const opponentScore = useSelector(state => state.ScoreBoard.otherPlayersTotalScores[0] || 0);
    const swapModeActive = useSelector(state => state.Game.swapMode);

    const gameId = useSelector(state => state.Game.gameId);
    const gameMode = useSelector(state => state.Game.gameMode);
    const { language, t } = useLanguage();
    const [invalidWords, setInvalidWords] = useState([]);
    const [isValidating, setIsValidating] = useState(false);
    const [showCopied, setShowCopied] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'pass' | 'newGame' | null

    // Clear invalid words feedback after 3 seconds
    useEffect(() => {
        if (invalidWords.length > 0) {
            const timer = setTimeout(() => setInvalidWords([]), 3000);
            return () => clearTimeout(timer);
        }
    }, [invalidWords]);

    const getWordString = (formedWord) => {
        return formedWord.map(t => t.tile.letter).join('');
    };

    const getTotalRemainingTiles = () => {
        const vowelCount = Object.values(letterBags.vowelsBag).reduce((sum, c) => sum + c, 0);
        const consonantCount = Object.values(letterBags.consonantsBag).reduce((sum, c) => sum + c, 0);
        const bonusCount = Object.values(letterBags.bonusBag).reduce((sum, c) => sum + c, 0);
        return vowelCount + consonantCount + bonusCount;
    };

    const checkGameEnd = (newConsecutivePasses) => {
        if (newConsecutivePasses >= 4) {
            // Both players passed/swapped twice consecutively (4 total actions = 2 per player)
            const winner = myScore > opponentScore ? myUserId : (opponentScore > myScore ? 'opponent' : 'tie');
            dispatch(setGameOver({ winner, reason: 'consecutivePasses' }));
            if (isConnected) {
                sendMessage({
                    messageType: 'gameOver',
                    winner,
                    reason: 'consecutivePasses',
                });
            }
        }
    };

    const fetchLettersFromBags = (rackTiles) => {
        let nVowelsOnRack= rackTiles.filter(l => l && (l.letterType===constants.LetterTile.letterType.UYIR || l.letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nConsonantsOnRack= rackTiles.filter(l => l && (l.letterType===constants.LetterTile.letterType.MEY || l.letterType===constants.LetterTile.letterType.UYIRMEY)).length;
        let nBonusOnRack = rackTiles.filter(l => l && l.key==='?').length;
        let nLettersToFetch = 14 - nVowelsOnRack - nConsonantsOnRack - nBonusOnRack;
        console.log('nV,nC,nB,nL:', nVowelsOnRack, nConsonantsOnRack, nBonusOnRack, nLettersToFetch);
        let fetchedLetters = fetchNLettersFromBags(nLettersToFetch, letterBags);
        return fetchedLetters;
    }



    async function submitWord() {
        // Check if it's my turn (for multiplayer)
        if (!isMyTurn || isValidating) {
            console.log('Not your turn or already validating!');
            return;
        }

        const result = validateWordBoardAndComputeNewWords(unplayedTilesWithPositions, playedTilesWithPositions);
        if (result.valid) {
            // Dictionary validation: check all formed words locally first
            const wordStrings = result.formedWords.map(getWordString);
            const dictResult = validateWords(wordStrings);

            if (!dictResult.valid) {
                // Some words not in local dictionary — try server FST validation
                if (isConnected) {
                    setIsValidating(true);
                    try {
                        const serverResult = await validateWordsWithServer(
                            dictResult.invalidWords,
                            sendRequest
                        );
                        if (!serverResult.valid) {
                            console.log('Invalid words (server confirmed):', serverResult.invalidWords);
                            setInvalidWords(serverResult.invalidWords);
                            return;
                        }
                        // Server accepted the words — continue with play
                        console.log('Words accepted by server FST:', dictResult.invalidWords);
                    } catch (err) {
                        console.error('Server validation error, accepting permissively:', err);
                    } finally {
                        setIsValidating(false);
                    }
                } else {
                    // Offline / single player — no server fallback, reject
                    console.log('Invalid words (offline):', dictResult.invalidWords);
                    setInvalidWords(dictResult.invalidWords);
                    return;
                }
            }

            dispatch(deactivateAllUnplayedTilesOnBoard());
            dispatch(playWord());
            let fetchedLettersFromBag = fetchLettersFromBags(rackTiles);
            console.log('fetchedLetters:', fetchedLettersFromBag);
            dispatch(replenishRack(fetchedLettersFromBag));

            // Calculate score before creating turnInfo
            const { turnScore, wordScores } = calculateTurnScore(result.formedWords);

            const turnInfo = {
                turnUserId: myUserId,
                turnFormedWords: result.formedWords,
                newlyPlayedTilesWithPositions: result.newlyPlayedTilesWithPositions,
                fetchedLettersFromBag: fetchedLettersFromBag,
                turnScore: turnScore,
                wordScores: wordScores,
            };

            dispatch(updateScoreBoard(turnInfo));

            // Send turn to other players via WebSocket
            if (isConnected) {
                sendTurn(turnInfo);
                console.log('Turn sent via WebSocket:', turnInfo);
            }

            // Check if bag is empty and rack is empty after replenishment
            const remainingAfterDraw = getTotalRemainingTiles() - fetchedLettersFromBag.length;
            const rackEmptySlots = rackTiles.filter(t => t === null).length + unplayedTilesWithPositions.length;
            if (remainingAfterDraw <= 0 && fetchedLettersFromBag.length < rackEmptySlots) {
                // Bag is exhausted and player used tiles - check if rack will be empty
                const tilesLeftOnRack = rackTiles.filter(t => t !== null).length - unplayedTilesWithPositions.length + fetchedLettersFromBag.length;
                if (tilesLeftOnRack <= 0) {
                    const winner = myScore + turnInfo.turnScore > opponentScore ? myUserId : (opponentScore > myScore + turnInfo.turnScore ? 'opponent' : 'tie');
                    dispatch(setGameOver({ winner, reason: 'tilesOut' }));
                    if (isConnected) {
                        sendMessage({
                            messageType: 'gameOver',
                            winner,
                            reason: 'tilesOut',
                        });
                    }
                }
            }
        }
    }

    function returnAllTilesToRack() {
        dispatch(returnAllUnplayedTilesToRackFromBoard(unplayedTilesWithPositions));
    }

    function requestNewGame() {
        if (gameStarted && !gameOver) {
            setConfirmAction('newGame');
            return;
        }
        newGame();
    }

    function newGame() {
        setConfirmAction(null);
        dispatch(initializeNewGameState());
        // Draw from fresh initial bags (not the stale state)
        const freshBags = {
            consonantsBag: {...initialConsonantsBag},
            vowelsBag: {...initialVowelsBag},
            bonusBag: {...initialBonusBag},
        };
        let fetchedLetters = fetchNLettersFromBags(14, freshBags);
        dispatch(replenishRack(fetchedLetters));
        dispatch(setMyInitialDraw(fetchedLetters));

        // Broadcast new game to other players
        if (isConnected) {
            sendMessage({
                messageType: 'newGame',
                startingPlayerId: myUserId,
                drawnTiles: fetchedLetters,
            });
            console.log('New game broadcast, drawn tiles:', fetchedLetters);
        }
    }

    function shuffleRackButton() {
        dispatch(shuffleRack());
    }

    function handleSwapClick() {
        if (!isMyTurn || gameOver) return;

        if (!swapModeActive) {
            // Return any tiles on the board back to rack first
            if (unplayedTilesWithPositions.length > 0) {
                dispatch(returnAllUnplayedTilesToRackFromBoard(unplayedTilesWithPositions));
            }
            // Enter swap mode: deactivate all tiles first, then enable selection
            dispatch(deactivateAllRackTiles());
            dispatch(setSwapMode(true));
            return;
        }

        // Already in swap mode — execute the swap with selected (activated) tiles
        const indicesToSwap = [];
        const tilesToReturn = [];
        rackTiles.forEach((tile, idx) => {
            if (tile && tile.activated) {
                indicesToSwap.push(idx);
                tilesToReturn.push(tile.key);
            }
        });

        if (indicesToSwap.length === 0) {
            // No tiles selected yet — stay in swap mode
            return;
        }

        const remainingTiles = getTotalRemainingTiles();
        if (remainingTiles < indicesToSwap.length) {
            console.log('Not enough tiles in the bag to swap.');
            return;
        }

        const drawnTileKeys = fetchNLettersFromBags(indicesToSwap.length, letterBags);

        dispatch(swapTiles({
            indicesToSwap,
            returnedTiles: tilesToReturn,
            drawnTiles: drawnTileKeys,
        }));
        dispatch(replenishRack(drawnTileKeys));
        dispatch(setSwapMode(false));

        checkGameEnd(consecutivePasses + 1);

        if (isConnected) {
            sendMessage({
                messageType: 'swapTiles',
                returnedTiles: tilesToReturn,
                drawnTiles: drawnTileKeys,
            });
        }
    }

    function cancelSwapMode() {
        dispatch(deactivateAllRackTiles());
        dispatch(setSwapMode(false));
    }

    function requestPass() {
        if (!isMyTurn || gameOver) return;
        setConfirmAction('pass');
    }

    function passMyTurn() {
        setConfirmAction(null);

        // Return any tiles on the board back to rack first
        if (unplayedTilesWithPositions.length > 0) {
            dispatch(returnAllUnplayedTilesToRackFromBoard(unplayedTilesWithPositions));
        }

        dispatch(passTurn());

        // Check for game end
        checkGameEnd(consecutivePasses + 1);

        // Broadcast to opponent
        if (isConnected) {
            sendMessage({
                messageType: 'passTurn',
            });
        }
    }

    function toggleHelp() {
        setShowHelp(prev => !prev);
    }

    function invite() {
        const link = `${window.location.origin}?game=${gameId}`;
        navigator.clipboard.writeText(link).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = link;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        });
    }

    const swapSelectedCount = swapModeActive
        ? rackTiles.filter(t => t && t.activated).length
        : 0;

    return (
        <div className="ActionMenu">
            {isValidating && (
                <div className="ValidatingToast">
                    <span className="Spinner" />
                    சரிபார்க்கிறது...
                </div>
            )}
            {invalidWords.length > 0 && (
                <div className="InvalidWordsToast">
                    தவறான சொற்கள்: {invalidWords.join(', ')}
                </div>
            )}
            {showCopied && (
                <div className="ValidatingToast" style={{ animation: 'fadeInOut 2s ease-in-out' }}>
                    Link copied!
                </div>
            )}
            {!swapModeActive && (
                <button id={'Pass'} className={'ActionMenuButton'} onClick={requestPass} data-tooltip-id="pass-tooltip"><FaForward size={26}/></button>
            )}
            <button id={'Swap'} className={'ActionMenuButton'} onClick={handleSwapClick} data-tooltip-id="swap-tooltip"
                style={swapModeActive ? { backgroundColor: '#C0392B' } : {}}>
                {swapModeActive ? <FaCheck size={26}/> : <IoMdSwap size={26}/>}
            </button>
            {swapModeActive && (
                <button className={'ActionMenuButton'} onClick={cancelSwapMode} style={{ backgroundColor: '#666' }}>
                    <FaTimes size={26}/>
                </button>
            )}
            {!swapModeActive && (
                <>
                    <button id={'ReturnAllTilesToRack'} className={'ActionMenuButton'} onClick={returnAllTilesToRack} data-tooltip-id="return-tooltip"><FaAngleDoubleDown size={26}/>
                    </button>
                    <button id={'Shuffle'} className={'ActionMenuButton'} onClick={shuffleRackButton} data-tooltip-id="shuffle-tooltip"><FaShuffle size={26}/></button>
                    <button id={'SubmitButton'} className={'ActionMenuButton'} onClick={submitWord}><FaPlay size={26}/>
                    </button>
                    <button id={'Help'} className={'ActionMenuButton'} onClick={toggleHelp} data-tooltip-id="help-tooltip"><FaQuestion size={26} />
                    </button>
                    {gameMode !== 'singleplayer' && (
                        <button id={'Invite'} className={'ActionMenuButton'} onClick={invite} data-tooltip-id="invite-tooltip"><TbMailShare size={26} />
                        </button>
                    )}
                    <button id={'NewGame'} className={'ActionMenuButton'} onClick={requestNewGame} data-tooltip-id="newGame-tooltip" ><MdAutorenew size={26}/>
                    </button>
                </>
            )}
            {swapModeActive && (
                <div className="ValidatingToast" style={{
                    backgroundColor: '#C0392B',
                    top: '100%',
                    bottom: 'auto',
                    marginBottom: 0,
                    marginTop: 8,
                }}>
                    {language === 'ta' ? `எழுத்துகளைத் தேர்வு செய்யவும் (${swapSelectedCount})` : `Select tiles to swap (${swapSelectedCount})`}
                </div>
            )}
            <Tooltip id="newGame-tooltip" content="புது விளையாட்டு" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="help-tooltip" content="உதவி" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="invite-tooltip" content="அழைப்பு" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="shuffle-tooltip" content="வரிசையை மாற்று" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="swap-tooltip" content="எழுத்துகளை மாற்று" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="pass-tooltip" content="தவிர்" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            <Tooltip id="return-tooltip" content="எழுத்துகளை மீட்டெடு" delayShow={500} style={{backgroundColor: 'black', color: 'white', zIndex: 100}}/>
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} t={t} />}
            {confirmAction === 'pass' && (
                <ConfirmDialog
                    message={t.confirmPass}
                    onConfirm={passMyTurn}
                    onCancel={() => setConfirmAction(null)}
                    t={t}
                />
            )}
            {confirmAction === 'newGame' && (
                <ConfirmDialog
                    message={t.confirmNewGame}
                    onConfirm={newGame}
                    onCancel={() => setConfirmAction(null)}
                    t={t}
                />
            )}
        </div>
    )
}