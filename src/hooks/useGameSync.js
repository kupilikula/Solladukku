import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { replenishRack, initializeNewGameState, setGameOver } from '../store/actions';
import { clearNeedsInitialDraw, setAutoStartPending, setMyInitialDraw } from '../store/GameSlice';
import { useWebSocket } from '../context/WebSocketContext';
import { initialConsonantsBag, initialVowelsBag, initialBonusBag } from '../utils/initialLetterBags';
import _ from 'lodash';

// Helper to draw tiles from bags
const fetchNLettersFromBags = (nLettersToFetch, letterBags) => {
    let V = [];
    Object.keys(letterBags.vowelsBag).forEach(v => {
        V = V.concat(Array(letterBags.vowelsBag[v]).fill(v));
    });
    let C = [];
    Object.keys(letterBags.consonantsBag).forEach(c => {
        C = C.concat(Array(letterBags.consonantsBag[c]).fill(c));
    });
    let B = [];
    Object.keys(letterBags.bonusBag).forEach(b => {
        B = B.concat(Array(letterBags.bonusBag[b]).fill(b));
    });
    let X = V.concat(C).concat(B);
    return _.sampleSize(X, Math.min(nLettersToFetch, X.length));
};

export function useGameSync() {
    const dispatch = useDispatch();
    const { sendMessage, isConnected } = useWebSocket();
    const letterBags = useSelector(state => state.LetterBags);
    const needsInitialDraw = useSelector(state => state.Game.needsInitialDraw);
    const autoStartPending = useSelector(state => state.Game.autoStartPending);
    const myUserId = useSelector(state => state.Game.userId);
    const consecutivePasses = useSelector(state => state.Game.consecutivePasses);
    const gameOver = useSelector(state => state.Game.gameOver);
    const myScore = useSelector(state => state.ScoreBoard.myTotalScore);
    const opponentScore = useSelector(state => state.ScoreBoard.otherPlayersTotalScores[0] || 0);

    // Auto-start game when creator connects via WebSocket
    useEffect(() => {
        if (autoStartPending && isConnected) {
            dispatch(setAutoStartPending(false));
            dispatch(initializeNewGameState());

            const freshBags = {
                consonantsBag: {...initialConsonantsBag},
                vowelsBag: {...initialVowelsBag},
                bonusBag: {...initialBonusBag},
            };
            const drawnTiles = fetchNLettersFromBags(14, freshBags);
            dispatch(replenishRack(drawnTiles));
            dispatch(setMyInitialDraw(drawnTiles));

            sendMessage({
                messageType: 'newGame',
                startingPlayerId: myUserId,
                drawnTiles: drawnTiles,
            });
            console.log('Auto-started game, drawn tiles:', drawnTiles);
        }
    }, [autoStartPending, isConnected, dispatch, sendMessage, myUserId]);

    // Watch for consecutive passes reaching the threshold
    useEffect(() => {
        if (!gameOver && consecutivePasses >= 4) {
            const winner = myScore > opponentScore ? myUserId : (opponentScore > myScore ? 'opponent' : 'tie');
            dispatch(setGameOver({ winner, reason: 'consecutivePasses' }));
        }
    }, [consecutivePasses, gameOver, myScore, opponentScore, myUserId, dispatch]);

    useEffect(() => {
        if (needsInitialDraw) {
            console.log('Need to draw initial tiles, bags:', letterBags);

            // Clear the flag first to prevent double draws
            dispatch(clearNeedsInitialDraw());

            // Draw tiles from the current bag state (which has opponent's tiles deducted)
            const drawnTiles = fetchNLettersFromBags(14, letterBags);
            console.log('Drawing tiles:', drawnTiles);

            if (drawnTiles.length > 0) {
                dispatch(replenishRack(drawnTiles));

                // Broadcast our draw to the other player
                if (isConnected) {
                    sendMessage({
                        messageType: 'drewTiles',
                        playerId: myUserId,
                        drawnTiles: drawnTiles,
                    });
                    console.log('Broadcast drawn tiles:', drawnTiles);
                }
            }
        }
    }, [needsInitialDraw, letterBags, dispatch, sendMessage, isConnected, myUserId]);
}
