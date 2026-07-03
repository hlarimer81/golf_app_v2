import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import GolfScoreTile from './GolfScoreTile';

// Wolf Vegas: exactly 4 players. Each hole one player is the "Wolf" (rotates). The Wolf
// picks a partner (2v2), goes Lone Wolf (1v3, points doubled), or Blind Wolf (1v3, tripled).
// Each side forms a two-digit "Vegas number" from its two net scores (low-then-high; the
// number flips high-then-low when the OTHER side birdies). Points swing = difference of the
// two Vegas numbers, scaled by the Lone/Blind multiplier. Winners gain, losers lose.
export default function WolfVegasGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
  const [scores, setScores] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  // decisions[holeNum] = partner playerId | 'lone' | 'blind'
  const [decisions, setDecisions] = useState({});

  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

  const ACCENT = '#AB47BC';
  const LONE_MULT = 2;
  const BLIND_MULT = 3;

  const holeNumbers = [];
  for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);
  const is18 = holesCount === 18;
  const frontHoles = is18 ? holeNumbers.slice(0, 9) : holeNumbers;
  const backHoles = is18 ? holeNumbers.slice(9) : [];

  const firstName = (p) => (p.player_name || p.name || '').split(' ')[0];

  // Wolf rotates: the player teeing last is the Wolf. Using played-sequence index so a
  // back-nine round still rotates from the first played hole.
  const getWolfIndex = (holeNum) => {
    const seqIdx = holeNumbers.indexOf(holeNum);
    const i = seqIdx >= 0 ? seqIdx : (holeNum - 1);
    return i % players.length;
  };
  const getWolfPlayer = (holeNum) => players[getWolfIndex(holeNum)];

  const calculateNetStrokes = (strokes, holeIndex, playerHandicap) => {
    if (!strokes || strokes === 0) return null;
    let netStrokes = parseInt(strokes);
    if (useHandicaps) {
      const holeDifficulty = hcds[holeIndex];
      const hcp = parseInt(playerHandicap) || 0;
      if (hcp >= holeDifficulty) netStrokes -= 1;
      if (hcp >= holeDifficulty + 18) netStrokes -= 1;
    }
    return netStrokes;
  };

  // Net capped at 9 for the two-digit Vegas number.
  const cappedNet = (playerId, holeNum) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return null;
    const net = calculateNetStrokes(scores[playerId]?.[holeNum], holeNum - 1, p.handicap ?? p.hcp ?? 0);
    if (net === null) return null;
    return net > 9 ? 9 : net;
  };
  const grossOf = (playerId, holeNum) => scores[playerId]?.[holeNum] ?? null;

  const vegasNumber = (a, b, flip) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return flip ? (hi * 10 + lo) : (lo * 10 + hi);
  };

  // Settle one hole -> { pts: {playerId: signed}, wolfNum, oppNum, diff, settled }
  const settleHole = (holeNum) => {
    const pts = {};
    players.forEach(p => { pts[p.id] = 0; });
    const result = { pts, wolfNum: 0, oppNum: 0, diff: 0, settled: false };

    const decision = decisions[holeNum];
    if (decision === undefined) return result;

    const wolf = getWolfPlayer(holeNum);
    const par = pars[holeNum - 1];

    // All 4 must be scored
    const net = {};
    const gross = {};
    for (const p of players) {
      const n = cappedNet(p.id, holeNum);
      if (n === null) return result;
      net[p.id] = n;
      gross[p.id] = grossOf(p.id, holeNum);
    }

    if (decision === 'lone' || decision === 'blind') {
      const mult = decision === 'blind' ? BLIND_MULT : LONE_MULT;
      const opps = players.filter(p => p.id !== wolf.id);
      // Opponents' number from their two lowest nets
      const oppNets = opps.map(p => ({ id: p.id, net: net[p.id], gross: gross[p.id] }))
        .sort((a, b) => a.net - b.net);
      const best1 = oppNets[0];
      const best2 = oppNets[1];
      // Wolf birdie flips opponents' number
      const wolfBirdie = gross[wolf.id] <= par - 1;
      const wolfNum = net[wolf.id] * 11;
      const oppNum = vegasNumber(best1.net, best2.net, wolfBirdie);
      const diff = wolfNum - oppNum;
      const mag = Math.abs(diff);
      const stake = mag * mult;
      if (diff < 0) {
        opps.forEach(p => { pts[p.id] -= stake; });
        pts[wolf.id] += stake * 3; // collects stake from each of 3
      } else if (diff > 0) {
        opps.forEach(p => { pts[p.id] += stake; });
        pts[wolf.id] -= stake * 3;
      }
      result.wolfNum = wolfNum;
      result.oppNum = oppNum;
      result.diff = mag;
      result.settled = true;
      return result;
    }

    // 2v2: decision is a partner playerId
    const partner = players.find(p => p.id === decision);
    if (!partner || partner.id === wolf.id) return result;
    const opps = players.filter(p => p.id !== wolf.id && p.id !== partner.id);
    if (opps.length !== 2) return result;

    const wolfLoGross = Math.min(gross[wolf.id], gross[partner.id]);
    const oppLoGross = Math.min(gross[opps[0].id], gross[opps[1].id]);
    const wolfBirdie = wolfLoGross <= par - 1;
    const oppBirdie = oppLoGross <= par - 1;

    // A side's number flips when the OPPOSING side birdied.
    const wolfNum = vegasNumber(net[wolf.id], net[partner.id], oppBirdie);
    const oppNum = vegasNumber(net[opps[0].id], net[opps[1].id], wolfBirdie);
    const diff = wolfNum - oppNum;
    const mag = Math.abs(diff);

    if (diff < 0) {
      pts[wolf.id] += mag; pts[partner.id] += mag;
      pts[opps[0].id] -= mag; pts[opps[1].id] -= mag;
    } else if (diff > 0) {
      pts[opps[0].id] += mag; pts[opps[1].id] += mag;
      pts[wolf.id] -= mag; pts[partner.id] -= mag;
    }
    result.wolfNum = wolfNum;
    result.oppNum = oppNum;
    result.diff = mag;
    result.settled = true;
    return result;
  };

  const calculateTotals = () => {
    const totals = {};
    players.forEach(p => { totals[p.id] = 0; });
    for (const holeNum of holeNumbers) {
      const r = settleHole(holeNum);
      if (r.settled) players.forEach(p => { totals[p.id] += r.pts[p.id]; });
    }
    return totals;
  };

  const totals = calculateTotals();

  // --- Fetch & Realtime ---
  useEffect(() => {
    if (!matchId) return;
    const fetchScores = async () => {
      const { data } = await supabase.from('scores').select('*').eq('match_id', matchId);
      const scoreMap = {};
      data?.forEach(s => {
        if (!scoreMap[s.player_id]) scoreMap[s.player_id] = {};
        scoreMap[s.player_id][s.hole_number] = s.strokes;
      });
      setScores(scoreMap);
    };
    fetchScores();
    const channel = supabase.channel('realtime-wolfvegas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `match_id=eq.${matchId}` }, fetchScores)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [matchId]);

  const saveScore = async (playerId, holeNum, strokes) => {
    const val = strokes === '' ? null : parseInt(strokes);
    setScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNum]: val }
    }));
    if (val === null) {
      await supabase.from('scores')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .eq('hole_number', holeNum);
      return;
    }
    await supabase.from('scores').upsert(
      { match_id: matchId, player_id: playerId, hole_number: holeNum, strokes: val },
      { onConflict: 'match_id,player_id,hole_number' }
    );
  };

  const handleDecision = (holeNum, choice) => {
    setDecisions(prev => ({ ...prev, [holeNum]: choice }));
  };

  // ============================ SUMMARY ============================
  if (showSummary) {
    const sortedPlayers = [...players].sort((a, b) => totals[b.id] - totals[a.id]);
    return (
      <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>🏆 Round Complete</h1>
          <div style={{ color: '#888', fontSize: '14px' }}>🐺 Wolf Vegas {matchName}</div>
          <div style={{ display: 'inline-block', background: '#333', padding: '4px 12px', borderRadius: '4px', marginTop: '8px', fontSize: '12px', letterSpacing: '2px' }}>{matchCode}</div>
        </div>

        {/* Player point cards */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {sortedPlayers.map((p, idx) => {
            const isLeader = idx === 0 && totals[p.id] !== 0;
            const pts = totals[p.id];
            return (
              <div key={p.id} style={{ flex: 1, minWidth: '70px', background: '#1e1e1e', border: `2px solid ${isLeader ? '#FFD700' : ACCENT}`, borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{isLeader ? '🥇 ' : ''}{firstName(p)}</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: pts > 0 ? '#4CAF50' : pts < 0 ? '#EF5350' : '#888' }}>{pts > 0 ? `+${pts}` : pts}</div>
              </div>
            );
          })}
        </div>

        {/* Per-hole breakdown */}
        <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '15px', marginBottom: '20px', overflowX: 'auto' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Per-Hole Breakdown</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '6px', textAlign: 'left', color: '#888' }}>Hole</th>
                <th style={{ padding: '6px', textAlign: 'center', color: '#888' }}>Wolf</th>
                <th style={{ padding: '6px', textAlign: 'center', color: '#888' }}>Pick</th>
                {players.map(p => (
                  <th key={p.id} style={{ padding: '6px', textAlign: 'center', color: ACCENT }}>{firstName(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holeNumbers.map(holeNum => {
                const wolf = getWolfPlayer(holeNum);
                const decision = decisions[holeNum];
                const r = settleHole(holeNum);
                let pickLabel = '-';
                if (decision === 'lone') pickLabel = 'Lone';
                else if (decision === 'blind') pickLabel = 'Blind';
                else if (decision !== undefined) {
                  const partner = players.find(p => p.id === decision);
                  pickLabel = partner ? firstName(partner) : '-';
                }
                return (
                  <tr key={holeNum} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{ padding: '6px', fontWeight: 'bold' }}>{holeNum}</td>
                    <td style={{ padding: '6px', textAlign: 'center', color: '#ccc' }}>🐺 {firstName(wolf)}</td>
                    <td style={{ padding: '6px', textAlign: 'center', color: (decision === 'lone' || decision === 'blind') ? '#FFD700' : '#aaa' }}>{pickLabel}</td>
                    {players.map(p => {
                      const pts = r.settled ? r.pts[p.id] : 0;
                      return (
                        <td key={p.id} style={{ padding: '6px', textAlign: 'center', fontWeight: pts !== 0 ? 'bold' : 'normal', color: pts > 0 ? '#4CAF50' : pts < 0 ? '#EF5350' : '#555' }}>
                          {r.settled ? (pts > 0 ? `+${pts}` : pts === 0 ? '0' : pts) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowSummary(false)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>← Back to Scorecard</button>
          {onNewMatch && (
            <button onClick={onNewMatch} style={{ flex: 1, padding: '15px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🆕 New Round</button>
          )}
        </div>
      </div>
    );
  }

  // ============================ SCORECARD ============================
  // Find next hole needing a wolf decision
  let nextHole = null;
  for (const h of holeNumbers) {
    if (decisions[h] === undefined) { nextHole = h; break; }
  }

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Points summary */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '10px', borderBottom: `2px solid ${ACCENT}` }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '2px' }}>🐺 WOLF VEGAS</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {players.map(p => {
            const pts = totals[p.id] || 0;
            return (
              <div key={p.id} style={{ textAlign: 'center', minWidth: '60px' }}>
                <div style={{ fontSize: '11px', color: '#aaa' }}>{firstName(p)}</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: pts > 0 ? '#4CAF50' : pts < 0 ? '#EF5350' : ACCENT }}>{pts > 0 ? `+${pts}` : pts}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wolf decision panel */}
      {nextHole !== null && (() => {
        const wolf = getWolfPlayer(nextHole);
        const others = players.filter(p => p.id !== wolf.id);
        return (
          <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '12px', borderRadius: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '1px', textAlign: 'center' }}>
              HOLE {nextHole} — 🐺 {firstName(wolf)} IS THE WOLF
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {others.map(op => (
                <button key={op.id} onClick={() => handleDecision(nextHole, op.id)}
                  style={{ padding: '8px 14px', fontSize: '13px', background: '#333', color: '#aaa', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  {firstName(op)}
                </button>
              ))}
              <button onClick={() => handleDecision(nextHole, 'lone')}
                style={{ padding: '8px 14px', fontSize: '13px', background: '#FF7043', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Lone 🐺 (x2)
              </button>
              <button onClick={() => handleDecision(nextHole, 'blind')}
                style={{ padding: '8px 14px', fontSize: '13px', background: '#D84315', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Blind 🐺 (x3)
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: `3px solid ${ACCENT}` }}>PLAYER</th>
              {frontHoles.map((hNum) => (
                <th key={`f-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '9px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && <th style={{ padding: '8px', minWidth: '45px', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}`, backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '9px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && <th style={{ padding: '8px', minWidth: '45px', borderLeft: `3px solid ${ACCENT}`, backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>}
              <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, globalIdx) => {
              const playerScores = scores[player.id] || {};
              const playerHcp = player.handicap ?? player.hcp ?? 0;

              let outStrokes = 0, inStrokes = 0;
              frontHoles.forEach(h => { if (playerScores[h]) outStrokes += playerScores[h]; });
              backHoles.forEach(h => { if (playerScores[h]) inStrokes += playerScores[h]; });

              const handleScoreChange = (holeNum, val) => {
                saveScore(player.id, holeNum, val);
                if (val.length === 1) {
                  const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                  if (nextInput) setTimeout(() => nextInput.focus(), 10);
                }
              };

              const renderCell = (holeNum) => {
                const i = holeNum - 1;
                const isWolf = getWolfPlayer(holeNum).id === player.id;
                const decision = decisions[holeNum];
                const isPartner = decision === player.id;
                const r = settleHole(holeNum);
                const holePts = r.settled ? r.pts[player.id] : 0;
                const hasOneStroke = useHandicaps && playerHcp >= hcds[i];
                const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[i] + 18);

                let cellBg = holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                if (isWolf) cellBg = '#2a2030';
                if (isPartner) cellBg = '#1a2a20';

                return (
                  <td key={holeNum} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px' }}>
                    {isWolf && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', zIndex: 10 }}>🐺</div>}
                    {isPartner && <div style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '8px', zIndex: 10 }}>🤝</div>}
                    <GolfScoreTile
                      id={`score-${holeNum}-${globalIdx}`}
                      type="tel"
                      inputMode="numeric"
                      score={playerScores[holeNum] || ''}
                      par={pars[i]}
                      hasOneStroke={hasOneStroke}
                      hasTwoStrokes={hasTwoStrokes}
                      onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                      style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                    />
                    {r.settled && holePts !== 0 && (
                      <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: holePts > 0 ? '#4CAF50' : '#EF5350', background: 'rgba(0,0,0,0.5)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                        {holePts > 0 ? `+${holePts}` : holePts}
                      </div>
                    )}
                  </td>
                );
              };

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>HCP: {playerHcp} | Pts: {totals[player.id] || 0}</div>
                  </td>
                  {frontHoles.map(renderCell)}
                  {is18 && <td style={{ padding: '8px', textAlign: 'center', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}`, backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{outStrokes || '-'}</td>}
                  {backHoles.map(renderCell)}
                  {is18 && <td style={{ padding: '8px', textAlign: 'center', borderLeft: `3px solid ${ACCENT}`, backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{inStrokes || '-'}</td>}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{(outStrokes + inStrokes) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(transparent, #121212 30%)', zIndex: 200 }}>
        <button onClick={() => setShowSummary(true)} style={{ padding: '15px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
