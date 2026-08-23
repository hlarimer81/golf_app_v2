import React, { useEffect, useState } from 'react';
import { fetchHandicapIndexes, describeIndex } from '../lib/handicap';

//==================================================================================================
// The roster, ranked by handicap index.
//
// Players with fewer than three banked rounds have no index - a real answer, shown as such rather
// than as a zero - and are listed below the ranked group so the top of the page stays meaningful.
//==================================================================================================
function PlayerDirectory({ onSelect, onBack }) {
    const [entries, setEntries] = useState(null);

    useEffect(() => {
        fetchHandicapIndexes().then(byName => setEntries(Object.values(byName)));
    }, []);

    // rounds_available counts COMBINED rounds - 18-hole rounds plus paired nines. A row with zero
    // of them has only an unpaired nine to its name, and in this database those rows are scramble
    // teams and placeholders ('PAR', 'Arick Lance Scramble') rather than people. Filtering on it
    // keeps the directory to names that actually played a round.
    const people = (entries ?? []).filter(e => e.handicap_index != null || e.rounds_available > 0);
    const ranked = people.filter(e => e.handicap_index != null)
                         .sort((a, b) => a.handicap_index - b.handicap_index);
    const provisional = people.filter(e => e.handicap_index == null)
                              .sort((a, b) => b.rounds_available - a.rounds_available);

    const row = (e, showIndex) => {
        const desc = describeIndex(e);
        return (
            <div
                key={e.canonical_name}
                onClick={() => onSelect(e.canonical_name)}
                style={{
                    background: '#f8f9fa', padding: '12px 14px', borderRadius: '8px',
                    marginBottom: '8px', cursor: 'pointer', border: '1px solid #ddd',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseOver={e2 => (e2.currentTarget.style.background = '#e8f4f8')}
                onMouseOut={e2 => (e2.currentTarget.style.background = '#f8f9fa')}
            >
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>{e.canonical_name}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        {showIndex
                            ? `best ${e.rounds_used} of ${e.rounds_available} rounds`
                            + (e.estimated_count > 0 ? ` · ${e.estimated_count} unrated` : '')
                            : desc.label}
                    </div>
                </div>
                {showIndex && (
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1b365d', lineHeight: 1 }}>
                            {e.handicap_index}
                        </div>
                        {desc.estimated && (
                            <div style={{ fontSize: '10px', color: '#ff9800', marginTop: '2px' }}>est.</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '520px', margin: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <button
                    onClick={onBack}
                    style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#17a2b8', padding: 0 }}
                >
                    &larr; Back
                </button>
                {/* Sits on the page background, not inside a card, so it has to follow the theme -
                    index.css flips --text-h under prefers-color-scheme: dark. Card interiors below
                    set their own light background and keep their fixed dark-on-light colours. */}
                <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-h)' }}>Players</h1>
            </div>

            {entries === null ? (
                <p style={{ color: '#666', textAlign: 'center' }}>Loading&hellip;</p>
            ) : people.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center' }}>
                    No banked rounds yet. Finish a round to start building handicaps.
                </p>
            ) : (
                <>
                    {ranked.map(e => row(e, true))}

                    {provisional.length > 0 && (
                        <>
                            <div style={{ fontSize: '12px', color: '#888', margin: '20px 0 8px', fontWeight: 'bold' }}>
                                NOT ENOUGH ROUNDS YET
                            </div>
                            {provisional.map(e => row(e, false))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export default PlayerDirectory;
