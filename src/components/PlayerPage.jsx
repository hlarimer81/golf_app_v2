import React, { useEffect, useState } from 'react';
import { fetchPlayerRounds, fetchHandicapIndexes, describeIndex } from '../lib/handicap';
import { indexHistory, courseHistory, scoringSummary, sparkline } from '../lib/playerStats';

//==================================================================================================
// One player: what their handicap is, how it got there, and where they have played.
//
// The headline index comes from handicap_summary - the server's answer. The trend line behind it
// is replayed client-side by playerStats, because no index history is stored anywhere. Those two
// agree today (verified against all 33 players), but the server value is the one displayed, so a
// drift in the replay can never change the number a player is handed on the first tee.
//==================================================================================================

const CARD = { background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px' };
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
const one = n => (n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1));

function Tile({ label, value, sub }) {
    return (
        <div style={{ ...CARD, padding: '10px 12px', flex: '1 1 88px', minWidth: '88px' }}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1b365d', lineHeight: 1.25 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: '10px', color: '#888' }}>{sub}</div>}
        </div>
    );
}

//--------------------------------------------------------------------------------------------------
// The trend line. Inline SVG rather than a charting dependency, for one polyline.
//
// Y is inverted by sparkline(): a lower index is a better golfer, so the line rises as the player
// improves. Without that a player watching their handicap come down would see a line going down,
// which reads as the opposite of what happened.
//--------------------------------------------------------------------------------------------------
function Trend({ points }) {
    const W = 300, H = 60;
    const s = sparkline(points, W, H);
    if (!s) return null;

    const improving = s.change < 0;
    const stroke = improving ? '#28a745' : '#17a2b8';

    return (
        <div style={{ ...CARD, padding: '12px 14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Index over {points.length} rounds
                </div>
                <div style={{ fontSize: '12px', color: improving ? '#28a745' : '#666', fontWeight: 'bold' }}>
                    {s.change > 0 ? '+' : ''}{s.change} {improving ? '↓ improving' : ''}
                </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
                 style={{ display: 'block', overflow: 'visible' }}>
                <polyline points={s.polyline} fill="none" stroke={stroke} strokeWidth="2"
                          strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={s.coords[s.coords.length - 1].x} cy={s.coords[s.coords.length - 1].y}
                        r="3.5" fill={stroke} />
            </svg>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '4px' }}>
                <span>{fmtDate(s.first.played_on)} &middot; {s.first.index}</span>
                <span>best {s.low}</span>
                <span>{s.last.index} &middot; {fmtDate(s.last.played_on)}</span>
            </div>
        </div>
    );
}

function PlayerPage({ canonicalName, onBack }) {
    const [rounds, setRounds] = useState(null);
    const [entry, setEntry] = useState(null);
    const [error, setError] = useState(null);
    const [showAll, setShowAll] = useState(false);

    // No reset of `rounds` here: App keys this component on canonicalName, so switching players
    // remounts it and the null initial state does the job. Clearing state inside the effect would
    // be a second render pass to reach the same place.
    useEffect(() => {
        let live = true;
        Promise.all([fetchPlayerRounds(canonicalName), fetchHandicapIndexes()])
            .then(([res, byName]) => {
                if (!live) return;
                if (res.error) setError(res.error);
                setRounds(res.rounds);
                setEntry(byName[canonicalName] ?? null);
            });
        return () => { live = false; };
    }, [canonicalName]);

    const header = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <button onClick={onBack}
                    style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#17a2b8', padding: 0 }}>
                &larr; Back
            </button>
            {/* On the page background rather than in a card, so it follows the theme. index.css
                flips --text-h under prefers-color-scheme: dark; the cards below set their own
                light background and keep fixed dark-on-light colours. */}
            <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-h)' }}>{canonicalName}</h1>
        </div>
    );

    if (rounds === null) {
        return <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '560px', margin: 'auto' }}>
            {header}<p style={{ color: '#666' }}>Loading&hellip;</p>
        </div>;
    }

    const desc = describeIndex(entry);
    const stats = scoringSummary(rounds);
    const courses = courseHistory(rounds);
    const history = indexHistory(rounds);
    const visible = showAll ? rounds : rounds.slice(0, 10);

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '560px', margin: 'auto' }}>
            {header}

            {error && (
                <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24',
                              padding: '10px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                    {error}
                </div>
            )}

            {/* ---- Index ---- */}
            <div style={{ ...CARD, padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Handicap Index
                </div>
                <div style={{ fontSize: '44px', fontWeight: 'bold', color: '#1b365d', lineHeight: 1.1 }}>
                    {desc.value ?? '–'}
                </div>
                {/* describeIndex() is blunt about provenance on purpose: an index built mostly from
                    rounds with no course rating is not a WHS index and must not look like one. */}
                <div style={{ fontSize: '11px', color: desc.estimated ? '#ff9800' : '#888', marginTop: '2px' }}>
                    {desc.label}
                </div>
            </div>

            {history.length >= 2 && <Trend points={history} />}

            {/* ---- Headline numbers ---- */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                <Tile label="Rounds" value={stats.totalRounds}
                      sub={stats.nines ? `${stats.nines} nine-hole` : '18-hole'} />
                <Tile label="Courses" value={stats.courses} />
                <Tile label="Avg score" value={stats.avgGross ? Math.round(stats.avgGross) : '–'}
                      sub="18-hole rounds" />
                <Tile label="Best score" value={stats.bestGross ?? '–'} />
                <Tile label="Best diff" value={one(stats.bestDiff)} sub="per 18" />
            </div>

            {/* ---- Courses ---- */}
            <h3 style={{ fontSize: '13px', color: 'var(--text-h)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Courses played
            </h3>
            <div style={{ ...CARD, overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>
                            <th style={{ textAlign: 'left', padding: '8px 10px' }}>Course</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px' }}>Rds</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px' }}>Best</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px' }}>Avg diff</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Last</th>
                        </tr>
                    </thead>
                    <tbody>
                        {courses.map(c => (
                            <tr key={c.course} style={{ borderTop: '1px solid #e6e6e6' }}>
                                <td style={{ padding: '8px 10px', color: '#333' }}>
                                    {c.course}
                                    {/* An unrated course yields an 'estimated' differential - strokes over par
                                        with slope assumed 113 - which is not comparable to a rated one. */}
                                    {!c.rated && <span style={{ color: '#ff9800', fontSize: '10px' }}> &middot; unrated</span>}
                                </td>
                                <td style={{ padding: '8px 6px', textAlign: 'right', color: '#666' }}>
                                    {c.rounds}{c.nines ? <span style={{ fontSize: '10px', color: '#888' }}> ({c.nines}&times;9)</span> : null}
                                </td>
                                <td style={{ padding: '8px 6px', textAlign: 'right', color: '#333' }}>{c.bestGross ?? '–'}</td>
                                <td style={{ padding: '8px 6px', textAlign: 'right', color: '#666' }}>{one(c.avgDiff)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#888', whiteSpace: 'nowrap' }}>
                                    {fmtDate(c.lastPlayed)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ---- Rounds ---- */}
            <h3 style={{ fontSize: '13px', color: 'var(--text-h)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Round history
            </h3>
            {visible.map(r => (
                <div key={r.id} style={{
                    ...CARD, padding: '10px 12px', marginBottom: '6px', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    opacity: r.excluded ? 0.55 : 1,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#333', fontSize: '13px' }}>
                            {r.course_name || 'Unknown course'}
                            {r.holes === 9 && <span style={{ fontSize: '10px', color: '#888' }}> &middot; 9 holes</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                            {fmtDate(r.played_on)}
                            {r.excluded && (
                                <span style={{ color: '#dc3545' }}> &middot; not counted: {r.exclusion_reason}</span>
                            )}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ fontWeight: 'bold', color: '#1b365d' }}>{r.gross}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                            diff {r.differential}{r.method === 'estimated' ? ' est.' : ''}
                        </div>
                    </div>
                </div>
            ))}

            {rounds.length > 10 && (
                <button
                    onClick={() => setShowAll(v => !v)}
                    style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'none',
                             border: '1px solid #ddd', borderRadius: '8px', color: '#17a2b8',
                             cursor: 'pointer', fontSize: '13px' }}
                >
                    {showAll ? 'Show fewer' : `Show all ${rounds.length} rounds`}
                </button>
            )}

            {rounds.length === 0 && (
                <p style={{ color: '#666', fontSize: '13px' }}>
                    No banked rounds yet. Rounds count once every hole is scored and Finish Round is pressed.
                </p>
            )}
        </div>
    );
}

export default PlayerPage;
