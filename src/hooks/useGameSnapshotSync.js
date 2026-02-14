import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useWebSocket } from '../context/WebSocketContext';

function cloneTile(tile) {
    if (!tile) return null;
    return {
        key: tile.key || null,
        letter: tile.letter || '',
        points: Number(tile.points || 0),
        letterType: tile.letterType || null,
        secondaryKey: tile.secondaryKey || null,
        secondaryLetter: tile.secondaryLetter || null,
    };
}

function cloneBoardTiles(tiles) {
    if (!Array.isArray(tiles)) return [];
    return tiles
        .map((item) => {
            const row = Number(item?.row);
            const col = Number(item?.col);
            if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
            return {
                row,
                col,
                tile: cloneTile(item?.tile),
            };
        })
        .filter(Boolean);
}

function normalizeTurn(turn) {
    if (!turn || typeof turn !== 'object') return null;
    return {
        turnUserId: turn.turnUserId || null,
        turnType: turn.turnType || null,
        turnScore: Number(turn.turnScore || 0),
        swappedTileCount: Number(turn.swappedTileCount || 0),
        wordScores: Array.isArray(turn.wordScores) ? turn.wordScores.map((n) => Number(n || 0)) : [],
        turnFormedWords: Array.isArray(turn.turnFormedWords)
            ? turn.turnFormedWords.map((wordTiles) => (
                Array.isArray(wordTiles)
                    ? wordTiles.map((tileInfo) => ({
                        row: Number(tileInfo?.row),
                        col: Number(tileInfo?.col),
                        alreadyPlayed: Boolean(tileInfo?.alreadyPlayed),
                        tile: cloneTile(tileInfo?.tile || tileInfo),
                    }))
                    : []
            ))
            : [],
        newlyPlayedTilesWithPositions: cloneBoardTiles(turn.newlyPlayedTilesWithPositions),
        fetchedLettersFromBag: Array.isArray(turn.fetchedLettersFromBag) ? turn.fetchedLettersFromBag.slice() : [],
    };
}

export function useGameSnapshotSync() {
    const { sendMessage, isConnected } = useWebSocket();
    const game = useSelector((state) => state.Game);
    const wordBoard = useSelector((state) => state.WordBoard);
    const letterRack = useSelector((state) => state.LetterRack);
    const letterBags = useSelector((state) => state.LetterBags);
    const scoreBoard = useSelector((state) => state.ScoreBoard);

    const snapshot = useMemo(() => {
        if (game.gameMode !== 'multiplayer' || !game.gameStarted) return null;

        return {
            version: 1,
            gameId: game.gameId || null,
            updatedAtMs: Date.now(),
            game: {
                gameStarted: Boolean(game.gameStarted),
                currentTurnUserId: game.currentTurnUserId || null,
                otherPlayerIds: Array.isArray(game.otherPlayerIds) ? game.otherPlayerIds.slice() : [],
                playerNames: game.playerNames || {},
                consecutivePasses: Number(game.consecutivePasses || 0),
                gameOver: Boolean(game.gameOver),
                winner: game.winner || null,
                gameOverReason: game.gameOverReason || null,
                myInitialDraw: Array.isArray(game.myInitialDraw) ? game.myInitialDraw.slice() : null,
            },
            wordBoard: {
                playedTilesWithPositions: cloneBoardTiles(wordBoard.playedTilesWithPositions),
            },
            letterRack: {
                tilesList: Array.isArray(letterRack.tilesList)
                    ? letterRack.tilesList.map((tile) => cloneTile(tile))
                    : Array(14).fill(null),
            },
            letterBags: {
                consonantsBag: { ...(letterBags.consonantsBag || {}) },
                vowelsBag: { ...(letterBags.vowelsBag || {}) },
                bonusBag: { ...(letterBags.bonusBag || {}) },
            },
            scoreBoard: {
                myCompletedTurns: Number(scoreBoard.myCompletedTurns || 0),
                myTotalScore: Number(scoreBoard.myTotalScore || 0),
                otherPlayersTotalScores: Array.isArray(scoreBoard.otherPlayersTotalScores)
                    ? scoreBoard.otherPlayersTotalScores.map((n) => Number(n || 0))
                    : [],
                allTurns: Array.isArray(scoreBoard.allTurns)
                    ? scoreBoard.allTurns.map(normalizeTurn).filter(Boolean)
                    : [],
            },
        };
    }, [game, wordBoard.playedTilesWithPositions, letterRack.tilesList, letterBags, scoreBoard]);

    const lastSentHashRef = useRef('');

    useEffect(() => {
        if (!snapshot || !isConnected) return;

        const hash = JSON.stringify(snapshot);
        if (hash === lastSentHashRef.current) return;

        const timer = setTimeout(() => {
            const ok = sendMessage({
                messageType: 'stateSnapshot',
                snapshot,
            });
            if (ok) {
                lastSentHashRef.current = hash;
                console.log('[snapshot] sent', {
                    gameId: snapshot.gameId,
                    playedTiles: snapshot.wordBoard?.playedTilesWithPositions?.length || 0,
                    turns: snapshot.scoreBoard?.allTurns?.length || 0,
                    myScore: snapshot.scoreBoard?.myTotalScore || 0,
                });
            } else {
                console.log('[snapshot] skipped (socket not ready)', {
                    gameId: snapshot.gameId,
                });
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [snapshot, isConnected, sendMessage]);
}
