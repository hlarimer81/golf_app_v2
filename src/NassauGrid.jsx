import React, { useState } from 'react';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';
import MoneyModal from './MoneyModal';
import WagerConfig from './WagerConfig';
import HoleInfoModal from './HoleInfoModal';
import { useWager } from './useWager';
import { usePresses } from './usePresses';
import { useScores } from './hooks/useScores';
import { settleNassau, wagerHasStake } from './settlement';
import { computeNassau, nassauSettlementSegments } from './nassauEngine';

export default function NassauGrid({ matchId, matchName, matchCode, players, useHandicaps, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
    const { scores, saveScore } = useScores(matchId);
    const [showSummary, setShowSummary] = useState(false);
    const [showMoney, setShowMoney] = useState(false);
    const [showWager, setShowWager] = useState(false);
    const [holeInfo, setHoleInfo] = useState(null);
    const { wager, saveWager } = useWager(matchId);
    const { presses, addPress, removePress } = usePresses(matchId);

    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);
  
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


  const getHoleWinner = (holeIndex) => {
    const teams = {};
    players.forEach(p => {
      if (!teams[p.team]) teams[p.team] = [];
      const strokes = scores[p.id]?.[holeIndex + 1];
      if (strokes) {
        teams[p.team].push(calculateNetStrokes(strokes, holeIndex, p.handicap || p.hcp));
      }
    });
    
    const teamKeys = Object.keys(teams);
    if (teamKeys.length < 2) return null;
    
    const t1 = teams[teamKeys[0]];
    const t2 = teams[teamKeys[1]];
    if (t1.length === 0 || t2.length === 0 || t1.includes(null) || t2.includes(null)) return null;
    
    const t1Best = Math.min(...t1);
    const t2Best = Math.min(...t2);
    
    if (t1Best < t2Best) return teamKeys[0];
    if (t2Best < t1Best) return teamKeys[1];
    return "TIE";
  };

  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="nassau"
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

  const teamNames = [...new Set(players.map(p => p.team).filter(Boolean))];
  const t1Name = teamNames[0] || "Team A";
  const t2Name = teamNames[1] || "Team B";

  let frontPoints = { [t1Name]: 0, [t2Name]: 0 };
  let backPoints = { [t1Name]: 0, [t2Name]: 0 };
  let overallPoints = { [t1Name]: 0, [t2Name]: 0 };

  for (let i = 0; i < 9; i++) {
    const w = getHoleWinner(i);
    if (w && w !== "TIE") { frontPoints[w]++; overallPoints[w]++; }
  }
  for (let i = 9; i < 18; i++) {
    const w = getHoleWinner(i);
    if (w && w !== "TIE") { backPoints[w]++; overallPoints[w]++; }
  }

  const getStatus = (pts) => {
    const diff = pts[t1Name] - pts[t2Name];
    if (diff > 0) return `${t1Name} +${diff}`;
    if (diff < 0) return `${t2Name} +${Math.abs(diff)}`;
    return "AS";
  };

  // ---- Nassau engine: best-net per side per hole, then compute matches + settlement ----
  const bestNetForTeam = (team, holeIndex) => {
    let best = 0;
    players.filter((p) => p.team === team).forEach((p) => {
      const strokes = scores[p.id]?.[holeIndex + 1];
      const net = calculateNetStrokes(strokes, holeIndex, p.handicap ?? p.hcp ?? 0);
      if (net != null && (best === 0 || net < best)) best = net;
    });
    return best;
  };
  const sideNet = [[], []];
  for (let h = 0; h < 18; h++) {
    sideNet[0][h] = bestNetForTeam(t1Name, h);
    sideNet[1][h] = bestNetForTeam(t2Name, h);
  }
  const nassau = computeNassau({ sides: [t1Name, t2Name], sideNet, manualPressHoles: presses });
  const segments = nassauSettlementSegments({ matches: nassau.matches, sideNames: [t1Name, t2Name], wager });
  const settlement = settleNassau({ wager, teamNames: [t1Name, t2Name], segments });
  const hasStake = wagerHasStake(wager);

  // Which holes currently have both sides scored (so a press is meaningful there).
  const holeScored = (holeIndex) => sideNet[0][holeIndex] > 0 && sideNet[1][holeIndex] > 0;
  const pressActiveAfter = (holeIndex) => presses.includes(holeIndex);

  const openHoleInfo = (holeIndex) => {
    const holeNum = holeIndex + 1;
    const rows = players.map((p) => {
      const gross = scores[p.id]?.[holeNum] ?? null;
      const net = calculateNetStrokes(gross, holeIndex, p.handicap ?? p.hcp ?? 0);
      return { name: (p.player_name || p.name), gross, net, note: `Team ${p.team}` };
    });
    const w = getHoleWinner(holeIndex);
    let summary = 'Not enough scores yet.';
    if (w === 'TIE') summary = 'Hole halved — no change.';
    else if (w) summary = `${w} wins the hole (low net ${Math.min(sideNet[0][holeIndex] || 99, sideNet[1][holeIndex] || 99)}).`;
    rows.forEach((r) => { if (r.note === `Team ${w}`) r.highlight = true; });
    setHoleInfo({ hole: holeNum, par: pars[holeIndex], rows, summary });
  };

  return (

    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>
      
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '15px', borderBottom: '2px solid #0D47A1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold' }}>FRONT 9</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0D47A1' }}>{getStatus(frontPoints)}</div>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #333', borderRight: '1px solid #333' }}>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold' }}>OVERALL</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#1565C0' }}>{getStatus(overallPoints)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold' }}>BACK 9</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0D47A1' }}>{getStatus(backPoints)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '12px' }}>
          <button onClick={() => setShowWager(true)} style={{ background: '#333', color: '#64B5F6', border: '1px solid #64B5F6', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>💵 Wager</button>
          {hasStake && <button onClick={() => setShowMoney(true)} style={{ background: '#1565C0', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>💰 Money</button>}
        </div>
        {presses.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
            {presses.map((h) => (
              <button key={h} onClick={() => removePress(h)} title="Tap to remove press"
                style={{ background: '#0D47A122', color: '#64B5F6', border: '1px solid #0D47A1', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}>
                Press after {h + 1} ✕
              </button>
            ))}
          </div>
        )}
      </div>


      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #0D47A1' }}>PLAYER</th>
              {[...Array(9)].map((_, i) => (
                <th key={`f-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 1}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i]}</span>
                </th>
              ))}
              <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #0D47A1', borderRight: '3px solid #0D47A1', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              {[...Array(9)].map((_, i) => (
                <th key={`b-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 10) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 10}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i+9]}</span>
                </th>
              ))}
              <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #0D47A1', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
              <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
            {/* Press / Info control row: tap PRESS after a scored hole; (i) explains the hole. */}
            <tr style={{ backgroundColor: '#1c1c1c' }}>
              <th style={{ position: 'sticky', left: 0, zIndex: 110, backgroundColor: '#1c1c1c', padding: '4px 8px', textAlign: 'left', borderRight: '3px solid #0D47A1', fontSize: '9px', color: '#666', fontWeight: 'normal' }}>PRESS / INFO</th>
              {[...Array(9)].map((_, i) => (
                <th key={`fc-${i}`} style={{ padding: '2px', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1c1c1c' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                    {holeScored(i) && (
                      <button onClick={() => (pressActiveAfter(i) ? removePress(i) : addPress(i))}
                        style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: pressActiveAfter(i) ? '#1565C0' : '#333', color: pressActiveAfter(i) ? '#fff' : '#64B5F6' }}>
                        {pressActiveAfter(i) ? 'ON' : 'PRS'}
                      </button>
                    )}
                    <button onClick={() => openHoleInfo(i)} style={{ fontSize: '9px', padding: '0 4px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer' }}>i</button>
                  </div>
                </th>
              ))}
              <th style={{ backgroundColor: '#1c1c1c', borderLeft: '3px solid #0D47A1', borderRight: '3px solid #0D47A1' }} />
              {[...Array(9)].map((_, i) => {
                const realIndex = i + 9;
                return (
                  <th key={`bc-${i}`} style={{ padding: '2px', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1c1c1c' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                      {holeScored(realIndex) && (
                        <button onClick={() => (pressActiveAfter(realIndex) ? removePress(realIndex) : addPress(realIndex))}
                          style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: pressActiveAfter(realIndex) ? '#1565C0' : '#333', color: pressActiveAfter(realIndex) ? '#fff' : '#64B5F6' }}>
                          {pressActiveAfter(realIndex) ? 'ON' : 'PRS'}
                        </button>
                      )}
                      <button onClick={() => openHoleInfo(realIndex)} style={{ fontSize: '9px', padding: '0 4px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer' }}>i</button>
                    </div>
                  </th>
                );
              })}
              <th style={{ backgroundColor: '#1c1c1c', borderLeft: '3px solid #0D47A1' }} />
              <th style={{ backgroundColor: '#1c1c1c', borderLeft: '1px solid #333' }} />
            </tr>
          </thead>
          <tbody>

            {players.map((player, globalIdx) => {
              const playerScores = scores[player.id] || {};
              const playerHcp = player.handicap ?? player.hcp ?? 0;
              
              let outStrokes = 0; let inStrokes = 0;
              for (let h = 1; h <= 9; h++) if (playerScores[h]) outStrokes += playerScores[h];
              for (let h = 10; h <= 18; h++) if (playerScores[h]) inStrokes += playerScores[h];

              const handleScoreChange = (holeNum, val) => {
                saveScore(player.id, holeNum, val);
                if (val.length === 1) {
                  const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                  if (nextInput) setTimeout(() => nextInput.focus(), 10);
                }
              };

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>HCP: {playerHcp}</div>
                  </td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 1;
                    const isWinningTeam = getHoleWinner(i) === player.team;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[i];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[i] + 18);

                    return (
                      <td key={`f-${i}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px' }}>
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
                        {isWinningTeam && playerScores[holeNum] > 0 && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: '#0D47A1', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>WIN</div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #0D47A1', borderRight: '3px solid #0D47A1', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{outStrokes || '-'}</td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 10;
                    const realIndex = i + 9;
                    const isWinningTeam = getHoleWinner(realIndex) === player.team;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[realIndex];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[realIndex] + 18);

                    return (
                      <td key={`b-${i}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: (i + 10) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px' }}>
                        <GolfScoreTile 
                          id={`score-${holeNum}-${globalIdx}`}
                          type="tel"
                          inputMode="numeric"
                          score={playerScores[holeNum] || ''}
                          par={pars[realIndex]}
                          hasOneStroke={hasOneStroke}
                          hasTwoStrokes={hasTwoStrokes}
                          onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                          style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                        />
                        {isWinningTeam && playerScores[holeNum] > 0 && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: '#0D47A1', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>WIN</div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #0D47A1', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{inStrokes || '-'}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{(outStrokes + inStrokes) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(transparent, #121212 30%)', zIndex: 200 }}>
        <button onClick={() => setShowSummary(true)} style={{ padding: '15px', backgroundColor: '#0D47A1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />

      {showWager && (
        <WagerConfig gameType="nassau" wager={wager} accent="#1565C0"
          onClose={() => setShowWager(false)}
          onSave={(w) => { saveWager(w); setShowWager(false); }} />
      )}
      {showMoney && (
        <MoneyModal settlement={settlement} gameName="Nassau" accent="#1565C0"
          onClose={() => setShowMoney(false)} />
      )}
      {holeInfo && (
        <HoleInfoModal info={holeInfo} gameName="Nassau" accent="#1565C0"
          onClose={() => setHoleInfo(null)} />
      )}
    </div>
  );
}

