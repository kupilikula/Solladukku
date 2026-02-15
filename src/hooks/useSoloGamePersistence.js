import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { getApiBaseUrl } from '../utils/runtimeUrls';
import { getAuthSessionToken } from '../utils/authSession';

function wordTilesToWordString(wordTiles) {
    if (!Array.isArray(wordTiles)) return '';
    return wordTiles.map((tileInfo) => tileInfo?.tile?.letter || tileInfo?.letter || '').join('');
}

function normalizePlacedTiles(turn) {
    if (!turn || !Array.isArray(turn.newlyPlayedTilesWithPositions)) return [];
    return turn.newlyPlayedTilesWithPositions
        .map((tileInfo) => {
            const row = Number(tileInfo?.row);
            const col = Number(tileInfo?.col);
            if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
            return {
                row,
                col,
                letter: tileInfo?.tile?.letter || tileInfo?.letter || '',
                points: Number(tileInfo?.tile?.points || tileInfo?.points || 0),
                key: tileInfo?.tile?.key || tileInfo?.key || null,
            };
        })
        .filter(Boolean);
}

function normalizeFormedWords(turn) {
    if (!turn || !Array.isArray(turn.turnFormedWords)) return [];
    return turn.turnFormedWords.map((wordTiles) => (
        Array.isArray(wordTiles)
            ? wordTiles.map((tileInfo) => ({
                row: Number(tileInfo?.row),
                col: Number(tileInfo?.col),
                letter: tileInfo?.tile?.letter || tileInfo?.letter || '',
                alreadyPlayed: Boolean(tileInfo?.alreadyPlayed),
            }))
            : []
    ));
}

function buildSoloSnapshot({ game, wordBoard, letterRack, letterBags, scoreBoard }) {
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
            soloAiRack: Array.isArray(game.soloAiRack) ? game.soloAiRack.slice(0, 14) : [],
        },
        wordBoard: {
            playedTilesWithPositions: Array.isArray(wordBoard.playedTilesWithPositions)
                ? wordBoard.playedTilesWithPositions
                : [],
        },
        letterRack: {
            tilesList: Array.isArray(letterRack.tilesList) ? letterRack.tilesList : Array(14).fill(null),
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
                ? scoreBoard.otherPlayersTotalScores
                : [],
            allTurns: Array.isArray(scoreBoard.allTurns) ? scoreBoard.allTurns : [],
        },
    };
}

export function useSoloGamePersistence({ isResume = false }) {
    const game = useSelector((state) => state.Game);
    const wordBoard = useSelector((state) => state.WordBoard);
    const letterRack = useSelector((state) => state.LetterRack);
    const letterBags = useSelector((state) => state.LetterBags);
    const scoreBoard = useSelector((state) => state.ScoreBoard);

    const startedRef = useRef(false);
    const endedRef = useRef(false);
    const sentTurnsRef = useRef(0);
    const lastSnapshotHashRef = useRef('');

    const buildHeaders = () => {
        const token = getAuthSessionToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    };

    useEffect(() => {
        if (game.gameMode !== 'singleplayer') return;
        if (!game.gameId || !game.userId || !game.gameStarted) return;

        if (!startedRef.current) {
            startedRef.current = true;
            if (isResume) {
                sentTurnsRef.current = Array.isArray(scoreBoard.allTurns) ? scoreBoard.allTurns.length : 0;
            }
            fetch(getApiBaseUrl() + '/api/solo/start', {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({
                    gameId: game.gameId,
                    userId: game.userId,
                    username: game.username || 'Player',
                }),
            }).catch((err) => {
                console.warn('[solo persistence] /api/solo/start failed', err?.message || err);
            });
        }
    }, [game.gameMode, game.gameId, game.userId, game.username, game.gameStarted, isResume, scoreBoard.allTurns]);

    useEffect(() => {
        if (game.gameMode !== 'singleplayer') return;
        if (!game.gameId || !game.userId || !game.gameStarted) return;
        const turns = Array.isArray(scoreBoard.allTurns) ? scoreBoard.allTurns : [];
        if (sentTurnsRef.current >= turns.length) return;

        const newTurns = turns.slice(sentTurnsRef.current);
        sentTurnsRef.current = turns.length;

        newTurns.forEach((turn) => {
            const turnType = turn?.turnType || 'word';
            const formedWords = normalizeFormedWords(turn);
            const placedTiles = normalizePlacedTiles(turn);
            const wordsPlayed = Array.isArray(turn.turnFormedWords)
                ? turn.turnFormedWords.map((wordTiles) => wordTilesToWordString(wordTiles)).filter(Boolean)
                : [];

            fetch(getApiBaseUrl() + '/api/solo/turn', {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({
                    gameId: game.gameId,
                    userId: turn.turnUserId || game.userId,
                    turnType,
                    score: Number(turn.turnScore || 0),
                    wordsPlayed,
                    wordScores: Array.isArray(turn.wordScores) ? turn.wordScores : [],
                    tilesPlaced: placedTiles.length,
                    placedTiles,
                    formedWords,
                }),
            }).catch((err) => {
                console.warn('[solo persistence] /api/solo/turn failed', err?.message || err);
            });
        });
    }, [game.gameMode, game.gameId, game.userId, game.gameStarted, scoreBoard.allTurns]);

    useEffect(() => {
        if (game.gameMode !== 'singleplayer') return;
        if (!game.gameId || !game.userId || !game.gameStarted) return;
        if (!game.gameOver || endedRef.current) return;

        endedRef.current = true;
        fetch(getApiBaseUrl() + '/api/solo/end', {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({
                gameId: game.gameId,
                userId: game.userId,
                winnerId: game.winner,
                reason: game.gameOverReason,
            }),
        }).catch((err) => {
            console.warn('[solo persistence] /api/solo/end failed', err?.message || err);
        });
    }, [game.gameMode, game.gameId, game.userId, game.gameStarted, game.gameOver, game.winner, game.gameOverReason]);

    const snapshot = useMemo(() => {
        if (game.gameMode !== 'singleplayer' || !game.gameStarted || !game.gameId || !game.userId) return null;
        return buildSoloSnapshot({ game, wordBoard, letterRack, letterBags, scoreBoard });
    }, [game, wordBoard, letterRack, letterBags, scoreBoard]);

    useEffect(() => {
        if (!snapshot || !game.userId) return;
        const hash = JSON.stringify(snapshot);
        if (hash === lastSnapshotHashRef.current) return;

        const timer = setTimeout(() => {
            fetch(getApiBaseUrl() + '/api/solo/snapshot', {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({
                    gameId: game.gameId,
                    userId: game.userId,
                    snapshot,
                }),
            }).then(() => {
                lastSnapshotHashRef.current = hash;
            }).catch((err) => {
                console.warn('[solo persistence] /api/solo/snapshot failed', err?.message || err);
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [snapshot, game.gameId, game.userId]);
}
