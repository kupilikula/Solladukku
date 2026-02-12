import React, { useCallback, useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 20;
const BOARD_SIZE = 15;

function buildEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
}

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

function buildBoardStates(turns) {
    const states = [buildEmptyBoard()];
    let current = buildEmptyBoard();

    (turns || []).forEach((turn) => {
        const next = cloneBoard(current);
        let placedTiles = Array.isArray(turn.placedTiles) ? turn.placedTiles : [];
        if (!placedTiles.length && Array.isArray(turn.formedWords)) {
            // Backfill from formedWords for older/missing analytics rows:
            // only tiles marked as newly placed on that turn.
            placedTiles = turn.formedWords
                .flatMap((wordTiles) => (Array.isArray(wordTiles) ? wordTiles : []))
                .filter((tileInfo) => tileInfo && !tileInfo.alreadyPlayed)
                .map((tileInfo) => ({
                    row: tileInfo.row,
                    col: tileInfo.col,
                    letter: tileInfo.letter || '',
                }));
        }
        placedTiles.forEach((tile) => {
            if (!tile) return;
            const row = Number(tile.row);
            const col = Number(tile.col);
            if (Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
                next[row][col] = tile.letter || '';
            }
        });
        states.push(next);
        current = next;
    });

    return states;
}

function StatCard({ label, value, note }) {
    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: 10,
            border: '1px solid #d5e1ea',
            padding: 14,
        }}>
            <div style={{ fontSize: 12, color: '#5d6f7d', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1A5276' }}>{value}</div>
            {note ? <div style={{ fontSize: 11, color: '#7a8a96', marginTop: 4 }}>{note}</div> : null}
        </div>
    );
}

function TableHeader({ title, right }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        }}>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#1A5276' }}>{title}</div>
            {right}
        </div>
    );
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(`${value}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function TurnWords({ turn }) {
    const words = Array.isArray(turn.wordsPlayed) ? turn.wordsPlayed : [];
    if (!words.length) return <span style={{ color: '#888' }}>-</span>;
    return (
        <span style={{ fontFamily: 'Tamil Sangam MN, sans-serif' }}>{words.join(', ')}</span>
    );
}

export default function AnalyticsViewer({ apiBaseUrl, onExit }) {
    const [passwordInput, setPasswordInput] = useState('');
    const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('analytics_admin_password') || '');
    const [authError, setAuthError] = useState('');

    const [loadingSummary, setLoadingSummary] = useState(false);
    const [summary, setSummary] = useState(null);
    const [games, setGames] = useState([]);
    const [gamesTotal, setGamesTotal] = useState(0);
    const [gamesOffset, setGamesOffset] = useState(0);
    const [gamesQuery, setGamesQuery] = useState('');
    const [selectedGameId, setSelectedGameId] = useState('');
    const [gameDetail, setGameDetail] = useState(null);
    const [gameDetailError, setGameDetailError] = useState('');
    const [boardTurnIndex, setBoardTurnIndex] = useState(0);

    const [players, setPlayers] = useState([]);
    const [playersTotal, setPlayersTotal] = useState(0);
    const [playersOffset, setPlayersOffset] = useState(0);
    const [playersQuery, setPlayersQuery] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [playerDetail, setPlayerDetail] = useState(null);
    const [playerDetailError, setPlayerDetailError] = useState('');

    const [visits, setVisits] = useState([]);
    const [visitsDays, setVisitsDays] = useState(30);
    const [visitCountries, setVisitCountries] = useState([]);
    const [playerCountries, setPlayerCountries] = useState([]);

    const isAuthenticated = Boolean(adminPassword);

    const authHeaders = useMemo(() => {
        if (!adminPassword) return { 'Content-Type': 'application/json' };
        return {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword,
        };
    }, [adminPassword]);

    const fetchAdminJson = useCallback(async (path) => {
        const resp = await fetch(`${apiBaseUrl}${path}`, {
            headers: authHeaders,
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
            const message = data?.error || `Request failed (${resp.status})`;
            const err = new Error(message);
            err.status = resp.status;
            throw err;
        }
        return data;
    }, [apiBaseUrl, authHeaders]);

    const handleAdminError = useCallback((err) => {
        setAuthError(err?.message || 'Request failed');
    }, []);

    const loadSummary = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const [summaryResp, visitsResp, visitCountryResp, playerCountryResp] = await Promise.all([
                fetchAdminJson('/api/admin/summary'),
                fetchAdminJson(`/api/admin/visits/daily?days=${visitsDays}`),
                fetchAdminJson(`/api/admin/visits/countries?days=${visitsDays}&limit=10`),
                fetchAdminJson('/api/admin/players/countries?limit=10'),
            ]);
            setSummary(summaryResp);
            setVisits(Array.isArray(visitsResp) ? visitsResp : []);
            setVisitCountries(Array.isArray(visitCountryResp) ? visitCountryResp : []);
            setPlayerCountries(Array.isArray(playerCountryResp) ? playerCountryResp : []);
            setAuthError('');
        } catch (err) {
            handleAdminError(err);
        } finally {
            setLoadingSummary(false);
        }
    }, [fetchAdminJson, handleAdminError, visitsDays]);

    const loadGames = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(gamesOffset),
            });
            if (gamesQuery.trim()) params.set('q', gamesQuery.trim());
            const data = await fetchAdminJson(`/api/admin/games?${params.toString()}`);
            setGames(Array.isArray(data.items) ? data.items : []);
            setGamesTotal(Number(data.total || 0));
            setAuthError('');
        } catch (err) {
            handleAdminError(err);
        }
    }, [fetchAdminJson, gamesOffset, gamesQuery, handleAdminError]);

    const loadPlayers = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(playersOffset),
            });
            if (playersQuery.trim()) params.set('q', playersQuery.trim());
            const data = await fetchAdminJson(`/api/admin/players?${params.toString()}`);
            setPlayers(Array.isArray(data.items) ? data.items : []);
            setPlayersTotal(Number(data.total || 0));
            setAuthError('');
        } catch (err) {
            handleAdminError(err);
        }
    }, [fetchAdminJson, handleAdminError, playersOffset, playersQuery]);

    const loadGameDetail = useCallback(async (gameId) => {
        if (!gameId) return;
        try {
            setGameDetailError('');
            const data = await fetchAdminJson(`/api/admin/games/${encodeURIComponent(gameId)}`);
            setGameDetail(data);
            setBoardTurnIndex(0);
        } catch (err) {
            setGameDetail(null);
            setGameDetailError(err.message);
        }
    }, [fetchAdminJson]);

    const loadPlayerDetail = useCallback(async (userId) => {
        if (!userId) return;
        try {
            setPlayerDetailError('');
            const data = await fetchAdminJson(`/api/admin/players/${encodeURIComponent(userId)}`);
            setPlayerDetail(data);
        } catch (err) {
            setPlayerDetail(null);
            setPlayerDetailError(err.message);
        }
    }, [fetchAdminJson]);

    useEffect(() => {
        if (!isAuthenticated) return;
        loadSummary();
    }, [isAuthenticated, loadSummary]);

    useEffect(() => {
        if (!isAuthenticated) return;
        loadGames();
    }, [isAuthenticated, loadGames]);

    useEffect(() => {
        if (!isAuthenticated) return;
        loadPlayers();
    }, [isAuthenticated, loadPlayers]);

    useEffect(() => {
        if (!selectedGameId || !isAuthenticated) return;
        loadGameDetail(selectedGameId);
    }, [selectedGameId, isAuthenticated, loadGameDetail]);

    useEffect(() => {
        if (!selectedUserId || !isAuthenticated) return;
        loadPlayerDetail(selectedUserId);
    }, [selectedUserId, isAuthenticated, loadPlayerDetail]);

    const boardStates = useMemo(
        () => buildBoardStates(gameDetail?.turns || []),
        [gameDetail]
    );
    const activeBoard = boardStates[Math.max(0, Math.min(boardTurnIndex, boardStates.length - 1))] || buildEmptyBoard();
    const replayableTurnCount = Math.max(0, boardStates.length - 1);

    const visitsMax = useMemo(() => {
        return visits.reduce((max, v) => Math.max(max, Number(v.count || 0)), 0) || 1;
    }, [visits]);

    const applyPassword = () => {
        const trimmed = passwordInput.trim();
        setAdminPassword(trimmed);
        if (trimmed) {
            sessionStorage.setItem('analytics_admin_password', trimmed);
        } else {
            sessionStorage.removeItem('analytics_admin_password');
        }
        setAuthError('');
    };

    const clearPassword = () => {
        setPasswordInput('');
        setAdminPassword('');
        sessionStorage.removeItem('analytics_admin_password');
        setAuthError('');
    };

    return (
        <div style={{
            background: '#EDE8E0',
            minHeight: '100vh',
            padding: '18px 14px 24px',
            boxSizing: 'border-box',
            fontFamily: 'Tamil Sangam MN, sans-serif',
            color: '#24313b',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1A5276' }}>Analytics Inspector</div>
                <button
                    onClick={onExit}
                    style={{
                        backgroundColor: '#1A5276',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                    }}
                >
                    Back to Game
                </button>
            </div>

            <div style={{
                backgroundColor: 'white',
                border: '1px solid #d5e1ea',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
            }}>
                <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={isAuthenticated
                        ? 'Admin password loaded for this session (enter to replace)'
                        : 'Enter existing analytics admin password'}
                    style={{
                        flex: 1,
                        minWidth: 220,
                        borderRadius: 6,
                        border: '1px solid #c7d8e5',
                        padding: '8px 10px',
                    }}
                />
                <button onClick={applyPassword} style={{ backgroundColor: '#1A5276', color: 'white', border: 'none', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}>
                    Use Admin Password
                </button>
                <button onClick={clearPassword} style={{ backgroundColor: '#6d7f8b', color: 'white', border: 'none', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}>
                    Clear
                </button>
                <button onClick={loadSummary} disabled={!isAuthenticated || loadingSummary} style={{ backgroundColor: '#2176A8', color: 'white', border: 'none', borderRadius: 6, padding: '8px 10px', cursor: isAuthenticated ? 'pointer' : 'default', opacity: isAuthenticated ? 1 : 0.6 }}>
                    Refresh
                </button>
            </div>

            {authError ? <div style={{ color: '#C0392B', marginBottom: 12, fontSize: 13 }}>{authError}</div> : null}
            {!isAuthenticated ? <div style={{ color: '#5d6f7d' }}>Enter the existing server analytics admin password to load data.</div> : null}

            {isAuthenticated && summary ? (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 10,
                        marginBottom: 14,
                    }}>
                        <StatCard label="Total Visits" value={summary.totalVisits || 0} />
                        <StatCard label="Total Games" value={summary.totalGames || 0} />
                        <StatCard label="Completed Games" value={summary.completedGames || 0} note={`${summary.completionRate || 0}% completion`} />
                        <StatCard label="Total Turns" value={summary.totalTurns || 0} />
                        <StatCard label="Avg Turns / Game" value={(summary.avgTurnsPerGame || 0).toFixed(2)} />
                        <StatCard label="Avg Score / Game" value={(summary.avgCombinedScorePerGame || 0).toFixed(2)} />
                        <StatCard label="Active Players (30d)" value={summary.activePlayers30d || 0} />
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 14,
                    }}>
                        <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                            <TableHeader
                                title="Daily Visits"
                                right={(
                                    <select value={visitsDays} onChange={(e) => setVisitsDays(Number(e.target.value))} style={{ border: '1px solid #c7d8e5', borderRadius: 6, padding: '6px 8px' }}>
                                        <option value={7}>Last 7 days</option>
                                        <option value={30}>Last 30 days</option>
                                        <option value={90}>Last 90 days</option>
                                    </select>
                                )}
                            />
                            <div style={{ display: 'grid', gap: 6 }}>
                                {visits.map((row) => {
                                    const count = Number(row.count || 0);
                                    const width = Math.max(4, Math.round((count / visitsMax) * 100));
                                    return (
                                        <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', gap: 8, alignItems: 'center' }}>
                                            <div style={{ fontSize: 12 }}>{row.day}</div>
                                            <div style={{ backgroundColor: '#eef4f8', borderRadius: 4, overflow: 'hidden', height: 12 }}>
                                                <div style={{ width: `${width}%`, height: 12, backgroundColor: '#1A5276' }} />
                                            </div>
                                            <div style={{ fontSize: 12, textAlign: 'right' }}>{count}</div>
                                        </div>
                                    );
                                })}
                                {!visits.length ? <div style={{ color: '#8897a3', fontSize: 12 }}>No visit data.</div> : null}
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gap: 14,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        }}>
                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader title={`Visits by Country (${visitsDays}d)`} />
                                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 8 }}>
                                    {(visitCountries || []).map((row) => (
                                        <div key={`${row.countryCode}-${row.country}`} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr auto',
                                            gap: 8,
                                            alignItems: 'center',
                                            padding: '8px 10px',
                                            borderBottom: '1px solid #eef3f6',
                                            fontSize: 12,
                                        }}>
                                            <div>{row.countryCode || 'UNK'} {row.country || 'Unknown'}</div>
                                            <div style={{ color: '#60717f' }}>{row.count}</div>
                                        </div>
                                    ))}
                                    {!visitCountries.length ? <div style={{ padding: 10, fontSize: 12, color: '#8897a3' }}>No geo visit data.</div> : null}
                                </div>
                            </div>

                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader title="Players by Last Country" />
                                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 8 }}>
                                    {(playerCountries || []).map((row) => (
                                        <div key={`${row.countryCode}-${row.country}`} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr auto',
                                            gap: 8,
                                            alignItems: 'center',
                                            padding: '8px 10px',
                                            borderBottom: '1px solid #eef3f6',
                                            fontSize: 12,
                                        }}>
                                            <div>{row.countryCode || 'UNK'} {row.country || 'Unknown'}</div>
                                            <div style={{ color: '#60717f' }}>{row.count}</div>
                                        </div>
                                    ))}
                                    {!playerCountries.length ? <div style={{ padding: 10, fontSize: 12, color: '#8897a3' }}>No geo player data.</div> : null}
                                </div>
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gap: 14,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        }}>
                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader
                                    title={`Games (${gamesTotal})`}
                                    right={(
                                        <input
                                            value={gamesQuery}
                                            onChange={(e) => { setGamesQuery(e.target.value); setGamesOffset(0); }}
                                            placeholder="Search game/user"
                                            style={{ border: '1px solid #c7d8e5', borderRadius: 6, padding: '6px 8px', width: 160 }}
                                        />
                                    )}
                                />
                                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 8 }}>
                                    {(games || []).map((game) => (
                                        <button
                                            key={`${game.game_id}-${game.id}`}
                                            onClick={() => setSelectedGameId(game.game_id)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: 'none',
                                                borderBottom: '1px solid #eef3f6',
                                                backgroundColor: selectedGameId === game.game_id ? '#e8f2f9' : 'white',
                                                padding: '10px 8px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1A5276' }}>{game.game_id}</div>
                                            <div style={{ fontSize: 12 }}>{game.player1_name || game.player1_id || 'P1'} vs {game.player2_name || game.player2_id || 'P2'}</div>
                                            <div style={{ fontSize: 11, color: '#60717f' }}>{game.player1_score} - {game.player2_score} | turns {game.total_turns}</div>
                                            <div style={{ fontSize: 11, color: '#60717f' }}>
                                                start {game.started_country_code || 'UNK'} | end {game.ended_country_code || 'UNK'}
                                            </div>
                                        </button>
                                    ))}
                                    {!games.length ? <div style={{ padding: 10, fontSize: 12, color: '#8897a3' }}>No games.</div> : null}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    <button onClick={() => setGamesOffset(Math.max(0, gamesOffset - PAGE_SIZE))} disabled={gamesOffset === 0}>Prev</button>
                                    <div style={{ fontSize: 12, color: '#60717f' }}>{gamesOffset + 1}-{Math.min(gamesOffset + PAGE_SIZE, gamesTotal)}</div>
                                    <button onClick={() => setGamesOffset(gamesOffset + PAGE_SIZE)} disabled={gamesOffset + PAGE_SIZE >= gamesTotal}>Next</button>
                                </div>
                            </div>

                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader
                                    title={`Players (${playersTotal})`}
                                    right={(
                                        <input
                                            value={playersQuery}
                                            onChange={(e) => { setPlayersQuery(e.target.value); setPlayersOffset(0); }}
                                            placeholder="Search player"
                                            style={{ border: '1px solid #c7d8e5', borderRadius: 6, padding: '6px 8px', width: 160 }}
                                        />
                                    )}
                                />
                                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 8 }}>
                                    {(players || []).map((player) => (
                                        <button
                                            key={player.userId}
                                            onClick={() => setSelectedUserId(player.userId)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: 'none',
                                                borderBottom: '1px solid #eef3f6',
                                                backgroundColor: selectedUserId === player.userId ? '#e8f2f9' : 'white',
                                                padding: '10px 8px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1A5276' }}>{player.username}</div>
                                            <div style={{ fontSize: 11, color: '#60717f' }}>{player.userId}</div>
                                            <div style={{ fontSize: 11, color: '#60717f' }}>rating {player.rating} | games {player.gamesPlayed}</div>
                                            <div style={{ fontSize: 11, color: '#60717f' }}>
                                                {player.lastCountryCode || 'UNK'} {player.lastCountry || 'Unknown'}
                                            </div>
                                        </button>
                                    ))}
                                    {!players.length ? <div style={{ padding: 10, fontSize: 12, color: '#8897a3' }}>No players.</div> : null}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    <button onClick={() => setPlayersOffset(Math.max(0, playersOffset - PAGE_SIZE))} disabled={playersOffset === 0}>Prev</button>
                                    <div style={{ fontSize: 12, color: '#60717f' }}>{playersOffset + 1}-{Math.min(playersOffset + PAGE_SIZE, playersTotal)}</div>
                                    <button onClick={() => setPlayersOffset(playersOffset + PAGE_SIZE)} disabled={playersOffset + PAGE_SIZE >= playersTotal}>Next</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader title="Game Inspector" />
                                {gameDetailError ? <div style={{ color: '#C0392B', fontSize: 12 }}>{gameDetailError}</div> : null}
                                {!gameDetail ? <div style={{ color: '#60717f', fontSize: 12 }}>Select a game to inspect.</div> : (
                                    <>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>
                                            <b>{gameDetail.game.game_id}</b> | {gameDetail.game.player1_name || gameDetail.game.player1_id || 'P1'} vs {gameDetail.game.player2_name || gameDetail.game.player2_id || 'P2'}
                                        </div>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>Score: {gameDetail.game.player1_score} - {gameDetail.game.player2_score} | Turns: {gameDetail.game.total_turns}</div>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>
                                            Geo: P1 {gameDetail.game.player1_country_code || 'UNK'} | P2 {gameDetail.game.player2_country_code || 'UNK'} | start {gameDetail.game.started_country_code || 'UNK'} | end {gameDetail.game.ended_country_code || 'UNK'}
                                        </div>
                                        <div style={{ marginBottom: 8 }}>
                                            <input
                                                type="range"
                                                min={0}
                                                max={replayableTurnCount}
                                                value={Math.min(boardTurnIndex, replayableTurnCount)}
                                                onChange={(e) => setBoardTurnIndex(Number(e.target.value))}
                                                style={{ width: '100%' }}
                                            />
                                            <div style={{ fontSize: 11, color: '#60717f' }}>Board after turn: {Math.min(boardTurnIndex, replayableTurnCount)}</div>
                                            {gameDetail.turns?.length > 0 && replayableTurnCount === 0 ? (
                                                <div style={{ fontSize: 11, color: '#C0392B', marginTop: 4 }}>
                                                    Turns exist but tile coordinates were not saved for replay in this game.
                                                </div>
                                            ) : null}
                                        </div>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(16px, 1fr))`,
                                            gap: 1,
                                            backgroundColor: '#9fb4c5',
                                            padding: 1,
                                            borderRadius: 4,
                                        }}>
                                            {activeBoard.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
                                                <div key={`${rowIndex}-${colIndex}`} style={{
                                                    minHeight: 18,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 10,
                                                    fontFamily: 'Tamil Sangam MN, sans-serif',
                                                    backgroundColor: cell ? '#F0DCA8' : '#CCC8C0',
                                                    color: '#1f2428',
                                                }}>
                                                    {cell}
                                                </div>
                                            )))}
                                        </div>
                                        <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 6 }}>
                                            {(gameDetail.turns || []).map((turn) => {
                                                const targetTurn = Number(turn.turn_number) || 0;
                                                const canJump = targetTurn >= 0 && targetTurn <= replayableTurnCount;
                                                return (
                                                    <div
                                                        key={turn.id}
                                                        style={{
                                                            padding: '6px 8px',
                                                            borderBottom: '1px solid #eef3f6',
                                                            fontSize: 12,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: 8,
                                                        }}
                                                    >
                                                        <div>
                                                            <b>#{turn.turn_number}</b> {turn.turn_type} | +{turn.score} | <TurnWords turn={turn} />
                                                        </div>
                                                        <button
                                                            onClick={() => setBoardTurnIndex(Math.min(Math.max(0, targetTurn), replayableTurnCount))}
                                                            disabled={!canJump}
                                                            title={canJump ? `Jump board to turn ${targetTurn}` : 'No replay coordinates for this turn'}
                                                            style={{
                                                                border: '1px solid #c7d8e5',
                                                                borderRadius: 6,
                                                                backgroundColor: canJump ? '#f4f8fb' : '#f2f2f2',
                                                                color: canJump ? '#1A5276' : '#8a8a8a',
                                                                padding: '4px 8px',
                                                                cursor: canJump ? 'pointer' : 'not-allowed',
                                                                fontSize: 11,
                                                            }}
                                                        >
                                                            Jump
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ backgroundColor: 'white', border: '1px solid #d5e1ea', borderRadius: 10, padding: 12 }}>
                                <TableHeader title="Player Inspector" />
                                {playerDetailError ? <div style={{ color: '#C0392B', fontSize: 12 }}>{playerDetailError}</div> : null}
                                {!playerDetail ? <div style={{ color: '#60717f', fontSize: 12 }}>Select a player to inspect.</div> : (
                                    <>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}><b>{playerDetail.profile.username}</b> ({playerDetail.profile.userId})</div>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>Rating {playerDetail.profile.rating} | W/L/D: {playerDetail.profile.wins}/{playerDetail.profile.losses}/{playerDetail.profile.draws}</div>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>Games {playerDetail.profile.gamesPlayed} | Total score {playerDetail.profile.totalScore}</div>
                                        <div style={{ fontSize: 12, marginBottom: 8 }}>
                                            Last geo: {playerDetail.profile.lastCountryCode || 'UNK'} {playerDetail.profile.lastCountry || 'Unknown'}
                                            {playerDetail.profile.lastRegion ? `, ${playerDetail.profile.lastRegion}` : ''}
                                            {playerDetail.profile.lastCity ? `, ${playerDetail.profile.lastCity}` : ''}
                                            {' '}| seen {formatDateTime(playerDetail.profile.lastSeenAt)}
                                        </div>

                                        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: '#1A5276' }}>Recent Games</div>
                                        <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 6, marginBottom: 10 }}>
                                            {(playerDetail.recentGames || []).map((g) => (
                                                <div key={`${g.id}`} style={{ padding: '6px 8px', borderBottom: '1px solid #eef3f6', fontSize: 12 }}>
                                                    {g.game_id} | {g.player1_score}-{g.player2_score} | {formatDateTime(g.created_at)}
                                                </div>
                                            ))}
                                            {!playerDetail.recentGames?.length ? <div style={{ padding: 8, fontSize: 12, color: '#8897a3' }}>No games.</div> : null}
                                        </div>

                                        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: '#1A5276' }}>Recent Turns</div>
                                        <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #ebf0f4', borderRadius: 6 }}>
                                            {(playerDetail.recentTurns || []).map((turn) => (
                                                <div key={turn.id} style={{ padding: '6px 8px', borderBottom: '1px solid #eef3f6', fontSize: 12 }}>
                                                    {turn.game_id} #{turn.turn_number} {turn.turn_type} +{turn.score}
                                                </div>
                                            ))}
                                            {!playerDetail.recentTurns?.length ? <div style={{ padding: 8, fontSize: 12, color: '#8897a3' }}>No turns.</div> : null}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
