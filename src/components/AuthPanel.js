import { useEffect, useState } from 'react';

function inputStyle() {
    return {
        outline: 'none',
    };
}

export default function AuthPanel({
    t,
    loading,
    error,
    statusMessage = '',
    onLogin,
    onSignup,
    onForgotPassword,
    onResetPassword,
    onVerifyEmail,
    onResendVerification,
    authAccount,
    initialToken = '',
}) {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [token, setToken] = useState('');

    useEffect(() => {
        if (initialToken) {
            setToken(initialToken);
        }
    }, [initialToken]);

    const submit = async () => {
        if (mode === 'login') {
            await onLogin({ email, password });
            return;
        }
        if (mode === 'signup') {
            await onSignup({ email, password });
            return;
        }
        if (mode === 'forgot') {
            await onForgotPassword({ email });
            return;
        }
        if (mode === 'reset') {
            await onResetPassword({ token, password });
            return;
        }
        if (mode === 'verify') {
            await onVerifyEmail({ token });
        }
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

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                    onClick={() => setMode('forgot')}
                    style={{
                        flex: 1,
                        border: '1px solid #bfd3e2',
                        backgroundColor: mode === 'forgot' ? '#1A5276' : '#f4f9fc',
                        color: mode === 'forgot' ? 'white' : '#1A5276',
                        borderRadius: 6,
                        padding: '7px 0',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                        fontSize: 12,
                    }}
                >
                    {t.authForgotPassword}
                </button>
                <button
                    onClick={() => setMode('reset')}
                    style={{
                        flex: 1,
                        border: '1px solid #bfd3e2',
                        backgroundColor: mode === 'reset' ? '#1A5276' : '#f4f9fc',
                        color: mode === 'reset' ? 'white' : '#1A5276',
                        borderRadius: 6,
                        padding: '7px 0',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                        fontSize: 12,
                    }}
                >
                    {t.authResetPassword}
                </button>
                <button
                    onClick={() => setMode('verify')}
                    style={{
                        flex: 1,
                        border: '1px solid #bfd3e2',
                        backgroundColor: mode === 'verify' ? '#1A5276' : '#f4f9fc',
                        color: mode === 'verify' ? 'white' : '#1A5276',
                        borderRadius: 6,
                        padding: '7px 0',
                        cursor: 'pointer',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                        fontSize: 12,
                    }}
                >
                    {t.authVerifyEmail}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(mode === 'login' || mode === 'signup' || mode === 'forgot') ? (
                    <input
                        className="TamilInput"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.emailLabel}
                        style={inputStyle()}
                    />
                ) : null}
                {(mode === 'login' || mode === 'signup' || mode === 'reset') ? (
                    <input
                        className="TamilInput"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.passwordLabel}
                        style={inputStyle()}
                    />
                ) : null}
                {(mode === 'verify' || mode === 'reset') ? (
                    <input
                        className="TamilInput"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder={t.authTokenLabel}
                        style={inputStyle()}
                    />
                ) : null}
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
                    {mode === 'login' ? t.loginAction : null}
                    {mode === 'signup' ? t.signupAction : null}
                    {mode === 'forgot' ? t.authSendResetLink : null}
                    {mode === 'reset' ? t.authResetPasswordAction : null}
                    {mode === 'verify' ? t.authVerifyEmailAction : null}
                </button>
                {mode === 'verify' && authAccount && !authAccount.emailVerifiedAt && onResendVerification ? (
                    <button
                        onClick={onResendVerification}
                        disabled={loading}
                        style={{
                            backgroundColor: '#f4f9fc',
                            color: '#1A5276',
                            border: '1px solid #bfd3e2',
                            borderRadius: 8,
                            padding: '8px 0',
                            fontSize: 13,
                            cursor: loading ? 'default' : 'pointer',
                            fontFamily: 'Tamil Sangam MN, sans-serif',
                        }}
                    >
                        {t.authResendVerification}
                    </button>
                ) : null}
            </div>

            {error ? (
                <div style={{ fontSize: 12, color: '#e53935', marginTop: 8 }}>{error}</div>
            ) : null}
            {statusMessage ? (
                <div style={{ fontSize: 12, color: '#1A5276', marginTop: 8 }}>{statusMessage}</div>
            ) : null}
        </div>
    );
}
