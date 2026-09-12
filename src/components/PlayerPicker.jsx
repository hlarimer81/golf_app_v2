import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rankRoster, rankReason } from '../lib/partners';

//==================================================================================================
// Choosing who is playing.
//
// Replaces a <select> listing every player in the database in insertion order. At 37 names that is
// a scroll wheel you hunt through one-handed, outdoors, with three people waiting - so the list is
// ordered by who you actually play with, and anyone else is a search away.
//
// Three ways in, in the order they get reached for:
//   1. the regulars, offered first without typing anything
//   2. search, for someone you know but rarely play with
//   3. a guest, typed in, who can claim their rounds later
//
// Opens as a full-screen sheet rather than a dropdown. A dropdown near the bottom of a long form
// renders its options over the keyboard on a phone.
//==================================================================================================
function PlayerPicker({ value, roster, participation, chosenNames, onPick, onGuest }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);

    const ranked = useMemo(
        () => rankRoster({ roster, rows: participation, chosen: chosenNames, search }),
        [roster, participation, chosenNames, search]
    );

    const chosenCount = chosenNames.filter(Boolean).length;

    // Clearing the search happens where the sheet is opened, not in an effect watching `open`.
    // Setting state from an effect body cascades a second render for no reason, and eslint's
    // react-hooks/set-state-in-effect is right to refuse it.
    const openSheet = () => { setSearch(''); setOpen(true); };

    // Deliberately not autoFocused: on a phone, focusing the search box throws up the keyboard and
    // covers the regulars, which are what most taps are going to hit.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const pick = (name) => { onPick(name); setOpen(false); };

    return (
        <>
            <button
                type="button"
                onClick={openSheet}
                style={{
                    flex: 2, padding: '8px', textAlign: 'left', background: '#fff',
                    border: '1px solid #ccc', borderRadius: '4px', fontSize: '15px',
                    color: value ? '#333' : '#888', cursor: 'pointer', minHeight: '38px',
                }}
            >
                {value || '-- Select Player --'}
            </button>

            {open && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                >
                    <div style={{
                        background: '#fff', borderRadius: '12px 12px 0 0', width: '100%',
                        maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '16px 16px 10px', flexShrink: 0,
                        }}>
                            <h4 style={{ margin: 0, color: '#333' }}>Add player</h4>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#666', padding: '4px' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search players"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    width: '100%', padding: '12px', fontSize: '16px', boxSizing: 'border-box',
                                    border: '1px solid #ccc', borderRadius: '8px',
                                }}
                            />
                        </div>

                        {/* A stable hook for the tests. The alternative is selecting this list by
                            its position in a tree of inline-styled divs, which breaks the moment
                            anyone restyles the sheet. */}
                        <div data-testid="player-list" style={{ overflowY: 'auto', flex: 1, padding: '0 16px 8px' }}>
                            {!search && chosenCount > 0 && ranked.some((p) => p.together > 0) && (
                                <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', margin: '4px 0 8px' }}>
                                    PLAYS WITH THIS GROUP
                                </div>
                            )}
                            {!search && chosenCount === 0 && (
                                <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', margin: '4px 0 8px' }}>
                                    REGULARS
                                </div>
                            )}

                            {ranked.length === 0 ? (
                                <p style={{ color: '#666', textAlign: 'center', padding: '20px 0' }}>
                                    {search ? `No player matching "${search}"` : 'No players yet'}
                                </p>
                            ) : (
                                ranked.map((p) => (
                                    <div
                                        key={p.id}
                                        onClick={() => pick(p.name)}
                                        style={{
                                            background: '#f8f9fa', padding: '12px 14px', borderRadius: '8px',
                                            marginBottom: '8px', cursor: 'pointer', border: '1px solid #ddd',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}
                                        onMouseOver={(e) => (e.currentTarget.style.background = '#e8f4f8')}
                                        onMouseOut={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 'bold', color: '#333' }}>{p.name}</div>
                                            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                                {rankReason(p, chosenCount)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ padding: '10px 16px 16px', borderTop: '1px solid #eee', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => { onGuest(); setOpen(false); }}
                                style={{
                                    width: '100%', padding: '14px', background: '#17a2b8', color: '#fff',
                                    border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold',
                                    cursor: 'pointer',
                                }}
                            >
                                + Add someone new
                            </button>
                            <div style={{ fontSize: '11px', color: '#888', textAlign: 'center', marginTop: '8px' }}>
                                They can claim their rounds later
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default PlayerPicker;
