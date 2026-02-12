import './App.css';
import GameFrame from './components/GameFrame';
import {validate as isValidUUID} from 'uuid';
import {useEffect, useMemo, useState, useCallback, useRef} from "react";
import {useDispatch} from "react-redux";
import {storeUserId} from "./store/actions";
import {setAutoStartPending} from "./store/GameSlice";
import {WebSocketProvider} from "./context/WebSocketContext";
import {LanguageProvider, useLanguage} from "./context/LanguageContext";

const USERNAME_STORAGE_KEY = 'solladukku_username';

function getApiBaseUrl() {
    if (process.env.REACT_APP_WS_URL) {
        return process.env.REACT_APP_WS_URL
            .replace(/^ws(s?):\/\//, 'http$1://')
            .replace(/\/ws\/?$/, '');
    }
    return window.location.origin;
}

function normalizeUsername(value) {
    const clean = (value || '').trim().slice(0, 24);
    return clean || null;
}

function getDefaultUsername() {
    return `Player${Math.floor(1000 + Math.random() * 9000)}`;
}

async function readJsonSafe(resp) {
    try {
        return await resp.json();
    } catch {
        return null;
    }
}

function getApiErrorMessage(resp, data, fallbackLabel) {
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    return `${fallbackLabel} (${resp.status})`;
}

function parseGameIdFromInput(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) return null;

    const directCode = trimmed.toLowerCase();
    if (/^[a-zA-Z0-9]{4,8}$/.test(directCode)) {
        return directCode;
    }

    const possibleUrls = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? [trimmed]
        : [`https://${trimmed}`];

    for (const candidate of possibleUrls) {
        try {
            const url = new URL(candidate);
            const code = url.searchParams.get('game');
            if (code && /^[a-zA-Z0-9]{4,8}$/.test(code)) {
                return code.toLowerCase();
            }
        } catch {
            // ignore invalid URL parse
        }
    }

    return null;
}

function LeaderboardCard({ leaderboard, loading, t }) {
    return (
        <div style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: 'white',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            padding: 16,
            boxSizing: 'border-box',
        }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1A5276', marginBottom: 10 }}>
                {t.leaderboard}
            </div>
            {loading && (
                <div style={{ fontSize: 13, color: '#777' }}>
                    {t.loading}
                </div>
            )}
            {!loading && leaderboard.length === 0 && (
                <div style={{ fontSize: 13, color: '#777' }}>
                    {t.noGamesYet}
                </div>
            )}
            {!loading && leaderboard.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {leaderboard.map((entry, index) => (
                        <div key={entry.userId} style={{
                            display: 'grid',
                            gridTemplateColumns: '28px 1fr auto',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 6,
                            backgroundColor: index < 3 ? '#f6f1e6' : '#f9f9f9',
                            fontSize: 12,
                        }}>
                            <span style={{ color: '#666' }}>#{index + 1}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.username}
                            </span>
                            <span style={{ fontWeight: 'bold', color: '#1A5276' }}>
                                {entry.rating}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function LandingPage({
    onCreatePrivateGame,
    onJoinGame,
    onPlayComputer,
    onFindRandomOpponent,
    onCancelRandomMatch,
    isMatching,
    matchingPosition,
    matchingError,
    username,
    onUsernameChange,
    leaderboard,
    leaderboardLoading,
}) {
    const { language, toggleLanguage, t } = useLanguage();
    const [joinInput, setJoinInput] = useState('');
    const [codeError, setCodeError] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // Track landing page visit
    useEffect(() => {
        fetch(getApiBaseUrl() + '/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 'landing' }),
        }).catch(() => {});
    }, []);

    const handleJoin = () => {
        const code = parseGameIdFromInput(joinInput);
        if (code) {
            setCodeError(false);
            onJoinGame(code);
        } else {
            setCodeError(true);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleJoin();
    };

    return (
        <div style={{
            background: '#EDE8E0',
            minHeight: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Tamil Sangam MN, sans-serif',
            padding: '24px 16px',
            boxSizing: 'border-box',
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
                width: '100%',
                maxWidth: 460,
            }}>
                <div style={{ position: 'absolute', top: 16, right: 20 }}>
                    <button
                        onClick={toggleLanguage}
                        style={{
                            background: 'none',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            width: 28,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            cursor: 'pointer',
                            color: '#666',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                            padding: 0,
                            lineHeight: 1,
                        }}
                    >
                        {language === 'ta' ? 'EN' : 'த'}
                    </button>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <img
                        src={process.env.PUBLIC_URL + '/logo.png'}
                        alt=""
                        style={{ height: 96, marginBottom: 12 }}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={{
                        fontSize: 56,
                        fontWeight: 'bold',
                        color: '#1A5276',
                        letterSpacing: 2,
                        lineHeight: 1.2,
                    }}>
                        சொல்மாலை
                    </div>
                </div>

                <div style={{
                    backgroundColor: 'white',
                    borderRadius: 12,
                    padding: '24px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 14,
                    width: '100%',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    boxSizing: 'border-box',
                }}>
                    <div>
                        <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
                            {t.usernameLabel}
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => onUsernameChange(e.target.value)}
                            maxLength={24}
                            style={{
                                width: '100%',
                                padding: '11px 12px',
                                borderRadius: 6,
                                border: '1px solid #ddd',
                                boxSizing: 'border-box',
                                fontSize: 16,
                                lineHeight: '24px',
                                height: 'auto',
                                WebkitAppearance: 'none',
                                fontFamily: 'Tamil Sangam MN, sans-serif',
                                display: 'block',
                            }}
                        />
                    </div>

                    <button
                        onClick={onCreatePrivateGame}
                        style={{
                            backgroundColor: '#1A5276',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: '12px 0',
                            width: '100%',
                            fontSize: 17,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.createGame}
                    </button>

                    <button
                        onClick={onFindRandomOpponent}
                        disabled={isMatching}
                        style={{
                            backgroundColor: isMatching ? '#e8eef2' : 'white',
                            color: '#1A5276',
                            border: '2px solid #1A5276',
                            borderRadius: 8,
                            padding: '11px 0',
                            width: '100%',
                            fontSize: 16,
                            fontWeight: 'bold',
                            cursor: isMatching ? 'default' : 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {isMatching
                            ? t.findingOpponent
                            : t.playRandomOpponent}
                    </button>

                    {isMatching && (
                        <div style={{
                            border: '1px solid #bfd3e2',
                            backgroundColor: '#f4f9fc',
                            borderRadius: 8,
                            padding: '10px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                        }}>
                            <div style={{ fontSize: 12, color: '#345' }}>
                                {t.waitingForPlayer}
                                {matchingPosition ? ` (${t.queue} #${matchingPosition})` : ''}
                            </div>
                            <button
                                onClick={onCancelRandomMatch}
                                style={{
                                    backgroundColor: '#C0392B',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '6px 10px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    fontFamily: 'Tamil Sangam MN, sans-serif',
                                }}
                            >
                                {t.cancel}
                            </button>
                        </div>
                    )}

                    {matchingError && (
                        <div style={{ fontSize: 12, color: '#e53935' }}>
                            {matchingError}
                        </div>
                    )}

                    <button
                        onClick={onPlayComputer}
                        style={{
                            backgroundColor: '#fffaf0',
                            color: '#1A5276',
                            border: '1px solid #d9cba8',
                            borderRadius: 8,
                            padding: '11px 0',
                            width: '100%',
                            fontSize: 15,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.playVsComputer}
                    </button>

                    <div style={{ borderTop: '1px solid #e6e6e6', marginTop: 4, paddingTop: 12 }}>
                        <div style={{
                            fontSize: 14,
                            fontWeight: '500',
                            color: '#333',
                            marginBottom: 8,
                        }}>
                            {t.joinGame}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                value={joinInput}
                                onChange={e => { setJoinInput(e.target.value); setCodeError(false); }}
                                onKeyDown={handleKeyDown}
                                placeholder={t.enterGameCode}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 6,
                                    border: `1px solid ${codeError ? '#e53935' : '#ddd'}`,
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    fontFamily: 'Tamil Sangam MN, sans-serif',
                                    outline: 'none',
                                }}
                            />
                            <button
                                onClick={handleJoin}
                                style={{
                                    backgroundColor: '#1A5276',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '10px 16px',
                                    fontSize: 14,
                                    cursor: 'pointer',
                                    fontFamily: 'Tamil Sangam MN, sans-serif',
                                    fontWeight: 'bold',
                                }}
                            >
                                {t.join}
                            </button>
                        </div>
                        {codeError && (
                            <div style={{ fontSize: 12, color: '#e53935', marginTop: 6 }}>
                                {t.invalidCode}
                            </div>
                        )}
                    </div>
                </div>

                {leaderboard.length > 0 && (
                    <LeaderboardCard leaderboard={leaderboard} loading={leaderboardLoading} t={t} />
                )}

                <button
                    onClick={() => setShowHelp(true)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#1A5276',
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    {t.howToPlay}
                </button>
            </div>

            {showHelp && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 200000,
                }} onClick={() => setShowHelp(false)}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: 12,
                        padding: '30px',
                        maxWidth: 480,
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
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
                        <button onClick={() => setShowHelp(false)} style={{
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
            )}
        </div>
    );
}

function AppContent() {
    const dispatch = useDispatch();
    const { t } = useLanguage();
    const fallbackUsernameRef = useRef(getDefaultUsername());

    const userId = useMemo(() => {
        let cookieValue = document.cookie.replace(/(?:(?:^|.*;\s*)solladukku\s*=\s*([^;]*).*$)|^.*$/, "$1");
        if (!isValidUUID(cookieValue)) {
            const newUserId = crypto.randomUUID();
            document.cookie = `solladukku=${newUserId}; max-age=31536000; path=/`;
            return newUserId;
        }
        return cookieValue;
    }, []);

    const [username, setUsername] = useState(() => {
        const saved = normalizeUsername(localStorage.getItem(USERNAME_STORAGE_KEY));
        return saved || fallbackUsernameRef.current;
    });
    const effectiveUsername = normalizeUsername(username) || fallbackUsernameRef.current;

    useEffect(() => {
        localStorage.setItem(USERNAME_STORAGE_KEY, effectiveUsername);
    }, [effectiveUsername]);

    const initialGameId = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('game');
        if (id && /^[a-zA-Z0-9]{4,8}$/.test(id)) {
            return id.toLowerCase();
        }
        return null;
    }, []);

    const [gameId, setGameId] = useState(initialGameId);
    const [mode, setMode] = useState(initialGameId ? 'multiplayer' : null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(true);
    const [isMatching, setIsMatching] = useState(false);
    const [matchingPosition, setMatchingPosition] = useState(null);
    const [matchingError, setMatchingError] = useState('');

    const enterMultiplayerGame = useCallback((id, starterUserId = null) => {
        const url = new URL(window.location);
        url.searchParams.set('game', id);
        if (starterUserId === userId) {
            url.searchParams.set('invite', '1');
        } else {
            url.searchParams.delete('invite');
        }
        window.history.replaceState({}, '', url);
        if (starterUserId) {
            dispatch(setAutoStartPending(starterUserId === userId));
        }
        setIsMatching(false);
        setMatchingPosition(null);
        setGameId(id);
        setMode('multiplayer');
    }, [dispatch, userId]);

    const handleCreatePrivateGame = useCallback(() => {
        const id = crypto.randomUUID().slice(0, 6).toLowerCase();
        dispatch(setAutoStartPending(true));
        enterMultiplayerGame(id, userId);
    }, [dispatch, enterMultiplayerGame, userId]);

    const handleJoinGame = useCallback((code) => {
        dispatch(setAutoStartPending(false));
        enterMultiplayerGame(code, null);
    }, [dispatch, enterMultiplayerGame]);

    const handlePlayComputer = useCallback(() => {
        dispatch(storeUserId({ userId, username: effectiveUsername, gameId: 'solo' }));
        setMode('singleplayer');
    }, [dispatch, userId, effectiveUsername]);

    const handleFindRandomOpponent = useCallback(async () => {
        setMatchingError('');
        setIsMatching(true);
        try {
            const resp = await fetch(getApiBaseUrl() + '/api/matchmaking/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, username: effectiveUsername }),
            });
            const data = await readJsonSafe(resp);
            if (!resp.ok) {
                throw new Error(getApiErrorMessage(resp, data, t.failedToStartMatchmaking));
            }
            if (data.status === 'matched' && data.gameId) {
                enterMultiplayerGame(data.gameId, data.starterUserId || null);
                return;
            }
            setMatchingPosition(data.position || null);
        } catch (err) {
            setIsMatching(false);
            setMatchingError(err?.message || t.failedToStartMatchmaking);
        }
    }, [enterMultiplayerGame, userId, effectiveUsername, t]);

    const handleCancelRandomMatch = useCallback(async () => {
        setIsMatching(false);
        setMatchingPosition(null);
        try {
            await fetch(getApiBaseUrl() + '/api/matchmaking/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
        } catch {
            // no-op
        }
    }, [userId]);

    useEffect(() => {
        if (!isMatching) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const resp = await fetch(`${getApiBaseUrl()}/api/matchmaking/status?userId=${encodeURIComponent(userId)}`);
                const data = await readJsonSafe(resp);
                if (!resp.ok) {
                    throw new Error(getApiErrorMessage(resp, data, t.matchmakingCheckFailed));
                }
                if (cancelled) return;
                if (data.status === 'matched' && data.gameId) {
                    enterMultiplayerGame(data.gameId, data.starterUserId || null);
                    return;
                }
                if (data.status === 'waiting') {
                    setMatchingPosition(data.position || null);
                    return;
                }
                if (data.status === 'idle') {
                    setIsMatching(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setMatchingError(err?.message || t.matchmakingCheckFailed);
                }
            }
        };

        const interval = setInterval(poll, 2000);
        poll();
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [isMatching, userId, enterMultiplayerGame, t]);

    useEffect(() => {
        fetch(getApiBaseUrl() + '/api/leaderboard?limit=10')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) setLeaderboard(data);
            })
            .catch(() => {})
            .finally(() => setLeaderboardLoading(false));
    }, []);

    useEffect(() => {
        fetch(getApiBaseUrl() + '/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username: effectiveUsername }),
        }).catch(() => {});
    }, [userId, effectiveUsername]);

    useEffect(() => {
        if (gameId && mode === 'multiplayer') {
            dispatch(storeUserId({ userId, username: effectiveUsername, gameId }));
        }
    }, [dispatch, userId, effectiveUsername, gameId, mode]);

    const visitTracked = useRef(false);
    useEffect(() => {
        if (gameId && !visitTracked.current) {
            visitTracked.current = true;
            fetch(getApiBaseUrl() + '/api/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 'game', gameId, userId }),
            }).catch(() => {});
        }
    }, [gameId, userId]);

    if (!gameId && mode !== 'singleplayer') {
        return (
            <LandingPage
                onCreatePrivateGame={handleCreatePrivateGame}
                onJoinGame={handleJoinGame}
                onPlayComputer={handlePlayComputer}
                onFindRandomOpponent={handleFindRandomOpponent}
                onCancelRandomMatch={handleCancelRandomMatch}
                isMatching={isMatching}
                matchingPosition={matchingPosition}
                matchingError={matchingError}
                username={effectiveUsername}
                onUsernameChange={setUsername}
                leaderboard={leaderboard}
                leaderboardLoading={leaderboardLoading}
            />
        );
    }

    if (mode === 'singleplayer') {
        return (
            <div style={{background: '#EDE8E0', height: '100vh', width: '100vw'}}>
                <GameFrame singlePlayer={true} />
            </div>
        );
    }

    return (
        <WebSocketProvider userId={userId} username={effectiveUsername} gameId={gameId}>
            <div style={{background: '#EDE8E0', height: '100vh', width: '100vw'}}>
                <GameFrame />
            </div>
        </WebSocketProvider>
    );
}

function App() {
    return (
        <LanguageProvider>
            <AppContent />
        </LanguageProvider>
    );
}

export default App;
