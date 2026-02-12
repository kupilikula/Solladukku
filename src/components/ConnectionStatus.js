import { useWebSocket } from '../context/WebSocketContext';
import { useSelector } from 'react-redux';
import { useLanguage } from '../context/LanguageContext';

export default function ConnectionStatus() {
    const { isConnected, connectionError } = useWebSocket();
    const isMyTurn = useSelector(state => state.Game.isMyTurn);
    const gameMode = useSelector(state => state.Game.gameMode);
    const { t } = useLanguage();

    const isSinglePlayer = gameMode === 'singleplayer';

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 15px',
            borderBottom: '1px solid #eee',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
            }}>
                {isSinglePlayer ? (
                    <>
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: '#1A5276',
                        }} />
                        <span style={{ fontSize: 12, color: '#666' }}>
                            {t.vsComputer}
                        </span>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: isConnected ? '#1A5276' : '#f44336',
                        }} />
                        <span style={{ fontSize: 12, color: '#666' }}>
                            {isConnected ? t.connected : (connectionError || t.disconnected)}
                        </span>
                    </>
                )}
            </div>
            <div style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: isMyTurn ? '#1A5276' : '#999',
            }}>
                {isMyTurn ? t.yourTurn : (isSinglePlayer ? t.computerThinking : t.waiting)}
            </div>
        </div>
    );
}
