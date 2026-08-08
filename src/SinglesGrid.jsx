import React, { useState } from 'react';
import { finishRound } from './lib/handicap';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';
import { useScores } from './hooks/useScores';

export default function SinglesGrid({ matchId, matchName, matchCode, players, useHandicaps, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
    const { scores, saveScore } = useScores(matchId);
    const [showSummary, setShowSummary] = useState(false);
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);

    // Build dynamic hole list
    const holeNumbers = [];
    for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);
    const is18 = holesCount === 18;
    const frontHoles = is18 ? holeNumbers.slice(0, 9) : holeNumbers;
    const backHoles = is18 ? holeNumbers.slice(9) : [];

    // Show summary screen
    if (showSummary) {
      return (
        <MatchSummary
          matchName={matchName}
          matchCode={matchCode}
          gameType="singles"
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

    const getNetScore = (strokes, holeIndex, playerHandicap) => {
      if (!strokes || strokes === 0) return null;
      let net = parseInt(strokes);
      if (useHandicaps) {
        const diff = hcds[holeIndex];
        const hcp = parseInt(playerHandicap) || 0;
        if (hcp >= diff) net -= 1;
        if (hcp >= diff + 18) net -= 1;
      }
      return net;
    };

    const calculatePoints = (strokes, holeIndex, playerHandicap) => {
      if (!strokes || strokes === 0) return 0;
      let netStrokes = parseInt(strokes);
      
      if (useHandicaps) {
        const holeDifficulty = hcds[holeIndex];
        const hcp = parseInt(playerHandicap) || 0;
        if (hcp >= holeDifficulty) netStrokes -= 1;
        if (hcp >= holeDifficulty + 18) netStrokes -= 1;
      }
  
      const par = pars[holeIndex];
      const diff = netStrokes - par;
      if (diff <= -2) return 4;
      if (diff === -1) return 3;
      if (diff === 0) return 2;
      if (diff === 1) return 1;
      return 0;
    };

    const getPlayerPointsUpToHole = (playerId, upToHole, playerHcp) => {
      const playerScores = scores[playerId] || {};
      let total = 0;
      for (let h = 1; h <= upToHole; h++) {
        if (playerScores[h]) {
          total += calculatePoints(playerScores[h], h - 1, 0); // Quota always uses gross
        }
      }
      return total;
    };
  
    // Calculate player totals for leaderboard
    const playerTotals = players.map(player => {
      const playerScores = scores[player.id] || {};
      const playerHcp = player.handicap ?? player.hcp ?? 0;

      let grossTotal = 0;
      let netTotal = 0;
      let holesPlayed = 0;

      holeNumbers.forEach(holeNum => {
        const strokes = playerScores[holeNum];
        if (strokes) {
          grossTotal += strokes;
          const net = getNetScore(strokes, holeNum - 1, playerHcp);
          if (net !== null) netTotal += net;
          holesPlayed++;
        }
      });

      return {
        id: player.id,
        name: player.player_name || player.name,
        grossTotal: holesPlayed > 0 ? grossTotal : null,
        netTotal: holesPlayed > 0 ? netTotal : null,
        holesPlayed
      };
    });

    // Sort by net (if handicaps) or gross
    const sortedPlayers = [...playerTotals].sort((a, b) => {
      const scoreA = useHandicaps ? (a.netTotal ?? 999) : (a.grossTotal ?? 999);
      const scoreB = useHandicaps ? (b.netTotal ?? 999) : (b.grossTotal ?? 999);
      return scoreA - scoreB;
    });

    return (
      <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

        {/* --- Singles Leaderboard --- */}
        <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '15px', borderBottom: '2px solid #2196F3' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>
              🏌️ Singles Leaderboard {useHandicaps ? '(Net)' : '(Gross)'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
            {sortedPlayers.map((player, idx) => {
              const score = useHandicaps ? player.netTotal : player.grossTotal;
              return (
                <div key={player.id} style={{ flex: 1, minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : ''}{player.name}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : '#2196F3' }}>
                    {score ?? '-'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- SCROLLABLE GRID --- */}
        <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
              <tr style={{ backgroundColor: '#252525' }}>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #00BCD4' }}>PLAYER</th>
                {frontHoles.map((hNum) => (
                  <th key={`f-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                      {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum-1]}</span>
                  </th>
                ))}
                {is18 && (
                  <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #00BCD4', borderRight: '3px solid #00BCD4', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                    OUT
                  </th>
                )}
                {backHoles.map((hNum) => (
                  <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                      {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum-1]}</span>
                  </th>
                ))}
                {is18 && (
                  <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #00BCD4', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                    IN
                  </th>
                )}
                <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>
                  TOT
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, globalIdx) => {
                const playerScores = scores[player.id] || {};
                const playerHcp = player.handicap ?? player.hcp ?? 0;
                
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
  
                return (
                  <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                      {player.player_name || player.name}
                      <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                        HCP: {playerHcp}
                      </div>
                    </td>
                    {frontHoles.map((hNum) => {
                      const hIdx = hNum - 1;
                      const strokes = playerScores[hNum];
                      const net = getNetScore(strokes, hIdx, playerHcp);
                      const holeDifficulty = hcds[hIdx];
                      const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                      const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);
  
                      return (
                        <td key={`f-${hNum}`} style={{ 
                          padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                          backgroundColor: hNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                        }}>
                          <GolfScoreTile 
                            id={`score-${hNum}-${globalIdx}`}
                            type="tel"
                            inputMode="numeric"
                            score={playerScores[hNum] || ''}
                            par={pars[hIdx]}
                            hasOneStroke={hasOneStroke}
                            hasTwoStrokes={hasTwoStrokes}
                            onChange={(e) => handleScoreChange(hNum, e.target.value)}
                            style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                          />
                          {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: '#00BCD4', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                        </td>
                      );
                    })}
                    {is18 && (
                      <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #00BCD4', borderRight: '3px solid #00BCD4', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                        {outStrokes > 0 ? outStrokes : '-'}
                      </td>
                    )}
                    {backHoles.map((hNum) => {
                      const hIdx = hNum - 1;
                      const strokes = playerScores[hNum];
                      const net = getNetScore(strokes, hIdx, playerHcp);
                      const holeDifficulty = hcds[hIdx];
                      const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                      const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);
  
                      return (
                        <td key={`b-${hNum}`} style={{ 
                          padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                          backgroundColor: hNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                        }}>
                          <GolfScoreTile 
                            id={`score-${hNum}-${globalIdx}`}
                            type="tel"
                            inputMode="numeric"
                            score={playerScores[hNum] || ''}
                            par={pars[hIdx]}
                            hasOneStroke={hasOneStroke}
                            hasTwoStrokes={hasTwoStrokes}
                            onChange={(e) => handleScoreChange(hNum, e.target.value)}
                            style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                          />
                          {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: '#00BCD4', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                        </td>
                      );
                    })}
                    {is18 && (
                      <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #00BCD4', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                        {inStrokes > 0 ? inStrokes : '-'}
                      </td>
                    )}
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>
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
            onClick={() => { finishRound(matchId); setShowSummary(true); }}
            style={{
              padding: '15px',
              backgroundColor: '#00BCD4',
              color: 'white',
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
      </div>
    );
  }