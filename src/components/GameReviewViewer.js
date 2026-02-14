import { useMemo, useState } from 'react';

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
            const row = Number(tile?.row);
            const col = Number(tile?.col);
            if (Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
                next[row][col] = tile.letter || '';
            }
        });

        states.push(next);
        current = next;
    });

    return states;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(`${value}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export default function GameReviewViewer({ detail, t, onBack }) {
    const [boardTurnIndex, setBoardTurnIndex] = useState(() => Math.max(0, (detail?.turns || []).length));

    const boardStates = useMemo(
        () => buildBoardStates(detail?.turns || []),
        [detail]
    );
    const replayableTurnCount = Math.max(0, boardStates.length - 1);
    const activeTurn = Math.max(0, Math.min(boardTurnIndex, replayableTurnCount));
    const activeBoard = boardStates[activeTurn] || buildEmptyBoard();

    const game = detail?.game || {};
    const scoreText = `${Number(game.player1_score || 0)} - ${Number(game.player2_score || 0)}`;

    return (
        <div style={{
            background: '#EDE8E0',
            minHeight: '100vh',
            width: '100vw',
            boxSizing: 'border-box',
            padding: 16,
            fontFamily: 'Tamil Sangam MN, sans-serif',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 26, color: '#1A5276', fontWeight: 'bold' }}>Game Review</div>
                    <div style={{ fontSize: 13, color: '#5d6f7d' }}>
                        {game.game_id} | {game.player1_name || game.player1_id || t.you} vs {game.player2_name || game.player2_id || t.opponent}
                    </div>
                </div>
                <button
                    onClick={onBack}
                    style={{
                        backgroundColor: '#1A5276',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}
                >
                    {t.helpClose}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(460px, 1fr) 340px', gap: 12 }}>
                <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #d8e4ec', padding: 10, overflow: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13, color: '#60717f' }}>
                        <div>Score: <b style={{ color: '#1A5276' }}>{scoreText}</b></div>
                        <div>Turns: <b style={{ color: '#1A5276' }}>{game.total_turns || 0}</b></div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <input
                            type="range"
                            min={0}
                            max={replayableTurnCount}
                            value={activeTurn}
                            onChange={(e) => setBoardTurnIndex(Number(e.target.value) || 0)}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: 12, color: '#60717f' }}>Board after turn: {activeTurn}</div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(28px, 1fr))`,
                        gap: 1,
                        backgroundColor: '#d6dde3',
                        border: '1px solid #d6dde3',
                    }}>
                        {activeBoard.flatMap((row, rowIndex) => row.map((letter, colIndex) => (
                            <div
                                key={`${rowIndex}-${colIndex}`}
                                style={{
                                    minHeight: 28,
                                    backgroundColor: letter ? '#F0DCA8' : '#f5f8fa',
                                    color: '#1b252e',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: letter ? 16 : 10,
                                    lineHeight: 1,
                                    padding: 2,
                                    boxSizing: 'border-box',
                                }}
                                title={`${rowIndex}, ${colIndex}`}
                            >
                                {letter || ''}
                            </div>
                        )))}
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #d8e4ec', padding: 10, maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
                    <div style={{ fontSize: 15, color: '#1A5276', fontWeight: 'bold', marginBottom: 8 }}>Turns</div>
                    {(detail?.turns || []).map((turn) => {
                        const targetTurn = Number(turn.turn_number) || 0;
                        return (
                            <div key={turn.id} style={{ borderBottom: '1px solid #eef3f6', padding: '8px 2px' }}>
                                <div style={{ fontSize: 12, color: '#24313b' }}>
                                    <b>#{targetTurn}</b> {turn.turn_type} +{turn.score}
                                </div>
                                <div style={{ fontSize: 11, color: '#73838f', marginTop: 2 }}>
                                    {formatDateTime(turn.created_at)}
                                </div>
                                <button
                                    onClick={() => setBoardTurnIndex(targetTurn)}
                                    style={{
                                        marginTop: 6,
                                        border: '1px solid #bfd3e2',
                                        backgroundColor: '#f4f9fc',
                                        color: '#1A5276',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        fontSize: 11,
                                        cursor: 'pointer',
                                        fontFamily: 'Tamil Sangam MN, sans-serif',
                                    }}
                                >
                                    Jump
                                </button>
                            </div>
                        );
                    })}
                    {!detail?.turns?.length ? (
                        <div style={{ fontSize: 12, color: '#73838f' }}>No turns saved for this game.</div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
