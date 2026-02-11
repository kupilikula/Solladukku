import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useWebSocket } from '../context/WebSocketContext';
import { useLanguage } from '../context/LanguageContext';

export default function Chat() {
    const { chatMessages, sendChat } = useWebSocket();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const myUserId = useSelector(state => state.Game.userId);
    const { t } = useLanguage();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        sendChat(trimmed);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const getDisplayName = (userId) => {
        if (userId === myUserId) return t.you;
        return t.opponent;
    };

    const formatTime = (timestamp) => {
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '10px 15px',
            borderTop: '1px solid #eee',
            flex: 1,
            minHeight: 0,
        }}>
            <div style={{
                fontSize: 14,
                fontWeight: 'bold',
                marginBottom: 8,
                color: '#333',
            }}>
                {t.chat}
            </div>
            <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                marginBottom: 8,
                minHeight: 60,
                maxHeight: 150,
            }}>
                {chatMessages.length === 0 && (
                    <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 10 }}>
                        {t.noMessagesYet}
                    </div>
                )}
                {chatMessages.map((msg, i) => (
                    <div key={i} style={{
                        fontSize: 12,
                        padding: '4px 0',
                    }}>
                        <span style={{
                            fontWeight: 'bold',
                            color: msg.userId === myUserId ? '#1A5276' : '#333',
                        }}>
                            {getDisplayName(msg.userId)}
                        </span>
                        <span style={{ color: '#999', fontSize: 10, marginLeft: 6 }}>
                            {formatTime(msg.timestamp)}
                        </span>
                        <div style={{ color: '#333', marginTop: 2 }}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div style={{
                display: 'flex',
                gap: 6,
            }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={500}
                    placeholder={t.typeMessage}
                    style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #ddd',
                        fontSize: 12,
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: 'none',
                        backgroundColor: '#1A5276',
                        color: 'white',
                        fontSize: 12,
                        cursor: input.trim() ? 'pointer' : 'default',
                        opacity: input.trim() ? 1 : 0.5,
                    }}
                >
                    {t.send}
                </button>
            </div>
        </div>
    );
}
