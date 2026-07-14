import React, { useState, useMemo } from 'react';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';
import MoneyModal from './MoneyModal';
import WagerConfig from './WagerConfig';
import { useWager } from './useWager';
import { useScores } from './hooks/useScores';
import { settleSkins, wagerHasStake } from './settlement';
import {
  PAR_FALLBACK,
  HCP_FALLBACK,
  netScore as calcNet,
  strokesReceived,
  pointsUpToHole,
  holeLayout,
  scoreColor,
} from './lib/golf';

export default function SkinsGrid({ matchId, matchName, matchCode, players, useHandicaps, useCarryover, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
  const [showSummary, setShowSummary] = useState(false);
  const [showMoney, setShowMoney] = useState(false);
  const [showWager, setShowWager] = useState(false);
  const { wager, saveWager } = useWager(matchId);
  const { scores, saveScore } = useScores(matchId);

  const pars = courseData?.pars || PAR_FALLBACK;
  const hcds = courseData?.handicaps || HCP_FALLBACK;

  const { holeNumbers, is18, frontHoles, backHoles } = holeLayout(holesCount, startHole);

  const getNetScore = (strokes, holeIndex, playerHandicap) =>
    calcNet(strokes, holeIndex, playerHandicap, hcds, useHandicaps);

  const getPlayerPointsUpToHole = (playerId) =>
    pointsUpToHole(scores[playerId] || {}, 18, pars, hcds);

  // Per-hole skin result, memoized so it isn't recomputed per header + per body cell.
  const holeResults = useMemo(() => {
    const results = {};
    for (const holeNum of holeNumbers) {
      const holeIndex = holeNum - 1;
      const holeScores = [];
      players.forEach((player) => {
        const strokes = (scores[player.id] || {})[holeNum];
        const hcp = player.handicap ?? player.hcp ?? 0;
        const net = getNetScore(strokes, holeIndex, hcp);
        if (net !== null) {
          holeScores.push({ playerId: player.id, playerName: player.player_name || player.name, net });
        }
      });
      if (holeScores.length !== players.length) {
        results[holeNum] = { status: 'incomplete' };
        continue;
      }
      const minScore = Math.min(...holeScores.map((s) => s.net));
      const winners = holeScores.filter((s) => s.net === minScore);
      results[holeNum] = winners.length === 1
        ? { status: 'won', winner: winners[0].playerName, playerId: winners[0].playerId }
        : { status: 'push' };
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, players, useHandicaps, holesCount, startHole]);

  const getHoleSkinResult = (holeIndex) => holeResults[holeIndex + 1] || { status: 'incomplete' };

  // Skin totals (with carryover), plus the per-hole winner list used by the Money modal.
  const { skinTotals, holeWinners } = useMemo(() => {
    const totals = {};
    players.forEach((p) => { totals[p.id] = 0; });
    const winners = [];
    let carry = 0;
    for (const holeNum of holeNumbers) {
      const result = holeResults[holeNum];
      if (!result || result.status === 'incomplete') continue;
      if (result.status === 'push') {
        if (useCarryover) carry += 1;
        continue;
      }
      totals[result.playerId] += 1 + carry;
      winners.push({ hole: holeNum, winnerId: result.playerId, skins: 1 + carry });
      carry = 0;
    }
    return { skinTotals: totals, holeWinners: winners };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeResults, useCarryover, holesCount, startHole]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (skinTotals[b.id] || 0) - (skinTotals[a.id] || 0)),
    [players, skinTotals]
  );

  const settlement = useMemo(
    () => settleSkins({ players, wager, skinsById: skinTotals, holeWinners }),
    [players, wager, skinTotals, holeWinners]
  );
  const hasStake = wagerHasStake(wager);

  // Show summary screen
  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="skins"
        players={players}
        scores={scores}
        useHandicaps={useHandicaps}
        
        courseData={courseData}
        holesCount={holesCount}
        startHole={startHole}
        onBack={() => setShowSummary(false)}
        onNewMatch={onNewMatch}
      />
    );
  }

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* --- SKINS LEADERBOARD (STICKY) --- */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderBottom: '2px solid #FFD700', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            🎰 Skins {useCarryover ? '(Carryover)' : '(No Carryover)'}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowWager(true)} style={{ background: '#333', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>💵 Wager</button>
            {hasStake && <button onClick={() => setShowMoney(true)} style={{ background: '#FFD700', color: '#000', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>💰 Money</button>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '8px', textAlign: 'center', flexWrap: 'wrap' }}>
          {sortedPlayers.slice(0, 8).map((player, idx) => {
            const skinCount = skinTotals[player.id] || 0;
            return (
              <div key={player.id} style={{ 
                flex: '1 1 80px',
                minWidth: '70px',
                background: idx === 0 && skinCount > 0 ? '#FFD70033' : '#252525', 
                borderRadius: '8px', 
                padding: '8px', 
                border: `2px solid ${idx === 0 && skinCount > 0 ? '#FFD700' : '#333'}` 
              }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {player.player_name || player.name}
                </div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: skinCount > 0 ? '#FFD700' : '#666', marginTop: '2px' }}>
                  {skinCount}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- SCORING GRID --- */}
      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '10px', minWidth: '100px', textAlign: 'left', borderRight: '2px solid #FFD700' }}>PLAYER</th>
              {frontHoles.map((hNum) => {
                const hIdx = hNum - 1;
                const result = getHoleSkinResult(hIdx);
                return (
                  <th key={`f-${hNum}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'won' ? '#FFD70022' : result.status === 'push' ? '#ff980022' : hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br /><span style={{ fontSize: '8px', color: result.status === 'won' ? '#FFD700' : result.status === 'push' ? '#ff9800' : '#666' }}>{result.status === 'won' ? '🏆' : result.status === 'push' ? '↔️' : `P${pars[hIdx]}`}</span>
                  </th>
                );
              })}
              {is18 && (
                <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #FFD700', borderRight: '2px solid #FFD700', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              )}
              {backHoles.map((hNum) => {
                const hIdx = hNum - 1;
                const result = getHoleSkinResult(hIdx);
                return (
                  <th key={`b-${hNum}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'won' ? '#FFD70022' : result.status === 'push' ? '#ff980022' : hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br /><span style={{ fontSize: '8px', color: result.status === 'won' ? '#FFD700' : result.status === 'push' ? '#ff9800' : '#666' }}>{result.status === 'won' ? '🏆' : result.status === 'push' ? '↔️' : `P${pars[hIdx]}`}</span>
                  </th>
                );
              })}
              {is18 && (
                <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #FFD700', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
              )}
              <th style={{ padding: '6px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, globalIdx) => {
              const playerScores = scores[player.id] || {};
              const playerHcp = player.handicap ?? player.hcp ?? 0;
              const quotaGoal = 36 - playerHcp;

              let outStrokes = 0;
              let inStrokes = 0;
              frontHoles.forEach(h => { if (playerScores[h]) outStrokes += playerScores[h]; });
              backHoles.forEach(h => { if (playerScores[h]) inStrokes += playerScores[h]; });
              const totalStrokes = outStrokes + inStrokes;

              const handleScoreChange = (holeNum, val) => {
                saveScore(player.id, holeNum, val);
                if (val.length === 1) {
                  const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                  if (nextInput) setTimeout(() => nextInput.focus(), 10);
                }
              };

              const renderCell = (hNum) => {
                const hIdx = hNum - 1;
                const strokes = playerScores[hNum];
                const net = getNetScore(strokes, hIdx, playerHcp);
                const par = pars[hIdx];
                const result = getHoleSkinResult(hIdx);
                const isWinner = result.status === 'won' && result.playerId === player.id;
                const received = strokesReceived(playerHcp, hIdx, hcds, useHandicaps);

                return (
                  <td key={`c-${hNum}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: isWinner ? '#FFD70033' : hNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                    <GolfScoreTile 
                      id={`score-${hNum}-${globalIdx}`}
                      type="tel"
                      inputMode="numeric"
                      score={strokes || ''}
                      par={par}
                      hasOneStroke={received >= 1}
                      hasTwoStrokes={received >= 2}
                      customBorderColor={isWinner ? '#FFD700' : undefined}
                      onChange={(e) => handleScoreChange(hNum, e.target.value)}
                      style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: isWinner ? '#FFD70044' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                    />
                    {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                    {isWinner && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>🏆</div>}
                  </td>
                );
              };

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '8px 10px', fontWeight: 'bold', borderRight: '2px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '8px', color: '#666', fontWeight: 'normal' }}>
                      {useHandicaps && `HCP: ${playerHcp}`}
                      <span style={{ marginLeft: '6px', color: '#FFD700', fontWeight: 'bold' }}>
                        🎰 {skinTotals[player.id] || 0}
                      </span>
                    </div>
                  </td>
                  {frontHoles.map(renderCell)}
                  {is18 && (
                    <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #FFD700', borderRight: '2px solid #FFD700', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                      {outStrokes > 0 ? outStrokes : '-'}
                    </td>
                  )}
                  {backHoles.map(renderCell)}
                  {is18 && (
                    <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #FFD700', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                      {inStrokes > 0 ? inStrokes : '-'}
                    </td>
                  )}
                  <td style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>
                    {totalStrokes > 0 ? totalStrokes : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- FINISH MATCH BUTTON (PINNED) --- */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '10px',
        background: 'linear-gradient(transparent, #121212 30%)',
        zIndex: 200
      }}>
        <button
          onClick={() => setShowSummary(true)}
          style={{
            padding: '15px',
            backgroundColor: '#FFD700',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.5)'
          }}
        >
          🏁 Finish Round
        </button>
      </div>
      {/* Spacer to prevent content from being hidden behind fixed button */}
      <div style={{ height: '70px', flexShrink: 0 }} />

      {showWager && (
        <WagerConfig gameType="skins" wager={wager} accent="#FFD700"
          onClose={() => setShowWager(false)}
          onSave={(w) => { saveWager(w); setShowWager(false); }} />
      )}
      {showMoney && (
        <MoneyModal settlement={settlement} gameName="Skins" accent="#FFD700"
          onClose={() => setShowMoney(false)} />
      )}
    </div>
  );
}
