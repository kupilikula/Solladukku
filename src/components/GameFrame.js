import '../styles/Styles.css';
import PlayingBoard from "./PlayingBoard";
import InfoBoard from "./InfoBoard";
import { useGameSync } from '../hooks/useGameSync';
import { useAIGameSync } from '../hooks/useAIGameSync';
import { useSelector } from 'react-redux';
import { useLanguage } from '../context/LanguageContext';

function GameOverOverlay() {
    const { gameOver, gameOverReason, winner, userId, gameMode } = useSelector(state => state.Game);
    const myScore = useSelector(state => state.ScoreBoard.myTotalScore);
    const opponentScore = useSelector(state => state.ScoreBoard.otherPlayersTotalScores[0] || 0);
    const { t } = useLanguage();

    if (!gameOver) return null;

    const iWon = winner === userId;
    const isTie = winner === 'tie';
    const resultText = isTie ? t.gameOverTie : (iWon ? t.gameOverWon : t.gameOverLost);
    const reasonText = gameOverReason === 'consecutivePasses'
        ? t.gameOverPasses
        : t.gameOverTilesOut;

    const opponentLabel = gameMode === 'singleplayer' ? t.computer : t.opponent;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: '40px 60px',
                textAlign: 'center',
                minWidth: 320,
            }}>
                <div style={{
                    fontSize: 36,
                    fontWeight: 'bold',
                    color: isTie ? '#f57c00' : (iWon ? '#1A5276' : '#e53935'),
                    marginBottom: 10,
                }}>
                    {resultText}
                </div>
                <div style={{
                    fontSize: 14,
                    color: '#666',
                    marginBottom: 24,
                }}>
                    {reasonText}
                </div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 40,
                    marginBottom: 20,
                }}>
                    <div>
                        <div style={{ fontSize: 14, color: '#666' }}>{t.you}</div>
                        <div style={{ fontSize: 32, fontWeight: 'bold', color: iWon ? '#1A5276' : '#333' }}>{myScore}</div>
                    </div>
                    <div style={{ fontSize: 24, alignSelf: 'center', color: '#999' }}>{t.vs}</div>
                    <div>
                        <div style={{ fontSize: 14, color: '#666' }}>{opponentLabel}</div>
                        <div style={{ fontSize: 32, fontWeight: 'bold', color: !iWon && !isTie ? '#e53935' : '#333' }}>{opponentScore}</div>
                    </div>
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                    {t.gameOverNewGame}
                </div>
            </div>
        </div>
    );
}

function GameFrameInner() {
    return (
        <div className="GameFrame">
            <PlayingBoard />
            <InfoBoard />
            <GameOverOverlay />
        </div>
    );
}

function MultiplayerGameFrame() {
    useGameSync();
    return <GameFrameInner />;
}

function SinglePlayerGameFrame() {
    useAIGameSync();
    return <GameFrameInner />;
}

export default function GameFrame({ singlePlayer }) {
    if (singlePlayer) {
        return <SinglePlayerGameFrame />;
    }
    return <MultiplayerGameFrame />;
}
