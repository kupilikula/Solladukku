import {useSelector} from "react-redux";
import {useLanguage} from "../context/LanguageContext";

export default function TurnHistory() {
    const scoreBoard = useSelector(state => state.ScoreBoard);
    const { userId: myUserId, playerNames } = useSelector(state => state.Game);
    const { t } = useLanguage();

    const getPlayerName = (userId) => {
        if (userId === myUserId) return playerNames[myUserId] || t.you;
        return playerNames[userId] || t.opponent;
    };

    // Extract word string from formedWords array
    const getWordString = (formedWord) => {
        return formedWord.map(t => t.tile.letter).join('');
    };

    if (scoreBoard.allTurns.length === 0) {
        return (
            <div className="TurnHistory" style={{
                padding: '10px 15px',
                flex: 1,
                overflowY: 'auto',
            }}>
                <div style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    marginBottom: 10,
                    color: '#333',
                }}>
                    {t.turnHistory}
                </div>
                <div style={{
                    color: '#666',
                    fontSize: 13,
                    textAlign: 'center',
                    padding: 20,
                }}>
                    {t.noMovesYet}
                </div>
            </div>
        );
    }

    return (
        <div className="TurnHistory" style={{
            padding: '10px 15px',
            flex: 1,
            overflowY: 'auto',
            maxHeight: 300,
        }}>
            <div style={{
                fontSize: 14,
                fontWeight: 'bold',
                marginBottom: 10,
                color: '#333',
            }}>
                {t.turnHistory}
            </div>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}>
                {scoreBoard.allTurns.slice().reverse().map((turn, index) => (
                    <TurnEntry
                        key={scoreBoard.allTurns.length - 1 - index}
                        turnNumber={scoreBoard.allTurns.length - index}
                        playerName={turn.turnType === 'pass' || turn.turnType === 'swap'
                            ? (turn.turnUserId === 'me' ? t.you : t.opponent)
                            : getPlayerName(turn.turnUserId)}
                        isMe={turn.turnUserId === myUserId || turn.turnUserId === 'me'}
                        turnType={turn.turnType || 'word'}
                        words={turn.turnFormedWords ? turn.turnFormedWords.map(getWordString) : []}
                        wordScores={turn.wordScores || []}
                        totalScore={turn.turnScore}
                        swappedTileCount={turn.swappedTileCount || 0}
                        t={t}
                    />
                ))}
            </div>
        </div>
    );
}

function TurnEntry({ turnNumber, playerName, isMe, turnType, words, wordScores, totalScore, swappedTileCount, t }) {
    const isPassOrSwap = turnType === 'pass' || turnType === 'swap';
    const actionLabel = turnType === 'pass'
        ? t.passed
        : turnType === 'swap'
            ? `${t.swappedTiles} (${swappedTileCount} ${t.tiles})`
            : null;

    return (
        <div style={{
            padding: 8,
            borderRadius: 6,
            backgroundColor: isPassOrSwap ? '#fff3e0' : (isMe ? '#DDEAF2' : '#f5f5f5'),
            border: isPassOrSwap ? '1px solid #ffe0b2' : (isMe ? '1px solid #B0C8DA' : '1px solid #eee'),
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: isPassOrSwap ? 0 : 4,
            }}>
                <span style={{
                    fontSize: 12,
                    color: '#555',
                }}>
                    #{turnNumber} - {playerName}
                </span>
                {isPassOrSwap ? (
                    <span style={{
                        fontSize: 12,
                        fontStyle: 'italic',
                        color: '#cc6a00',
                    }}>
                        {actionLabel}
                    </span>
                ) : (
                    <span style={{
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: isMe ? '#1A5276' : '#333',
                    }}>
                        +{totalScore}
                    </span>
                )}
            </div>
            {!isPassOrSwap && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                }}>
                    {words.map((word, i) => (
                        <span key={i} style={{
                            fontSize: 12,
                            fontFamily: 'Tamil Sangam MN',
                            backgroundColor: 'white',
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #ddd',
                        }}>
                            {word}
                            <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>
                                ({wordScores[i]})
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
