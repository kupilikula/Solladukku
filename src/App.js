import './App.css';
import GameFrame from './components/GameFrame';
import {validate as isValidUUID} from 'uuid';
import {useEffect, useMemo, useState, useCallback, useRef} from "react";
import {useDispatch} from "react-redux";
import {storeUserId} from "./store/actions";
import {setAutoStartPending} from "./store/GameSlice";
import {WebSocketProvider} from "./context/WebSocketContext";
import {LanguageProvider, useLanguage} from "./context/LanguageContext";

function getApiBaseUrl() {
    if (process.env.REACT_APP_WS_URL) {
        return process.env.REACT_APP_WS_URL.replace(/^ws(s?):\/\//, 'http$1://');
    }
    return window.location.origin;
}


function LandingPage({ onCreateGame, onJoinGame, onPlayComputer }) {
    const { language, toggleLanguage, t } = useLanguage();
    const [gameCode, setGameCode] = useState('');
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
        const code = gameCode.trim();
        if (/^[a-zA-Z0-9]{4,8}$/.test(code)) {
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
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Tamil Sangam MN, sans-serif',
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 32,
            }}>
                {/* Language toggle */}
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

                {/* Logo + Game title */}
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

                {/* Main card */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: 12,
                    padding: '36px 44px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24,
                    minWidth: 300,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                }}>
                    {/* Create game */}
                    <button
                        onClick={onCreateGame}
                        style={{
                            backgroundColor: '#1A5276',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: '14px 0',
                            width: '100%',
                            fontSize: 18,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.createGame}
                    </button>

                    {/* Play vs Computer */}
                    <button
                        onClick={onPlayComputer}
                        style={{
                            backgroundColor: 'white',
                            color: '#1A5276',
                            border: '2px solid #1A5276',
                            borderRadius: 8,
                            padding: '12px 0',
                            width: '100%',
                            fontSize: 16,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.playVsComputer}
                    </button>

                    {/* Divider */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        gap: 12,
                    }}>
                        <div style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
                        <span style={{ fontSize: 13, color: '#999' }}>
                            {language === 'ta' ? 'அல்லது' : 'or'}
                        </span>
                        <div style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
                    </div>

                    {/* Join game */}
                    <div style={{ width: '100%' }}>
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
                                value={gameCode}
                                onChange={e => { setGameCode(e.target.value.toLowerCase()); setCodeError(false); }}
                                onKeyDown={handleKeyDown}
                                placeholder={t.enterGameCode}
                                maxLength={8}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: 6,
                                    border: `1px solid ${codeError ? '#e53935' : '#ddd'}`,
                                    fontSize: 16,
                                    lineHeight: 1.5,
                                    fontFamily: 'monospace',
                                    outline: 'none',
                                    letterSpacing: 2,
                                }}
                            />
                            <button
                                onClick={handleJoin}
                                style={{
                                    backgroundColor: '#1A5276',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '10px 20px',
                                    fontSize: 15,
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

                {/* Help link */}
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

            {/* Help modal */}
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

    // Get or create userId from cookie
    const userId = useMemo(() => {
        let cookieValue = document.cookie.replace(/(?:(?:^|.*;\s*)solladukku\s*=\s*([^;]*).*$)|^.*$/, "$1");
        if (!isValidUUID(cookieValue)) {
            const newUserId = crypto.randomUUID();
            document.cookie = `solladukku=${newUserId}; max-age=31536000; path=/`;
            return newUserId;
        }
        return cookieValue;
    }, []);

    // Check if arriving via invite link
    const initialGameId = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('game');
        if (id && /^[a-zA-Z0-9]{4,8}$/.test(id)) {
            return id;
        }
        return null;
    }, []);

    const [gameId, setGameId] = useState(initialGameId);
    const [mode, setMode] = useState(initialGameId ? 'multiplayer' : null);

    const handleCreateGame = useCallback(() => {
        const id = crypto.randomUUID().slice(0, 6);
        const url = new URL(window.location);
        url.searchParams.set('game', id);
        window.history.replaceState({}, '', url);
        dispatch(setAutoStartPending(true));
        setGameId(id);
        setMode('multiplayer');
    }, [dispatch]);

    const handleJoinGame = useCallback((code) => {
        const url = new URL(window.location);
        url.searchParams.set('game', code);
        window.history.replaceState({}, '', url);
        setGameId(code);
        setMode('multiplayer');
    }, []);

    const handlePlayComputer = useCallback(() => {
        dispatch(storeUserId({ userId, gameId: 'solo' }));
        setMode('singleplayer');
    }, [dispatch, userId]);

    useEffect(() => {
        if (gameId && mode === 'multiplayer') {
            dispatch(storeUserId({userId, gameId}));
        }
    }, [dispatch, userId, gameId, mode]);

    // Track game entry visit
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

    // Show landing page if no gameId and not single player
    if (!gameId && mode !== 'singleplayer') {
        return <LandingPage onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} onPlayComputer={handlePlayComputer} />;
    }

    // Single player mode: no WebSocket
    if (mode === 'singleplayer') {
        return (
            <div style={{background: '#EDE8E0', height: '100vh', width: '100vw'}}>
                <GameFrame singlePlayer={true} />
            </div>
        );
    }

    return (
        <WebSocketProvider userId={userId} gameId={gameId}>
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
