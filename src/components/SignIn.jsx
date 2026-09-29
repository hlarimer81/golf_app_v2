import React, { useState } from 'react';

//==================================================================================================
// Email sign-in, in two steps: ask for an address, then take the code from the email.
//
// The same email also carries a link. The code step is always shown anyway, because the link opens
// whatever browser the phone's mail app chooses, not necessarily the home-screen app - see
// useAuth.js.
//==================================================================================================
function SignIn({ sendCode, verifyCode, onDone, onBack }) {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [sentTo, setSentTo] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
    // Supabase sends 6 digits by default and can be configured up to 10.
    const codeOk = /^\d{6,10}$/.test(code);

    const handleSend = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const address = email.trim();
        const err = await sendCode(address);
        setBusy(false);
        if (err) setError(err);
        else setSentTo(address);
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await verifyCode(sentTo, code);
        setBusy(false);
        if (err) setError(err);
        else onDone();
    };

    const input = {
        width: '100%', padding: '15px', fontSize: '18px', boxSizing: 'border-box',
        borderRadius: '8px', border: '2px solid #ccc',
    };
    const primary = (enabled) => ({
        width: '100%', padding: '15px', marginTop: '20px',
        backgroundColor: enabled ? '#28a745' : '#ccc', color: 'white', border: 'none',
        borderRadius: '5px', fontWeight: 'bold', fontSize: '16px',
        cursor: enabled ? 'pointer' : 'not-allowed',
    });
    const secondary = {
        width: '100%', padding: '12px', marginTop: '10px', backgroundColor: 'transparent',
        color: '#666', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer',
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                <img src="/logo.png" alt="4Play Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '15px', marginBottom: '10px' }} />
                <h1 style={{ margin: 0, fontSize: '28px', color: '#1b365d', fontWeight: 'bold' }}>Sign In</h1>
            </div>

            {sentTo === null ? (
                <form onSubmit={handleSend} style={{ background: '#f4f4f4', padding: '30px', borderRadius: '10px' }}>
                    <p style={{ color: '#666', marginTop: 0, marginBottom: '20px' }}>
                        Optional. You can play without an account &mdash; signing in is for keeping
                        track of your own rounds.
                    </p>
                    <input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={input}
                        required
                    />
                    {error && <p role="alert" style={{ color: '#dc3545', marginBottom: 0 }}>{error}</p>}
                    <button type="submit" disabled={busy || !emailOk} style={primary(!busy && emailOk)}>
                        {busy ? 'Sending...' : 'Email Me a Code'}
                    </button>
                    <button type="button" onClick={onBack} style={secondary}>&larr; Back</button>
                </form>
            ) : (
                <form onSubmit={handleVerify} style={{ background: '#f4f4f4', padding: '30px', borderRadius: '10px' }}>
                    <p style={{ color: '#666', marginTop: 0, marginBottom: '20px' }}>
                        Enter the code we sent to <strong>{sentTo}</strong>
                    </p>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                        maxLength={10}
                        style={{ ...input, fontSize: '28px', textAlign: 'center', letterSpacing: '6px', fontWeight: 'bold' }}
                        required
                    />
                    {error && <p role="alert" style={{ color: '#dc3545', marginBottom: 0 }}>{error}</p>}
                    <button type="submit" disabled={busy || !codeOk} style={primary(!busy && codeOk)}>
                        {busy ? 'Checking...' : 'Sign In'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setSentTo(null); setCode(''); setError(null); }}
                        style={secondary}
                    >
                        Use a different email
                    </button>
                </form>
            )}
        </div>
    );
}

export default SignIn;
