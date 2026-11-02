import React, { useState } from 'react';
import { finishRound } from './lib/handicap';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';
import { useScores } from './hooks/useScores';
import { focusNextScore } from './lib/scoreEntry';
import { useWolfState } from './useWolfState';
import { wolfIndex, wolfPoints as calcWolfPoints } from './lib/wolf';

export default function WolfGrid({ matchId, matchName, matchCode, players, useHandicaps, courseData, onNewMatch, onRoundFinished, holesCount = 18, startHole = 1, initialShowSummary = false }) {
    const { scores, saveScore } = useScores(matchId);
    const [showSummary, setShowSummary] = useState(initialShowSummary);
    const [isBanked, setIsBanked] = useState(initialShowSummary);
    // decisions[holeNum] = partnerPlayerId | 'lone', saved to matches.wolf so every view sees them
    const { decisions, setDecision } = useWolfState(matchId);
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);

    // Build dynamic hole list
    const holeNumbers = [];
    for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);
    const is18 = holesCount === 18;
    const frontHoles = is18 ? holeNumbers.slice(0, 9) : holeNumbers;
    const backHoles = is18 ? holeNumbers.slice(9) : [];

    const getWolfIndex = (holeNum) => wolfIndex(holeNumbers, holeNum, players.length);
    const getWolfPlayer = (holeNum) => players[getWolfIndex(holeNum)];

    const wolfPoints = calcWolfPoints({ players, scores, decisions, holeNumbers, hcds, useHandicaps });


  const handleWolfChoice = (holeNum, partnerId) => setDecision(holeNum, partnerId);

  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="wolf"
        wolfDecisions={decisions}
        players={players}
        scores={scores}
        useHandicaps={useHandicaps}
        
        courseData={courseData}
        holesCount={holesCount}
        startHole={startHole}
        onBack={isBanked ? undefined : () => setShowSummary(false)}
        onNewMatch={onNewMatch}
      />
    );
  }

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>
      
      {/* Wolf Points Summary */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '10px', borderBottom: '2px solid #607D8B' }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '2px' }}>🐺 WOLF POINTS</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {players.map(p => (
            <div key={p.id} style={{ textAlign: 'center', minWidth: '60px' }}>
              <div style={{ fontSize: '11px', color: '#aaa' }}>{(p.player_name || p.name || '').split(' ')[0]}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#607D8B' }}>{wolfPoints[p.id] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Partner Selection Panel - only show next unscored hole */}
      {(() => {
        // Find the first played hole without a wolf choice
        let nextHole = null;
        for (const h of holeNumbers) {
          if (!decisions[h]) {
            nextHole = h;
            break;
          }
        }
        if (nextHole === null) return null;

        const wolfPlayer = getWolfPlayer(nextHole);
        const wolfName = (wolfPlayer.player_name || wolfPlayer.name || '').split(' ')[0];
        const otherPlayers = players.filter(p => p.id !== wolfPlayer.id);
        const choice = decisions[nextHole];

        return (
          <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '12px', borderRadius: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '1px', textAlign: 'center' }}>
              HOLE {nextHole} — 🐺 {wolfName} IS THE WOLF
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {otherPlayers.map(op => {
                const opName = (op.player_name || op.name || '').split(' ')[0];
                const isSelected = choice === op.id;
                return (
                  <button
                    key={op.id}
                    onClick={() => handleWolfChoice(nextHole, op.id)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      background: isSelected ? '#607D8B' : '#333',
                      color: isSelected ? '#fff' : '#aaa',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {opName}
                  </button>
                );
              })}
              <button
                onClick={() => handleWolfChoice(nextHole, 'lone')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: choice === 'lone' ? 'bold' : 'normal',
                  background: choice === 'lone' ? '#FF5722' : '#333',
                  color: choice === 'lone' ? '#fff' : '#aaa',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Lone 🐺
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #607D8B' }}>PLAYER</th>
              {frontHoles.map((hNum) => (
                <th key={`f-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #607D8B', borderRight: '3px solid #607D8B', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              )}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #607D8B', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
              )}
              <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, globalIdx) => {
              const playerScores = scores[player.id] || {};
              const playerHcp = player.handicap ?? player.hcp ?? 0;
              
              let outStrokes = 0; let inStrokes = 0;
              frontHoles.forEach(h => { if (playerScores[h]) outStrokes += playerScores[h]; });
              backHoles.forEach(h => { if (playerScores[h]) inStrokes += playerScores[h]; });

              const handleScoreChange = (holeNum, val) => {
                saveScore(player.id, holeNum, val);
                if (val.length === 1) {
                  const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                  focusNextScore(nextInput);
                }
              };

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 20, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{useHandicaps && `HCP: ${playerHcp} | `}Pts: {wolfPoints[player.id] || 0}</div>
                  </td>
                  {frontHoles.map((holeNum) => {
                    const i = holeNum - 1;
                    const isWolf = getWolfIndex(holeNum) === globalIdx;
                    const isPartner = decisions[holeNum] === player.id;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[i];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[i] + 18);

                    let cellBg = holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                    if (isWolf) cellBg = '#2a2620';
                    if (isPartner) cellBg = '#1a2a20';

                    return (
                      <td key={`f-${holeNum}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px', overflow: 'hidden' }}>
                        <GolfScoreTile
                          id={`score-${holeNum}-${globalIdx}`}
                          type="tel"
                          inputMode="numeric"
                          score={playerScores[holeNum] || ''}
                          par={pars[i]}
                          hasOneStroke={hasOneStroke}
                          hasTwoStrokes={hasTwoStrokes}
                          wolfTurn={isWolf}
                          partnerTurn={isPartner}
                          onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                          style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                        />
                      </td>
                    );
                  })}
                  {is18 && (
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #607D8B', borderRight: '3px solid #607D8B', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{outStrokes || '-'}</td>
                  )}
                  {backHoles.map((holeNum) => {
                    const realIndex = holeNum - 1;
                    const isWolf = getWolfIndex(holeNum) === globalIdx;
                    const isPartner = decisions[holeNum] === player.id;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[realIndex];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[realIndex] + 18);

                    let cellBg = holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                    if (isWolf) cellBg = '#2a2620';
                    if (isPartner) cellBg = '#1a2a20';

                    return (
                      <td key={`b-${holeNum}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px', overflow: 'hidden' }}>
                        <GolfScoreTile
                          id={`score-${holeNum}-${globalIdx}`}
                          type="tel"
                          inputMode="numeric"
                          score={playerScores[holeNum] || ''}
                          par={pars[realIndex]}
                          hasOneStroke={hasOneStroke}
                          hasTwoStrokes={hasTwoStrokes}
                          wolfTurn={isWolf}
                          partnerTurn={isPartner}
                          onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                          style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                        />
                      </td>
                    );
                  })}
                  {is18 && (
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #607D8B', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{inStrokes || '-'}</td>
                  )}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{(outStrokes + inStrokes) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(transparent, #121212 30%)', zIndex: 200 }}>
        <button onClick={() => { finishRound(matchId); setIsBanked(true); setShowSummary(true); onRoundFinished?.(); }} style={{ padding: '15px', backgroundColor: '#607D8B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
