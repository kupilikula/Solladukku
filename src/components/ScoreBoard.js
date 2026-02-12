import {useSelector} from "react-redux";
import {useLanguage} from "../context/LanguageContext";

export default function ScoreBoard() {
    const scores = useSelector(state => state.ScoreBoard);
    const game = useSelector(state => state.Game);
    const { userId, otherPlayerIds, isMyTurn } = game;
    const { t } = useLanguage();

    const gameMode = game.gameMode;
    const myName = t.you;
    const opponentName = gameMode === 'singleplayer' ? t.computer : t.opponent;
    const opponentScore = scores.otherPlayersTotalScores[0] || 0;

    return (
        <div className="ScoreBoard" style={{
            display: "flex",
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: 280,
            margin: '15px 10px 10px 10px',
            backgroundColor: 'white',
        }}>
            <PlayerScoreCard
                name={myName}
                score={scores.myTotalScore}
                isCurrentTurn={isMyTurn}
                isLeft={true}
                turnLabel={t.turn}
            />
            <PlayerScoreCard
                name={opponentName}
                score={opponentScore}
                isCurrentTurn={!isMyTurn && otherPlayerIds.length > 0}
                isLeft={false}
                turnLabel={t.turn}
            />
        </div>
    );
}

function PlayerScoreCard({ name, score, isCurrentTurn, isLeft, turnLabel }) {
    return (
        <div style={{
            padding: 15,
            display: "flex",
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderStyle: 'solid',
            borderWidth: 2,
            borderColor: isCurrentTurn ? '#1A5276' : '#ddd',
            borderRadius: isLeft ? '10px 0 0 10px' : '0 10px 10px 0',
            width: 140,
            boxSizing: 'border-box',
            backgroundColor: isCurrentTurn ? '#DDEAF2' : 'white',
            height: '100%',
            position: 'relative',
        }}>
            {isCurrentTurn && (
                <div style={{
                    position: 'absolute',
                    top: -8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#1A5276',
                    color: 'white',
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontWeight: 'bold',
                }}>
                    {turnLabel}
                </div>
            )}
            <div style={{
                borderBottomStyle: 'solid',
                borderBottomWidth: 1,
                borderColor: '#eee',
                paddingBottom: 5,
                fontSize: 14,
                fontWeight: '500',
                color: '#333',
            }}>
                {name}
            </div>
            <div style={{
                fontSize: 36,
                fontWeight: 'bold',
                color: isCurrentTurn ? '#1A5276' : '#333',
                marginTop: 5,
            }}>
                {score}
            </div>
        </div>
    );
}
