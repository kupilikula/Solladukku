import '../styles/Styles.css';
import PlayingBoard from "./PlayingBoard";
import InfoBoard from "./InfoBoard";
import { useGameSync } from '../hooks/useGameSync';
import { useAIGameSync } from '../hooks/useAIGameSync';
import { useSoloGamePersistence } from '../hooks/useSoloGamePersistence';
import { useSelector } from 'react-redux';
import { useLanguage } from '../context/LanguageContext';
import { useEffect, useState } from 'react';
import { useGameSnapshotSync } from '../hooks/useGameSnapshotSync';

function GameOverOverlay({ onClose }) {
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
                <button
                    onClick={onClose}
                    style={{
                        marginTop: 18,
                        backgroundColor: '#1A5276',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 18px',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}
                >
                    {t.helpClose}
                </button>
            </div>
        </div>
    );
}

function GameFrameInner({ staticView = false }) {
    const gameOver = useSelector(state => state.Game.gameOver);
    const { t } = useLanguage();
    const [showGameOverOverlay, setShowGameOverOverlay] = useState(false);
    const [showLogo, setShowLogo] = useState(true);

    const landingPath = window.location.pathname || '/';

    const handleLandingNavigation = (event) => {
        event.preventDefault();
        window.location.assign(landingPath);
    };

    useEffect(() => {
        if (!staticView && gameOver) {
            setShowGameOverOverlay(true);
        }
    }, [gameOver, staticView]);

    return (
        <div className="GamePage">
            <div className="GameTopBar">
                <a
                    href={landingPath}
                    onClick={handleLandingNavigation}
                    className="GameTopBarLink"
                    aria-label={t.backToLanding}
                    title={t.backToLanding}
                >
                    {showLogo && (
                        <img
                            src={process.env.PUBLIC_URL + '/logo.png'}
                            alt=""
                            className="GameTopBarLogo"
                            onError={() => setShowLogo(false)}
                        />
                    )}
                    <span className="GameTopBarTitle">சொல்மாலை</span>
                </a>
            </div>
            <div className="GameFrame">
                <PlayingBoard showActionMenu={!staticView} />
                <InfoBoard />
                {!staticView && showGameOverOverlay && <GameOverOverlay onClose={() => setShowGameOverOverlay(false)} />}
            </div>
        </div>
    );
}

function MultiplayerGameFrame() {
    useGameSync();
    useGameSnapshotSync();
    return <GameFrameInner />;
}

function SinglePlayerGameFrame({ resumeMode }) {
    useAIGameSync({ resumeMode });
    useSoloGamePersistence({ isResume: resumeMode });
    return <GameFrameInner />;
}

function StaticGameFrame() {
    return <GameFrameInner staticView={true} />;
}

export default function GameFrame({ singlePlayer, resumeMode = false, staticView = false }) {
    if (staticView) {
        return <StaticGameFrame />;
    }
    if (singlePlayer) {
        return <SinglePlayerGameFrame resumeMode={resumeMode} />;
    }
    return <MultiplayerGameFrame />;
}
