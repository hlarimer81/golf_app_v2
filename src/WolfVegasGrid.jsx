import React, { useState } from 'react';
import { finishRound } from './lib/handicap';
import GolfScoreTile from './GolfScoreTile';
import { useScores } from './hooks/useScores';
import { focusNextScore } from './lib/scoreEntry';
import { useWolfVegasState } from './useWolfVegasState';
import { settleWolfVegasHole } from './lib/golf';
import BetControls from './components/BetControls';
import { useBet } from './useBet';
import { settleZeroSumPoints } from './settlement';

// Wolf Vegas: 4 or 5 players. Each hole one player is the "Wolf" (rotates; tees last). The
// Wolf picks a partner (2v2 at 4p, 2v3 at 5p), goes Lone Wolf (1v3 / 1v4, points doubled),
// or Blind Wolf (tripled). Each side forms a two-digit "Vegas number" from its two LOWEST
// net scores, low-then-high (a 1-man side doubles its net, e.g. 4 -> 44); the number flips
// high-then-low when the OPPOSING side birdies. Points swing = difference of the two Vegas
// numbers. Awarding: equal-sized sides settle the difference once each; unequal sides settle
// per opposing player, so each wolf-side player swings mag*(opp count) and each opponent
// swings mag*(wolf count) — always zero-sum. The Lone/Blind multiplier and the per-hole
// hammer (x2 per hammer, stacking) scale both sides equally. Only a natural (gross) birdie flips
// by default; the "Birdies" toggle switches to net. Winners gain, losers lose.
export default function WolfVegasGrid({ matchId, matchName, matchCode, players, useHandicaps, courseData, onNewMatch, onRoundFinished, holesCount = 18, startHole = 1, initialShowSummary = false }) {
  const { scores, saveScore } = useScores(matchId);
  const [showSummary, setShowSummary] = useState(initialShowSummary);
  const [isBanked, setIsBanked] = useState(initialShowSummary);
  // Wolf decisions, hammers, and the birdie option are persisted per-match (survive refresh
  // and sync across devices). decisions[holeNum] = partner playerId | 'lone' | 'blind';
  // hammers[holeNum] = hammer count (each doubles: 0->x1, 1->x2...); grossBirdies default true.
  const { decisions, hammers, grossBirdies, setDecision, adjustHammer, cycleHammer, toggleGrossBirdies } = useWolfVegasState(matchId);
  // The bet: $ per point, saved to matches.wager like Skins and Nassau.
  const bet = useBet(matchId);
  const { wager, hasStake } = bet;

  // Per-Hole Breakdown (summary screen): the sticky Hole column stays in place while the rest
  // of the row scrolls under it, so the Wolf/Pick/Hammer/player columns only fully disappear
  // behind it once there's enough scroll range left after the last player column to carry them
  // all the way there. With 4 players that combined column width can be narrower than the
  // scrollable area (more so with short names or a wide phone), capping the max scroll short and
  // leaving the tail of the Hammer stepper peeking out beside the Hole number (issue #71). A
  // trailing spacer column, sized to make up that shortfall, gives the scroll room it's missing.
  // Measured from a ref callback (not an effect) since the measurement only matters once the row
  // is in the DOM and doesn't need to re-run on every render.
  const [breakdownSpacerWidth, setBreakdownSpacerWidth] = useState(0);
  const measureBreakdownSpacer = (wrap) => {
    if (!wrap) return;
    const firstTh = wrap.querySelector('[data-breakdown-player-col="first"]');
    const lastTh = wrap.querySelector('[data-breakdown-player-col="last"]');
    if (!firstTh || !lastTh) return;
    const needed = Math.max(0, wrap.clientWidth - (lastTh.getBoundingClientRect().right - firstTh.getBoundingClientRect().left));
    setBreakdownSpacerWidth(prev => (prev === needed ? prev : needed));
  };

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

  // Per-hole hammer multiplier: each hammer doubles the hole (x1, x2, x4, x8...).
  const hammerMult = (holeNum) => Math.pow(2, hammers[holeNum] || 0);

  // Settle one hole -> { pts: {playerId: signed}, wolfNum, oppNum, diff, settled }
  const settleHole = (holeNum) => {
    const pts = {};
    players.forEach(p => { pts[p.id] = 0; });
    const result = { pts, wolfNum: 0, oppNum: 0, diff: 0, settled: false };

    const decision = decisions[holeNum];
    if (decision === undefined) return result;

    const wolf = getWolfPlayer(holeNum);
    const par = pars[holeNum - 1];

    // Every player must be scored (4 or 5 of them).
    const net = {};
    for (const p of players) {
      const n = cappedNet(p.id, holeNum);
      if (n === null) return result;
      net[p.id] = n;
    }

    // Form the two sides.
    let wolfSide, oppSide, mult;
    if (decision === 'lone' || decision === 'blind') {
      mult = decision === 'blind' ? BLIND_MULT : LONE_MULT;
      wolfSide = [wolf];
      oppSide = players.filter(p => p.id !== wolf.id);
    } else {
      const partner = players.find(p => p.id === decision);
      if (!partner || partner.id === wolf.id) return result;
      mult = 1;
      wolfSide = [wolf, partner];
      oppSide = players.filter(p => p.id !== wolf.id && p.id !== partner.id);
    }
    if (oppSide.length === 0) return result;

    // Numbers, birdie flips and each player's swing: settleWolfVegasHole in lib/golf.js.
    // The Lone/Blind multiplier and the per-hole hammer scale both sides equally.
    const member = (p) => ({ id: p.id, gross: grossOf(p.id, holeNum), net: net[p.id] });
    const { pts: holePts, wolfNum, oppNum, diff } = settleWolfVegasHole(
      wolfSide.map(member), oppSide.map(member), par,
      { grossBirdies, scale: mult * hammerMult(holeNum) });
    Object.assign(pts, holePts);

    result.wolfNum = wolfNum;
    result.oppNum = oppNum;
    result.diff = diff;
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

  // Points are already settled player against player, so the money is points x rate.
  const settlement = settleZeroSumPoints({ players, wager, pointsById: totals });
  const moneyOf = (id) => settlement.entities.find(e => e.idx === id)?.net || 0;
  const fmtMoney = (amt) => amt > 0.005 ? `+$${amt.toFixed(2)}` : amt < -0.005 ? `-$${Math.abs(amt).toFixed(2)}` : '$0.00';

  const betButtons = (
    <BetControls bet={bet} settlement={settlement} gameType="wolfvegas" gameName="Wolf Vegas" accent={ACCENT} />
  );



  // ============================ SUMMARY ============================
  if (showSummary) {
    const sortedPlayers = [...players].sort((a, b) => totals[b.id] - totals[a.id]);
    return (
      <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '24px', color: '#e0e0e0' }}>🏆 Round Complete</h1>
          <div style={{ color: '#888', fontSize: '14px' }}>🐺 Wolf Vegas {matchName}</div>
          <div style={{ display: 'inline-block', background: '#333', padding: '4px 12px', borderRadius: '4px', marginTop: '8px', fontSize: '12px', letterSpacing: '2px' }}>{matchCode}</div>
        </div>

        {/* Player point cards */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sortedPlayers.length}, 1fr)`, gap: '10px', marginBottom: '20px' }}>
          {sortedPlayers.map((p, idx) => {
            const isLeader = idx === 0 && totals[p.id] !== 0;
            const pts = totals[p.id];
            return (
              <div key={p.id} style={{ background: '#1e1e1e', border: `2px solid ${isLeader ? '#FFD700' : ACCENT}`, borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{isLeader ? '🥇 ' : ''}{firstName(p)}</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: pts > 0 ? '#4CAF50' : pts < 0 ? '#EF5350' : '#888' }}>{pts > 0 ? `+${pts}` : pts}</div>
                {hasStake && <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ccc', marginTop: '2px' }}>{fmtMoney(moneyOf(p.id))}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>{betButtons}</div>

        {/* Per-hole breakdown */}
        <div ref={measureBreakdownSpacer} style={{ background: '#1e1e1e', borderRadius: '12px', padding: '15px', marginBottom: '20px', overflowX: 'auto' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Per-Hole Breakdown</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '6px', textAlign: 'left', color: '#888', position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#1e1e1e', borderRight: '2px solid #333' }}>Hole</th>
                <th style={{ padding: '6px', textAlign: 'center', color: '#888', minWidth: '70px', whiteSpace: 'nowrap' }}>Wolf</th>
                <th style={{ padding: '6px', textAlign: 'center', color: '#888', minWidth: '60px', whiteSpace: 'nowrap' }}>Pick</th>
                <th style={{ padding: '6px', textAlign: 'center', color: '#888', minWidth: '80px', whiteSpace: 'nowrap' }}>🔨</th>
                {players.map((p, idx) => (
                  <th
                    key={p.id}
                    data-breakdown-player-col={idx === 0 ? 'first' : idx === players.length - 1 ? 'last' : undefined}
                    style={{ padding: '6px', textAlign: 'center', color: ACCENT, minWidth: '60px', whiteSpace: 'nowrap' }}>{firstName(p)}</th>
                ))}
                {breakdownSpacerWidth > 0 && <th style={{ minWidth: `${breakdownSpacerWidth}px`, padding: 0 }} aria-hidden="true" />}
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
                    <td style={{ padding: '6px', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#1e1e1e', borderRight: '2px solid #333' }}>{holeNum}</td>
                    <td style={{ padding: '6px', textAlign: 'center', color: '#ccc', whiteSpace: 'nowrap' }}>🐺 {firstName(wolf)}</td>
                    <td style={{ padding: '6px', textAlign: 'center', color: (decision === 'lone' || decision === 'blind') ? '#FFD700' : '#aaa', whiteSpace: 'nowrap' }}>{pickLabel}</td>
                    <td style={{ padding: '6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {isBanked ? (
                        <span style={{ display: 'inline-block', minWidth: '30px', fontWeight: 'bold', color: (hammers[holeNum] || 0) > 0 ? '#FFD700' : '#555' }}>×{hammerMult(holeNum)}</span>
                      ) : (
                        <>
                          <button onClick={() => adjustHammer(holeNum, -1)} style={{ width: '20px', height: '20px', fontSize: '13px', lineHeight: '1', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>−</button>
                          <span style={{ display: 'inline-block', minWidth: '30px', fontWeight: 'bold', color: (hammers[holeNum] || 0) > 0 ? '#FFD700' : '#555' }}>×{hammerMult(holeNum)}</span>
                          <button onClick={() => adjustHammer(holeNum, 1)} style={{ width: '20px', height: '20px', fontSize: '13px', lineHeight: '1', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                        </>
                      )}
                    </td>
                    {players.map(p => {
                      const pts = r.settled ? r.pts[p.id] : 0;
                      return (
                        <td key={p.id} style={{ padding: '6px', textAlign: 'center', fontWeight: pts !== 0 ? 'bold' : 'normal', color: pts > 0 ? '#4CAF50' : pts < 0 ? '#EF5350' : '#555' }}>
                          {r.settled ? (pts > 0 ? `+${pts}` : pts === 0 ? '0' : pts) : '-'}
                        </td>
                      );
                    })}
                    {breakdownSpacerWidth > 0 && <td style={{ padding: 0 }} aria-hidden="true" />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {!isBanked && (
            <button onClick={() => setShowSummary(false)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>← Back to Scorecard</button>
          )}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '2px' }}>🐺 WOLF VEGAS</div>
          <button
            onClick={() => toggleGrossBirdies()}
            title="Which birdies flip a side's number"
            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', border: `1px solid ${ACCENT}`, background: grossBirdies ? ACCENT : 'transparent', color: grossBirdies ? '#fff' : '#aaa', cursor: 'pointer' }}>
            Birdies: {grossBirdies ? 'Gross' : 'Net'}
          </button>
          {betButtons}
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
                <button key={op.id} onClick={() => setDecision(nextHole, op.id)}
                  style={{ padding: '8px 14px', fontSize: '13px', background: '#333', color: '#aaa', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  {firstName(op)}
                </button>
              ))}
              <button onClick={() => setDecision(nextHole, 'lone')}
                style={{ padding: '8px 14px', fontSize: '13px', background: '#FF7043', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Lone 🐺 (x2)
              </button>
              <button onClick={() => setDecision(nextHole, 'blind')}
                style={{ padding: '8px 14px', fontSize: '13px', background: '#D84315', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Blind 🐺 (x3)
              </button>
            </div>
            {/* Hammer control for the hole being played */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', color: '#888', letterSpacing: '1px' }}>🔨 HAMMER</span>
              <button onClick={() => adjustHammer(nextHole, -1)}
                style={{ width: '28px', height: '28px', fontSize: '16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>−</button>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: (hammers[nextHole] || 0) > 0 ? '#FFD700' : '#888', minWidth: '32px', textAlign: 'center' }}>×{hammerMult(nextHole)}</span>
              <button onClick={() => adjustHammer(nextHole, 1)}
                style={{ width: '28px', height: '28px', fontSize: '16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>+</button>
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
                  <div onClick={() => cycleHammer(hNum)} title="Tap to hammer" style={{ fontSize: '9px', marginTop: '2px', cursor: 'pointer', fontWeight: 'bold', color: (hammers[hNum] || 0) > 0 ? '#FFD700' : '#555' }}>🔨{(hammers[hNum] || 0) > 0 ? `×${hammerMult(hNum)}` : ''}</div>
                </th>
              ))}
              {is18 && <th style={{ padding: '8px', minWidth: '45px', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}`, backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '9px', color: '#666' }}>P{pars[hNum - 1]}</span>
                  <div onClick={() => cycleHammer(hNum)} title="Tap to hammer" style={{ fontSize: '9px', marginTop: '2px', cursor: 'pointer', fontWeight: 'bold', color: (hammers[hNum] || 0) > 0 ? '#FFD700' : '#555' }}>🔨{(hammers[hNum] || 0) > 0 ? `×${hammerMult(hNum)}` : ''}</div>
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
                  focusNextScore(nextInput);
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
                  <td key={holeNum} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px', overflow: 'hidden' }}>
                    {isWolf && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', zIndex: 10 }}>🐺</div>}
                    {isPartner && <div style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '8px', zIndex: 10 }}>🤝</div>}
                    {isWolf && (hammers[holeNum] || 0) > 0 && <div style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '8px', fontWeight: 'bold', color: '#FFD700', zIndex: 10 }}>🔨×{hammerMult(holeNum)}</div>}
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
                    {r.settled && (
                      <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: holePts > 0 ? '#4CAF50' : holePts < 0 ? '#EF5350' : '#888', background: 'rgba(0,0,0,0.5)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                        {holePts > 0 ? `+${holePts}` : holePts}
                      </div>
                    )}
                  </td>
                );
              };

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 20, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{useHandicaps && `HCP: ${playerHcp} | `}Pts: {totals[player.id] || 0}</div>
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
        <button onClick={() => { finishRound(matchId); setIsBanked(true); setShowSummary(true); onRoundFinished?.(); }} style={{ padding: '15px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
