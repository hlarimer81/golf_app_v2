import React, { useEffect, useState } from 'react';
import { fetchHandicapIndexes } from '../lib/handicap';
import { claimPlayer, unclaimPlayer, claimableNames, heldByAnother } from '../lib/account';

//==================================================================================================
// "Which player are you?" - link the signed-in account to a name from the player directory, so the
// rounds and index already banked under that name follow the account.
//
// The first account to claim a name is confirmed at once; a claim on a name someone else already
// holds waits for an admin. The server decides (golf_claim_player); this screen only warns first.
//==================================================================================================
function ClaimPlayer({ accountId, claims, myClaim, onChanged, onBack }) {
    const [names, setNames] = useState(null);
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [pendingName, setPendingName] = useState(null);

    useEffect(() => {
        fetchHandicapIndexes().then(byName => setNames(claimableNames(Object.values(byName))));
    }, []);

    const handleClaim = async () => {
        setBusy(true);
        setError(null);
        const result = await claimPlayer(chosen);
        await onChanged();
        setBusy(false);
        if (result.error) { setError(result.error); return; }
        if (result.status === 'pending') { setPendingName(chosen); setChosen(null); return; }
        onBack();
    };

    const handleUnlink = async () => {
        setBusy(true);
        setError(null);
        const err = await unclaimPlayer(accountId);
        await onChanged();
        setBusy(false);
        if (err) setError(err);
    };

    const button = (bg) => ({
        padding: '12px 16px', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '6px',
        fontWeight: 'bold', fontSize: '15px', cursor: busy ? 'not-allowed' : 'pointer', flex: 1,
    });
    const card = { background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', padding: '14px', marginBottom: '14px', color: '#333' };

    const query = search.trim().toLowerCase();
    const shown = (names ?? []).filter(n => n.toLowerCase().includes(query));

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '520px', margin: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <button
                    onClick={onBack}
                    style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#17a2b8', padding: 0 }}
                >
                    &larr; Back
                </button>
                <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-h)' }}>Which player are you?</h1>
            </div>

            {error && <p role="alert" style={{ color: '#dc3545' }}>{error}</p>}

            {pendingName && (
                <div style={{ ...card, background: '#fff8e1', borderColor: '#ffc107' }}>
                    Someone else has already claimed <strong>{pendingName}</strong>. Your claim is
                    waiting for an admin to approve it.
                </div>
            )}

            {myClaim && !pendingName && (
                <div style={card}>
                    <div>
                        Linked to <strong>{myClaim.canonical_name}</strong>
                        {myClaim.status === 'pending' && <span style={{ color: '#b8860b' }}> &mdash; awaiting approval</span>}
                    </div>
                    <button
                        onClick={handleUnlink}
                        disabled={busy}
                        style={{ marginTop: '10px', background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' }}
                    >
                        Unlink
                    </button>
                </div>
            )}

            {chosen ? (
                <div style={card}>
                    <p style={{ marginTop: 0 }}>
                        Link <strong>{chosen}</strong> to your account? Their rounds and handicap will
                        show as yours.
                    </p>
                    {heldByAnother(claims, chosen, accountId) && (
                        <p style={{ color: '#b8860b', marginBottom: '16px' }}>
                            Another account already holds this name, so an admin will need to approve it.
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleClaim} disabled={busy} style={button('#28a745')}>
                            {busy ? 'Saving...' : 'Yes, that’s me'}
                        </button>
                        <button onClick={() => setChosen(null)} disabled={busy} style={button('#6c757d')}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p style={{ color: 'var(--text-h)', marginTop: 0 }}>
                        Pick your name so your rounds and handicap follow your account.
                    </p>
                    <input
                        type="search"
                        placeholder="Search names"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '12px', fontSize: '16px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '12px' }}
                    />
                    {names === null ? (
                        <p style={{ color: '#666', textAlign: 'center' }}>Loading&hellip;</p>
                    ) : shown.length === 0 ? (
                        <p style={{ color: '#666', textAlign: 'center' }}>
                            {names.length === 0
                                ? 'No players have banked rounds yet. Finish a round, then come back.'
                                : 'No names match.'}
                        </p>
                    ) : (
                        <div data-testid="claim-list">
                            {shown.map(name => (
                                <div
                                    key={name}
                                    onClick={() => { setChosen(name); setPendingName(null); setError(null); }}
                                    style={{
                                        background: '#f8f9fa', padding: '14px', borderRadius: '8px', marginBottom: '8px',
                                        cursor: 'pointer', border: '1px solid #ddd', color: '#333',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}
                                >
                                    <span style={{ fontWeight: 'bold' }}>{name}</span>
                                    {myClaim?.canonical_name === name ? (
                                        <span style={{ fontSize: '12px', color: '#28a745' }}>you</span>
                                    ) : heldByAnother(claims, name, accountId) && (
                                        <span style={{ fontSize: '12px', color: '#888' }}>claimed</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default ClaimPlayer;
