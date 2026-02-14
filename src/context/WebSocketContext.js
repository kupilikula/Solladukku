import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { addOtherPlayerTurn, addPlayers, syncNewGame, syncOpponentDraw, syncSwapTiles, syncPassTurn, setGameOver, returnAllUnplayedTilesToRackFromBoard } from '../store/actions';
import { setMyTurn, setPlayerName } from '../store/GameSlice';
import { getWsBaseUrl } from '../utils/runtimeUrls';

const WebSocketContext = createContext(null);

let requestIdCounter = 0;

export function WebSocketProvider({ userId, gameId, username, children }) {
    const dispatch = useDispatch();
    const store = useStore();
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const isCleanedUpRef = useRef(false);
    // Map<requestId, { resolve, timer }> for request-response pattern
    const pendingRequestsRef = useRef(new Map());
    const closeEventRef = useRef(null);

    const WS_BASE = getWsBaseUrl();
    const WS_URL = `${WS_BASE}/${gameId}/${userId}?name=${encodeURIComponent(username || '')}`;

    const connect = useCallback(() => {
        // Don't connect if we've been cleaned up (StrictMode unmount)
        if (isCleanedUpRef.current) {
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        // Close any existing connection first
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        try {
            console.log('Attempting WebSocket connection to:', WS_URL);
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                if (isCleanedUpRef.current) {
                    ws.close();
                    return;
                }
                console.log('WebSocket connected');
                setIsConnected(true);
                setConnectionError(null);
                closeEventRef.current = null;
                if (username) {
                    ws.send(JSON.stringify({
                        messageType: 'setProfile',
                        username,
                    }));
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                setIsConnected(false);
                closeEventRef.current = { code: event.code, reason: event.reason || '' };
                if (event.reason) {
                    setConnectionError(event.reason);
                }

                const isFatalClose =
                    event.code === 4000 ||
                    event.code === 4001 ||
                    event.code === 4002 ||
                    event.code === 4003;

                // Only attempt to reconnect if not cleaned up and close is recoverable
                if (!isFatalClose && !isCleanedUpRef.current && !reconnectTimeoutRef.current) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectTimeoutRef.current = null;
                        connect();
                    }, 3000);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                console.error('WebSocket readyState:', ws.readyState);
                setConnectionError('Connection failed');
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('WebSocket message received:', message.messageType, message);

                    switch (message.messageType) {
                        case 'turn': {
                            // Return any unplayed tiles to the rack before applying opponent's turn,
                            // otherwise they get silently cleared and lost
                            const unplayedTiles = store.getState().WordBoard.unplayedTilesWithPositions;
                            if (unplayedTiles.length > 0) {
                                dispatch(returnAllUnplayedTilesToRackFromBoard(unplayedTiles));
                            }
                            dispatch(addOtherPlayerTurn({ turnInfo: message.turnInfo }));
                            break;
                        }
                        case 'playerJoined': {
                            // Someone joined our game - we keep our turn
                            dispatch(addPlayers({
                                otherPlayerIds: message.playerIds,
                                players: message.players,
                            }));
                            // Re-sync only for initial draw phase (before any turns are played).
                            // If gameplay has progressed, sending newGame would incorrectly reset state.
                            const gameState = store.getState().Game;
                            const boardState = store.getState().WordBoard;
                            const scoreState = store.getState().ScoreBoard;
                            const hasProgress =
                                (boardState.playedTilesWithPositions?.length || 0) > 0 ||
                                (scoreState.allTurns?.length || 0) > 0;
                            console.log('[ws playerJoined] resync check', {
                                gameId,
                                userId,
                                joinedPlayerIds: message.playerIds,
                                gameStarted: gameState.gameStarted,
                                hasMyInitialDraw: Boolean(gameState.myInitialDraw),
                                playedTiles: boardState.playedTilesWithPositions?.length || 0,
                                turns: scoreState.allTurns?.length || 0,
                                hasProgress,
                            });
                            if (gameState.gameStarted && gameState.myInitialDraw && !hasProgress) {
                                setTimeout(() => {
                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                        console.log('[ws playerJoined] sending newGame re-sync', {
                                            gameId,
                                            userId,
                                        });
                                        wsRef.current.send(JSON.stringify({
                                            messageType: 'newGame',
                                            startingPlayerId: gameState.userId,
                                            drawnTiles: gameState.myInitialDraw,
                                        }));
                                    }
                                }, 300);
                            }
                            break;
                        }
                        case 'joinedExistingGame':
                            // We joined an existing game.
                            // Do not force turn=false here because resume hydration may already
                            // know the real currentTurnUserId.
                            dispatch(addPlayers({
                                otherPlayerIds: message.playerIds,
                                players: message.players,
                            }));
                            {
                                const currentTurnUserId = store.getState().Game.currentTurnUserId;
                                if (currentTurnUserId) {
                                    dispatch(setMyTurn(currentTurnUserId === userId));
                                    console.log('Joined existing game, preserving turn from state:', currentTurnUserId);
                                } else {
                                    dispatch(setMyTurn(false));
                                    console.log('Joined existing game, waiting for turn (no current turn state yet)');
                                }
                            }
                            break;
                        case 'roomState':
                            // Reconnection - just update who's in the room, don't change turn
                            dispatch(addPlayers({
                                otherPlayerIds: message.playerIds,
                                players: message.players,
                            }));
                            console.log('Reconnected, other players:', message.playerIds);
                            break;
                        case 'newGame':
                            // Ignore stale/re-sync newGame packets once gameplay has progressed.
                            // This prevents accidental resets during refresh/reconnection.
                            {
                                const boardState = store.getState().WordBoard;
                                const scoreState = store.getState().ScoreBoard;
                                const hasProgress =
                                    (boardState.playedTilesWithPositions?.length || 0) > 0 ||
                                    (scoreState.allTurns?.length || 0) > 0;
                                if (hasProgress) {
                                    console.log('[ws newGame] ignored due to local progress', {
                                        gameId,
                                        userId,
                                        playedTiles: boardState.playedTilesWithPositions?.length || 0,
                                        turns: scoreState.allTurns?.length || 0,
                                        incomingStartingPlayerId: message.startingPlayerId,
                                    });
                                    break;
                                }
                            }
                            // Other player started a new game
                            dispatch(syncNewGame({
                                startingPlayerId: message.startingPlayerId,
                                drawnTiles: message.drawnTiles,
                            }));
                            console.log('Other player started new game');
                            break;
                        case 'drewTiles':
                            // Other player drew tiles - deduct from our bag
                            dispatch(syncOpponentDraw({
                                drawnTiles: message.drawnTiles,
                            }));
                            console.log('Other player drew tiles:', message.drawnTiles);
                            break;
                        case 'swapTiles':
                            // Opponent swapped tiles
                            dispatch(syncSwapTiles({
                                returnedTiles: message.returnedTiles,
                                drawnTiles: message.drawnTiles,
                            }));
                            console.log('Opponent swapped tiles');
                            break;
                        case 'passTurn':
                            // Opponent passed their turn
                            dispatch(syncPassTurn());
                            console.log('Opponent passed their turn');
                            break;
                        case 'gameOver':
                            // Game ended
                            dispatch(setGameOver({
                                winner: message.winner,
                                reason: message.reason,
                            }));
                            console.log('Game over:', message.reason);
                            break;
                        case 'chat':
                            setChatMessages(prev => [...prev, {
                                userId: message.userId,
                                username: message.username || null,
                                text: message.text,
                                timestamp: message.timestamp,
                            }]);
                            break;
                        case 'playerProfile':
                            dispatch(setPlayerName({
                                userId: message.userId,
                                name: message.username,
                            }));
                            break;
                        case 'validateWordsResult': {
                            // Response to a validateWords request — resolve pending promise
                            const pending = pendingRequestsRef.current.get(message.requestId);
                            if (pending) {
                                clearTimeout(pending.timer);
                                pendingRequestsRef.current.delete(message.requestId);
                                pending.resolve(message.results);
                            }
                            break;
                        }
                        case 'gameState':
                            // Handle game state sync if needed
                            break;
                        default:
                            console.log('Unknown message type:', message.messageType);
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
            setConnectionError('Failed to connect');
        }
    }, [WS_URL, dispatch, username, store, gameId, userId]);

    useEffect(() => {
        isCleanedUpRef.current = false;
        connect();

        return () => {
            isCleanedUpRef.current = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            // Clean up pending requests
            for (const [, pending] of pendingRequestsRef.current) {
                clearTimeout(pending.timer);
                pending.resolve(null);
            }
            pendingRequestsRef.current.clear();

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    const sendMessage = useCallback((message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const msgStr = JSON.stringify(message);
            console.log('Sending WebSocket message:', message.messageType);
            wsRef.current.send(msgStr);
            return true;
        } else {
            console.warn('WebSocket not connected, cannot send message. State:', wsRef.current?.readyState);
            return false;
        }
    }, []);

    const sendTurn = useCallback((turnInfo) => {
        return sendMessage({
            messageType: 'turn',
            turnInfo: turnInfo,
        });
    }, [sendMessage]);

    const sendChat = useCallback((text) => {
        const trimmed = (text || '').slice(0, 500);
        if (!trimmed) return false;
        return sendMessage({
            messageType: 'chat',
            text: trimmed,
        });
    }, [sendMessage]);

    /**
     * Send a request-response message. Returns a Promise that resolves
     * with the server's response data, or null on timeout/failure.
     * @param {object} message - Must include messageType
     * @param {number} timeoutMs - Timeout in ms (default 5000)
     */
    const sendRequest = useCallback((message, timeoutMs = 5000) => {
        return new Promise((resolve) => {
            const requestId = `req-${++requestIdCounter}-${Date.now()}`;

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                resolve(null); // Not connected — caller handles permissive fallback
                return;
            }

            const timer = setTimeout(() => {
                pendingRequestsRef.current.delete(requestId);
                resolve(null); // Timeout — caller handles permissive fallback
            }, timeoutMs);

            pendingRequestsRef.current.set(requestId, { resolve, timer });

            const msgStr = JSON.stringify({ ...message, requestId });
            wsRef.current.send(msgStr);
        });
    }, []);

    const value = {
        isConnected,
        connectionError,
        closeEvent: closeEventRef.current,
        sendMessage,
        sendTurn,
        sendRequest,
        sendChat,
        chatMessages,
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        return {
            isConnected: false,
            connectionError: null,
            closeEvent: null,
            sendMessage: () => {},
            sendTurn: () => {},
            sendRequest: () => Promise.resolve(null),
            sendChat: () => {},
            chatMessages: [],
        };
    }
    return context;
}
