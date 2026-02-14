import { useState } from 'react';

function inputStyle() {
    return {
        outline: 'none',
    };
}

export default function AuthPanel({ t, loading, error, onLogin, onSignup }) {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const submit = async () => {
        if (mode === 'login') {
            await onLogin({ email, password });
            return;
        }
        await onSignup({ email, password });
    };

    return (
        <div style={{
            width: '100%',
            backgroundColor: 'white',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            padding: 16,
            boxSizing: 'border-box',
        }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                    onClick={() => setMode('login')}
                    style={{
                        flex: 1,
                        border: '1px solid #bfd3e2',
                        backgroundColor: mode === 'login' ? '#1A5276' : '#f4f9fc',
                        color: mode === 'login' ? 'white' : '#1A5276',
                        borderRadius: 6,
                        padding: '7px 0',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}
                >
                    {t.login}
                </button>
                <button
                    onClick={() => setMode('signup')}
                    style={{
                        flex: 1,
                        border: '1px solid #bfd3e2',
                        backgroundColor: mode === 'signup' ? '#1A5276' : '#f4f9fc',
                        color: mode === 'signup' ? 'white' : '#1A5276',
                        borderRadius: 6,
                        padding: '7px 0',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}
                >
                    {t.signup}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                    className="TamilInput"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailLabel}
                    style={inputStyle()}
                />
                <input
                    className="TamilInput"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.passwordLabel}
                    style={inputStyle()}
                />
                <button
                    onClick={submit}
                    disabled={loading}
                    style={{
                        backgroundColor: loading ? '#9fb4c2' : '#1A5276',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 0',
                        fontSize: 14,
                        cursor: loading ? 'default' : 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                    }}
                >
                    {mode === 'login' ? t.loginAction : t.signupAction}
                </button>
            </div>

            {error ? (
                <div style={{ fontSize: 12, color: '#e53935', marginTop: 8 }}>{error}</div>
            ) : null}
        </div>
    );
}
