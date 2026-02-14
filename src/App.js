import './App.css';
import GameFrame from './components/GameFrame';
import AnalyticsViewer from './components/AnalyticsViewer';
import GameReviewViewer from './components/GameReviewViewer';
import {validate as isValidUUID} from 'uuid';
import {useEffect, useMemo, useState, useCallback, useRef} from "react";
import {useDispatch} from "react-redux";
import {hydrateGameSnapshot, storeUserId} from "./store/actions";
import {setAutoStartPending, setNeedsInitialDraw, setSoloResumePending} from "./store/GameSlice";
import {WebSocketProvider} from "./context/WebSocketContext";
import {LanguageProvider, useLanguage} from "./context/LanguageContext";
import { loadDictionary } from './utils/dictionary';
import { getApiBaseUrl } from './utils/runtimeUrls';

const USERNAME_STORAGE_KEY = 'solladukku_username';

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

function buildJoinerSnapshotFromLatest(latestSnapshot, joiningUserId) {
    if (!latestSnapshot?.state || typeof latestSnapshot.state !== 'object') return null;
    const sourceState = latestSnapshot.state;
    const sourceScore = sourceState.scoreBoard || {};

    const sourceMyScore = Number(sourceScore.myTotalScore || 0);
    const sourceOpponentScore = Number((sourceScore.otherPlayersTotalScores || [0])[0] || 0);

    return {
        ...sourceState,
        letterRack: {
            tilesList: Array(14).fill(null),
        },
        scoreBoard: {
            ...sourceScore,
            myTotalScore: sourceOpponentScore,
            otherPlayersTotalScores: [sourceMyScore],
        },
        game: {
            ...(sourceState.game || {}),
            playerNames: {
                ...((sourceState.game || {}).playerNames || {}),
            },
            otherPlayerIds: [latestSnapshot.userId].filter(Boolean),
            gameStarted: true,
        },
        _meta: {
            source: 'latestSnapshot',
            sourceUserId: latestSnapshot.userId,
            forUserId: joiningUserId,
        },
    };
}

function buildSnapshotFromTurns(detail, userId) {
    const game = detail?.game || {};
    const turns = Array.isArray(detail?.turns) ? detail.turns : [];
    const isPlayer1 = game.player1_id === userId;
    const opponentUserId = isPlayer1 ? game.player2_id : game.player1_id;
    const myScore = Number(isPlayer1 ? (game.player1_score || 0) : (game.player2_score || 0));
    const opponentScore = Number(isPlayer1 ? (game.player2_score || 0) : (game.player1_score || 0));

    const playedByPos = new Map();
    const allTurns = turns.map((turn) => {
        let placedTiles = Array.isArray(turn.placedTiles) ? turn.placedTiles : [];
        if (!placedTiles.length && Array.isArray(turn.formedWords)) {
            placedTiles = turn.formedWords
                .flatMap((wordTiles) => (Array.isArray(wordTiles) ? wordTiles : []))
                .filter((tileInfo) => tileInfo && !tileInfo.alreadyPlayed)
                .map((tileInfo) => ({
                    row: tileInfo.row,
                    col: tileInfo.col,
                    letter: tileInfo.letter || '',
                    points: Number(tileInfo?.points || 0),
                }));
        }

        const normalizedPlaced = placedTiles
            .map((tile) => {
                const row = Number(tile?.row);
                const col = Number(tile?.col);
                if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
                const normalized = {
                    row,
                    col,
                    tile: {
                        key: tile?.key || tile?.letter || '',
                        letter: tile?.letter || '',
                        points: Number(tile?.points || 0),
                    },
                };
                playedByPos.set(`${row}:${col}`, normalized);
                return normalized;
            })
            .filter(Boolean);

        return {
            turnUserId: turn.user_id || null,
            turnType: turn.turn_type || 'word',
            turnScore: Number(turn.score || 0),
            wordScores: Array.isArray(turn.wordScores) ? turn.wordScores : [],
            newlyPlayedTilesWithPositions: normalizedPlaced,
            turnFormedWords: [],
            fetchedLettersFromBag: [],
        };
    });

    const playedTilesWithPositions = Array.from(playedByPos.values());
    const lastTurnUserId = turns.length > 0 ? turns[turns.length - 1]?.user_id : null;
    const currentTurnUserId = game.ended_at
        ? (lastTurnUserId || userId)
        : (lastTurnUserId
            ? (lastTurnUserId === userId ? opponentUserId : userId)
            : (game.player1_id || userId));

    return {
        version: 1,
        gameId: game.game_id || null,
        game: {
            gameStarted: true,
            currentTurnUserId: currentTurnUserId || userId,
            otherPlayerIds: opponentUserId ? [opponentUserId] : [],
            playerNames: {
                ...(game.player1_id ? { [game.player1_id]: game.player1_name || game.player1_id } : {}),
                ...(game.player2_id ? { [game.player2_id]: game.player2_name || game.player2_id } : {}),
            },
            consecutivePasses: 0,
            gameOver: Boolean(game.ended_at),
            winner: game.winner_id || null,
            gameOverReason: game.game_over_reason || null,
            myInitialDraw: null,
        },
        wordBoard: {
            playedTilesWithPositions,
        },
        letterRack: {
            tilesList: Array(14).fill(null),
        },
        scoreBoard: {
            myCompletedTurns: allTurns.filter((t) => t.turnUserId === userId).length,
            myTotalScore: myScore,
            otherPlayersTotalScores: [opponentScore],
            allTurns,
        },
    };
}

function buildSinglePlayerSnapshotFromDetail(detail, userId) {
    const base = buildSnapshotFromTurns(detail, userId);
    const game = detail?.game || {};
    const aiUserId = 'computer-player';

    return {
        ...base,
        gameId: game.game_id || base.gameId,
        game: {
            ...(base.game || {}),
            gameStarted: true,
            otherPlayerIds: [aiUserId],
            playerNames: {
                ...((base.game || {}).playerNames || {}),
                [aiUserId]: 'Computer',
            },
            currentTurnUserId: (base.game || {}).currentTurnUserId || userId,
        },
    };
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

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(`${value}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function MyGamesCard({ myGames, loading, error, onContinue, onReview, t }) {
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
                {t.myGames}
            </div>
            {loading ? (
                <div style={{ fontSize: 13, color: '#777' }}>{t.loading}</div>
            ) : null}
            {!loading && error ? (
                <div style={{ fontSize: 12, color: '#e53935' }}>{error}</div>
            ) : null}
            {!loading && !error && myGames.length === 0 ? (
                <div style={{ fontSize: 13, color: '#777' }}>{t.noGamesYet}</div>
            ) : null}
            {!loading && !error && myGames.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {myGames.map((game) => {
                        const statusColor = game.status === 'in_progress' ? '#0D6E5C' : '#60717f';
                        return (
                            <div key={`${game.gameId}-${game.id}`} style={{
                                border: '1px solid #e5edf3',
                                borderRadius: 8,
                                padding: '8px 10px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#244252' }}>{game.gameId}</div>
                                    <div style={{ fontSize: 11, color: statusColor, fontWeight: 'bold' }}>
                                        {game.status === 'in_progress' ? t.inProgress : t.finished}
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, color: '#4c5e6b', marginTop: 2 }}>
                                    {game.opponentName || t.opponent}
                                </div>
                                <div style={{ fontSize: 11, color: '#73838f', marginTop: 2 }}>
                                    {formatDateTime(game.endedAt || game.startedAt)}
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                    {game.status === 'in_progress' ? (
                                        <button
                                            onClick={() => onContinue(game.gameId)}
                                            style={{
                                                backgroundColor: '#1A5276',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: 6,
                                                padding: '5px 10px',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                fontFamily: 'Tamil Sangam MN, sans-serif',
                                            }}
                                        >
                                            {t.continueGame}
                                        </button>
                                    ) : null}
                                    <button
                                        onClick={() => onReview(game.gameId)}
                                        style={{
                                            backgroundColor: '#f4f9fc',
                                            color: '#1A5276',
                                            border: '1px solid #bfd3e2',
                                            borderRadius: 6,
                                            padding: '5px 10px',
                                            fontSize: 12,
                                            cursor: 'pointer',
                                            fontFamily: 'Tamil Sangam MN, sans-serif',
                                        }}
                                    >
                                        {t.reviewGame}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
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
    myGames,
    myGamesLoading,
    myGamesError,
    onContinueGame,
    onReviewGame,
    usernameError,
    usernameBlocked,
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
        if (usernameBlocked) return;
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
                        {usernameError ? (
                            <div style={{ fontSize: 12, color: '#e53935', marginTop: 6 }}>
                                {usernameError}
                            </div>
                        ) : null}
                    </div>

                    <button
                        onClick={onCreatePrivateGame}
                        disabled={usernameBlocked}
                        style={{
                            backgroundColor: usernameBlocked ? '#9fb4c2' : '#1A5276',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: '12px 0',
                            width: '100%',
                            fontSize: 17,
                            fontWeight: 'bold',
                            cursor: usernameBlocked ? 'default' : 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.createGame}
                    </button>

                    <button
                        onClick={onFindRandomOpponent}
                        disabled={isMatching || usernameBlocked}
                        style={{
                            backgroundColor: (isMatching || usernameBlocked) ? '#e8eef2' : 'white',
                            color: usernameBlocked ? '#8aa1b0' : '#1A5276',
                            border: '2px solid #1A5276',
                            borderRadius: 8,
                            padding: '11px 0',
                            width: '100%',
                            fontSize: 16,
                            fontWeight: 'bold',
                            cursor: (isMatching || usernameBlocked) ? 'default' : 'pointer',
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
                        disabled={usernameBlocked}
                        style={{
                            backgroundColor: usernameBlocked ? '#f0f0f0' : '#fffaf0',
                            color: usernameBlocked ? '#8aa1b0' : '#1A5276',
                            border: '1px solid #d9cba8',
                            borderRadius: 8,
                            padding: '11px 0',
                            width: '100%',
                            fontSize: 15,
                            fontWeight: 'bold',
                            cursor: usernameBlocked ? 'default' : 'pointer',
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
                                disabled={usernameBlocked}
                                style={{
                                    backgroundColor: usernameBlocked ? '#9fb4c2' : '#1A5276',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '10px 16px',
                                    fontSize: 14,
                                    cursor: usernameBlocked ? 'default' : 'pointer',
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
                <MyGamesCard
                    myGames={myGames}
                    loading={myGamesLoading}
                    error={myGamesError}
                    onContinue={onContinueGame}
                    onReview={onReviewGame}
                    t={t}
                />

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
        if (id && /^solo-[a-zA-Z0-9]{4,32}$/.test(id)) {
            return id.toLowerCase();
        }
        if (id && /^[a-zA-Z0-9]{4,8}$/.test(id)) {
            return id.toLowerCase();
        }
        return null;
    }, []);
    const analyticsMode = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('analytics') === '1';
    }, []);

    const [gameId, setGameId] = useState(initialGameId);
    const [mode, setMode] = useState(() => {
        if (!initialGameId) return null;
        return initialGameId.startsWith('solo-') ? 'singleplayer' : 'multiplayer';
    });
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(true);
    const [isMatching, setIsMatching] = useState(false);
    const [matchingPosition, setMatchingPosition] = useState(null);
    const [matchingError, setMatchingError] = useState('');
    const [myGames, setMyGames] = useState([]);
    const [myGamesLoading, setMyGamesLoading] = useState(false);
    const [myGamesError, setMyGamesError] = useState('');
    const [reviewDetail, setReviewDetail] = useState(null);
    const [singlePlayerResumeMode, setSinglePlayerResumeMode] = useState(() => Boolean(initialGameId && initialGameId.startsWith('solo-')));
    const [usernameError, setUsernameError] = useState('');
    const [usernameAvailable, setUsernameAvailable] = useState(true);
    const initialGameIdRef = useRef(initialGameId);

    const exitAnalytics = useCallback(() => {
        const url = new URL(window.location);
        url.searchParams.delete('analytics');
        window.history.replaceState({}, '', url);
        window.location.reload();
    }, []);

    useEffect(() => {
        if (analyticsMode) return;
        loadDictionary();
    }, [analyticsMode]);

    const exitGameLinkToLanding = useCallback((errorMessage) => {
        const url = new URL(window.location);
        url.searchParams.delete('game');
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
        setGameId(null);
        setMode(null);
        setSinglePlayerResumeMode(false);
        dispatch(setSoloResumePending(false));
        if (errorMessage) {
            setMyGamesError(errorMessage);
        }
    }, [dispatch]);

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
        if (!usernameAvailable) return;
        const id = crypto.randomUUID().slice(0, 6).toLowerCase();
        dispatch(setAutoStartPending(true));
        enterMultiplayerGame(id, userId);
    }, [dispatch, enterMultiplayerGame, userId, usernameAvailable]);

    const handleJoinGame = useCallback((code) => {
        if (!usernameAvailable) return;
        dispatch(setAutoStartPending(false));
        enterMultiplayerGame(code, null);
    }, [dispatch, enterMultiplayerGame, usernameAvailable]);

    const handlePlayComputer = useCallback(() => {
        if (!usernameAvailable) return;
        const soloGameId = `solo-${crypto.randomUUID().slice(0, 8)}`;
        const url = new URL(window.location);
        url.searchParams.set('game', soloGameId);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
        dispatch(setSoloResumePending(false));
        setSinglePlayerResumeMode(false);
        dispatch(storeUserId({ userId, username: effectiveUsername, gameId: soloGameId }));
        setGameId(soloGameId);
        setMode('singleplayer');
    }, [dispatch, userId, effectiveUsername, usernameAvailable]);

    const handleReviewGame = useCallback(async (targetGameId) => {
        if (!targetGameId) return;
        try {
            const resp = await fetch(
                `${getApiBaseUrl()}/api/games/${encodeURIComponent(targetGameId)}?userId=${encodeURIComponent(userId)}`
            );
            const data = await readJsonSafe(resp);
            if (!resp.ok) {
                throw new Error(getApiErrorMessage(resp, data, t.reviewLoadFailed));
            }
            setReviewDetail(data);
            setMode('review');
        } catch (err) {
            setMyGamesError(err?.message || t.reviewLoadFailed);
        }
    }, [userId, t]);

    const handleContinueGame = useCallback((targetGameId) => {
        if (!targetGameId) return;
        const selected = myGames.find((g) => g.gameId === targetGameId);
        if (selected?.gameType === 'singleplayer' || selected?.player2Id === 'computer-player') {
            fetch(`${getApiBaseUrl()}/api/games/${encodeURIComponent(targetGameId)}?userId=${encodeURIComponent(userId)}`)
                .then(async (resp) => {
                    const data = await readJsonSafe(resp);
                    if (!resp.ok) {
                        throw new Error(getApiErrorMessage(resp, data, t.resumeLoadFailed));
                    }
                    return data;
                })
                .then((data) => {
                    let snapshot = data.snapshotForUser?.state || data.latestSnapshot?.state || null;
                    if (!snapshot) {
                        snapshot = buildSinglePlayerSnapshotFromDetail(data, userId);
                    }
                    dispatch(storeUserId({ userId, username: effectiveUsername, gameId: targetGameId }));
                    if (snapshot) {
                        dispatch(hydrateGameSnapshot({ gameId: targetGameId, snapshot, mode: 'singleplayer' }));
                    }
                    const url = new URL(window.location);
                    url.searchParams.set('game', targetGameId);
                    url.searchParams.delete('invite');
                    window.history.replaceState({}, '', url);
                    setSinglePlayerResumeMode(true);
                    setGameId(targetGameId);
                    setMode('singleplayer');
                })
                .catch((err) => {
                    setMyGamesError(err?.message || t.resumeLoadFailed);
                });
            return;
        }

        dispatch(setAutoStartPending(false));
        enterMultiplayerGame(targetGameId, null);
    }, [dispatch, enterMultiplayerGame, myGames, userId, effectiveUsername, t]);

    const handleFindRandomOpponent = useCallback(async () => {
        if (!usernameAvailable) return;
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
    }, [enterMultiplayerGame, userId, effectiveUsername, t, usernameAvailable]);

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
        if (analyticsMode) return;
        if (gameId || mode === 'singleplayer') return;
        let cancelled = false;
        setMyGamesLoading(true);
        setMyGamesError('');

        fetch(`${getApiBaseUrl()}/api/games?userId=${encodeURIComponent(userId)}&limit=20`)
            .then(async (resp) => {
                const data = await readJsonSafe(resp);
                if (!resp.ok) {
                    throw new Error(getApiErrorMessage(resp, data, t.gamesLoadFailed));
                }
                return data;
            })
            .then((data) => {
                if (cancelled) return;
                const items = Array.isArray(data?.items) ? data.items : [];
                const mapped = items.map((item) => {
                    const iAmPlayer1 = item.player1Id === userId;
                    const isComputerGame = item.player2Id === 'computer-player' || item.gameType === 'singleplayer';
                    return {
                        ...item,
                        opponentName: isComputerGame
                            ? t.computer
                            : (iAmPlayer1
                                ? (item.player2Name || item.player2Id || t.opponent)
                                : (item.player1Name || item.player1Id || t.opponent)),
                    };
                });
                setMyGames(mapped);
            })
            .catch((err) => {
                if (!cancelled) {
                    setMyGamesError(err?.message || t.gamesLoadFailed);
                }
            })
            .finally(() => {
                if (!cancelled) setMyGamesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [analyticsMode, gameId, mode, userId, t]);

    useEffect(() => {
        fetch(getApiBaseUrl() + '/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username: effectiveUsername }),
        })
            .then(async (resp) => {
                if (resp.ok) {
                    setUsernameError('');
                    setUsernameAvailable(true);
                    return;
                }
                const data = await readJsonSafe(resp);
                if (resp.status === 409) {
                    const suggestion = data?.suggestion;
                    setUsernameError(suggestion
                        ? `${t.usernameTaken}. ${t.usernameSuggestion}: ${suggestion}`
                        : t.usernameTaken);
                    setUsernameAvailable(false);
                    return;
                }
                setUsernameError('');
                setUsernameAvailable(true);
            })
            .catch(() => {
                setUsernameAvailable(true);
            });
    }, [userId, effectiveUsername, t]);

    useEffect(() => {
        if (gameId && mode === 'multiplayer') {
            dispatch(storeUserId({ userId, username: effectiveUsername, gameId }));
        }
    }, [dispatch, userId, effectiveUsername, gameId, mode]);

    useEffect(() => {
        if (mode === 'singleplayer' && gameId && gameId.startsWith('solo-')) {
            dispatch(storeUserId({ userId, username: effectiveUsername, gameId }));
        }
    }, [dispatch, userId, effectiveUsername, gameId, mode]);

    useEffect(() => {
        if (!gameId || mode !== 'multiplayer') return;
        let cancelled = false;
        console.log('[resume] loading game detail', { gameId, userId });
        fetch(`${getApiBaseUrl()}/api/games/${encodeURIComponent(gameId)}?userId=${encodeURIComponent(userId)}`)
            .then(async (resp) => {
                const data = await readJsonSafe(resp);
                if (!resp.ok) {
                    if (resp.status === 404) return null;
                    throw new Error(getApiErrorMessage(resp, data, t.resumeLoadFailed));
                }
                return data;
            })
            .then((data) => {
                if (cancelled || !data) return;
                console.log('[resume] game detail response', {
                    gameId,
                    hasSnapshotForUser: Boolean(data.snapshotForUser?.state),
                    latestSnapshotUserId: data.latestSnapshot?.userId || null,
                    hasLatestSnapshot: Boolean(data.latestSnapshot?.state),
                    turns: Array.isArray(data.turns) ? data.turns.length : 0,
                });
                let snapshot = data.snapshotForUser?.state || null;
                let shouldDrawInitialTiles = false;

                if (!snapshot && data.latestSnapshot?.state && data.latestSnapshot?.userId !== userId) {
                    snapshot = buildJoinerSnapshotFromLatest(data.latestSnapshot, userId);
                    shouldDrawInitialTiles = Boolean(snapshot);
                    console.log('[resume] using transformed latest snapshot', {
                        gameId,
                        sourceUserId: data.latestSnapshot?.userId || null,
                        shouldDrawInitialTiles,
                    });
                }
                if (!snapshot && Array.isArray(data.turns) && data.turns.length > 0) {
                    snapshot = buildSnapshotFromTurns(data, userId);
                    shouldDrawInitialTiles = true;
                    console.log('[resume] using turns fallback snapshot', {
                        gameId,
                        turns: data.turns.length,
                        shouldDrawInitialTiles,
                    });
                }

                if (snapshot && typeof snapshot === 'object') {
                    dispatch(hydrateGameSnapshot({ gameId, snapshot }));
                    console.log('[resume] hydrated snapshot', {
                        gameId,
                        shouldDrawInitialTiles,
                        playedTiles: snapshot.wordBoard?.playedTilesWithPositions?.length || 0,
                        turns: snapshot.scoreBoard?.allTurns?.length || 0,
                    });
                    if (shouldDrawInitialTiles) {
                        dispatch(setNeedsInitialDraw(true));
                        console.log('[resume] setNeedsInitialDraw(true)', { gameId });
                    }
                } else {
                    console.log('[resume] no snapshot available to hydrate', { gameId });
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [dispatch, gameId, mode, userId, t]);

    useEffect(() => {
        if (!gameId || mode !== 'singleplayer' || !gameId.startsWith('solo-')) return;
        let cancelled = false;
        dispatch(setSoloResumePending(true));
        fetch(`${getApiBaseUrl()}/api/games/${encodeURIComponent(gameId)}?userId=${encodeURIComponent(userId)}`)
            .then(async (resp) => {
                const data = await readJsonSafe(resp);
                if (!resp.ok) {
                    if (resp.status === 404) {
                        const fromInitialUrl = initialGameIdRef.current === gameId;
                        if (fromInitialUrl) {
                            throw new Error(t.gameLinkNotAccessible || t.resumeLoadFailed);
                        }
                        return null;
                    }
                    throw new Error(getApiErrorMessage(resp, data, t.resumeLoadFailed));
                }
                return data;
            })
            .then((data) => {
                if (cancelled) return;
                if (!data) return;
                let snapshot = data.snapshotForUser?.state || data.latestSnapshot?.state || null;
                if (!snapshot) {
                    snapshot = buildSinglePlayerSnapshotFromDetail(data, userId);
                }
                if (snapshot && typeof snapshot === 'object') {
                    dispatch(hydrateGameSnapshot({ gameId, snapshot, mode: 'singleplayer' }));
                    setSinglePlayerResumeMode(true);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                const message = err?.message || t.resumeLoadFailed;
                exitGameLinkToLanding(message);
            })
            .finally(() => {
                if (!cancelled) {
                    dispatch(setSoloResumePending(false));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [dispatch, gameId, mode, userId, t, exitGameLinkToLanding]);

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

    if (analyticsMode) {
        return (
            <AnalyticsViewer
                apiBaseUrl={getApiBaseUrl()}
                onExit={exitAnalytics}
            />
        );
    }

    if (mode === 'review' && reviewDetail) {
        return (
            <GameReviewViewer
                detail={reviewDetail}
                t={t}
                onBack={() => {
                    setReviewDetail(null);
                    const url = new URL(window.location);
                    url.searchParams.delete('game');
                    url.searchParams.delete('invite');
                    window.history.replaceState({}, '', url);
                    setMode(null);
                }}
            />
        );
    }

    if (!gameId && mode !== 'singleplayer') {
        return (
            <LandingPage
                onCreatePrivateGame={handleCreatePrivateGame}
                onJoinGame={handleJoinGame}
                onPlayComputer={handlePlayComputer}
                onContinueGame={handleContinueGame}
                onReviewGame={handleReviewGame}
                onFindRandomOpponent={handleFindRandomOpponent}
                onCancelRandomMatch={handleCancelRandomMatch}
                isMatching={isMatching}
                matchingPosition={matchingPosition}
                matchingError={matchingError}
                username={effectiveUsername}
                onUsernameChange={setUsername}
                leaderboard={leaderboard}
                leaderboardLoading={leaderboardLoading}
                myGames={myGames}
                myGamesLoading={myGamesLoading}
                myGamesError={myGamesError}
                usernameError={usernameError}
                usernameBlocked={!usernameAvailable}
            />
        );
    }

    if (mode === 'singleplayer') {
        return (
            <div style={{background: '#EDE8E0', height: '100vh', width: '100vw'}}>
                <GameFrame singlePlayer={true} resumeMode={singlePlayerResumeMode} />
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
