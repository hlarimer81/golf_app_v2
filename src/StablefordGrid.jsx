import React from 'react';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';
import { useScores } from './hooks/useScores';
import {
  PAR_FALLBACK,
  HCP_FALLBACK,
  stablefordPoints,
  strokesReceived,
  pointsUpToHole,
  holeLayout,
} from './lib/golf';
import { activeTeams as getActiveTeams, getTeamPlayers as teamPlayersOf, teamColorMap } from './lib/teams';

export default function StablefordGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch, initialIsTeamPlay = true, holesCount = 18, startHole = 1 }) {
    const [showSummary, setShowSummary] = React.useState(false);
    const { scores, saveScore } = useScores(matchId);

    const pars = courseData?.pars || PAR_FALLBACK;
    const hcds = courseData?.handicaps || HCP_FALLBACK;

    const { holeNumbers, is18, frontHoles, backHoles } = holeLayout(holesCount, startHole);

    const activeTeams = getActiveTeams(players);
    const hasTeams = activeTeams.length > 0;
    const isTeamPlay = initialIsTeamPlay && hasTeams;
    const teamColors = teamColorMap(activeTeams);

    const getTeamPlayers = (teamName) => teamPlayersOf(players, teamName);

    const calcPoints = (strokes, holeIndex, playerHandicap) =>
      stablefordPoints(strokes, holeIndex, playerHandicap, pars, hcds, useHandicaps);

    const getPlayerPointsUpToHole = (playerId) =>
      pointsUpToHole(scores[playerId] || {}, holeNumbers[holeNumbers.length - 1] || 18, pars, hcds);

  // Show summary screen
  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="stableford"
        players={players}
        scores={scores}
        useHandicaps={useHandicaps}
        useQuota={useQuota}
        courseData={courseData}
        stablefordMode={isTeamPlay ? 'team' : 'singles'}
        holesCount={holesCount}
        startHole={startHole}
        onBack={() => setShowSummary(false)}
        onNewMatch={onNewMatch}
      />
    );
  }

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>
      
      {/* --- PINNED LEADERBOARD HEADER --- */}
      <div style={{ 
        flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '15px', borderBottom: '2px solid #4CAF50' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>
            🏆 Stableford Leaderboard {isTeamPlay ? '(Teams)' : '(Singles)'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center', overflowX: 'auto', paddingBottom: '5px' }}>
          {isTeamPlay ? (
            activeTeams.map(tName => {
              const teamPlayers = getTeamPlayers(tName);
              if (teamPlayers.length === 0) return null;

              const teamTotal = teamPlayers.reduce((tSum, p) => {
                const pScores = scores[p.id] || {};
                const playerHcp = p.handicap ?? p.hcp ?? 0;
                const pTotalPoints = Object.keys(pScores).reduce((sSum, hNum) => 
                  sSum + calcPoints(pScores[hNum], hNum - 1, playerHcp), 0
                );
                return tSum + pTotalPoints;
              }, 0);

              return (
                <div key={tName} style={{ flex: 1, minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tName.replace('Team ', '')}</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#4CAF50' }}>{teamTotal}</div>
                </div>
              );
            })
          ) : (
            players.map(p => {
              const pScores = scores[p.id] || {};
              const playerHcp = p.handicap ?? p.hcp ?? 0;
              const pTotalPoints = Object.keys(pScores).reduce((sSum, hNum) => 
                sSum + calcPoints(pScores[hNum], hNum - 1, playerHcp), 0
              );
              return (
                <div key={p.id} style={{ flex: 1, minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.player_name || p.name}</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#4CAF50' }}>{pTotalPoints}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* --- THE SCROLLABLE GRID --- */}
      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #4CAF50' }}>PLAYER</th>
              {frontHoles.map((hNum, i) => (
                <th key={`f-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum-1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #4CAF50', borderRight: '3px solid #4CAF50', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  OUT
                </th>
              )}
              {backHoles.map((hNum, i) => (
                <th key={`b-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum-1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #4CAF50', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  IN
                </th>
              )}
              <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>
                TOT
              </th>
            </tr>
          </thead>
          <tbody>
            {isTeamPlay ? (
              activeTeams.map(teamName => {
                const teamPlayers = getTeamPlayers(teamName);
                const color = teamColors[teamName] || '#4CAF50';
                
                return (
                  <React.Fragment key={teamName}>
                    <tr>
                      <td colSpan={23} style={{ backgroundColor: color + '22', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', borderTop: `2px solid ${color}55` }}>
                        {teamName}
                      </td>
                    </tr>
                    {teamPlayers.map(player => {
                      const globalIdx = players.findIndex(p => p.id === player.id);
                      const playerScores = scores[player.id] || {};
                      const playerHcp = player.handicap ?? player.hcp ?? 0;
                      const quotaGoal = 36 - playerHcp;

                      let frontStrokes = 0;
                      let backStrokes = 0;
                      frontHoles.forEach(h => { if (playerScores[h]) frontStrokes += playerScores[h]; });
                      backHoles.forEach(h => { if (playerScores[h]) backStrokes += playerScores[h]; });
                      const totalStrokes = frontStrokes + backStrokes;

                      const handleScoreChange = (holeNum, val) => {
                        saveScore(player.id, holeNum, val);
                        if (val.length === 1) {
                          const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                          if (nextInput) setTimeout(() => nextInput.focus(), 10);
                        }
                      };

                      const renderCell = (holeNum) => {
                        const hIdx = holeNum - 1;
                        const pts = calcPoints(playerScores[holeNum], hIdx, playerHcp);
                        const received = strokesReceived(playerHcp, hIdx, hcds, useHandicaps);
                        return (
                          <td key={`c-${holeNum}`} style={{ 
                            padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                            backgroundColor: holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                          }}>
                            <GolfScoreTile 
                              id={`score-${holeNum}-${globalIdx}`}
                              type="tel"
                              inputMode="numeric"
                              score={playerScores[holeNum] || ''}
                              par={pars[hIdx]}
                              hasOneStroke={received >= 1}
                              hasTwoStrokes={received >= 2}
                              onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                              style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                            />
                            {playerScores[holeNum] > 0 && (
                              <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                                {pts}
                              </div>
                            )}
                          </td>
                        );
                      };

                      return (
                        <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                            {player.player_name || player.name}
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                              HCP: {playerHcp}
                              {useQuota && (() => {
                                const totalPoints = getPlayerPointsUpToHole(player.id);
                                const remaining = quotaGoal - totalPoints;
                                return (
                                  <span style={{ marginLeft: '6px', color: remaining <= 0 ? '#4CAF50' : '#ff9800', fontWeight: 'bold' }}>
                                    Q: {remaining <= 0 ? `+${Math.abs(remaining)}` : remaining}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          {frontHoles.map(renderCell)}
                          {is18 && (
                            <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #4CAF50', borderRight: '3px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                              {frontStrokes > 0 ? frontStrokes : '-'}
                            </td>
                          )}
                          {backHoles.map(renderCell)}
                          {is18 && (
                            <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                              {backStrokes > 0 ? backStrokes : '-'}
                            </td>
                          )}
                          <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>
                            {totalStrokes > 0 ? totalStrokes : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              players.map((player, globalIdx) => {
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

                const renderCell = (holeNum) => {
                  const hIdx = holeNum - 1;
                  const pts = calcPoints(playerScores[holeNum], hIdx, playerHcp);
                  const received = strokesReceived(playerHcp, hIdx, hcds, useHandicaps);
                  return (
                    <td key={`c-${holeNum}`} style={{ 
                      padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                      backgroundColor: holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                    }}>
                      <GolfScoreTile 
                        id={`score-${holeNum}-${globalIdx}`}
                        type="tel"
                        inputMode="numeric"
                        score={playerScores[holeNum] || ''}
                        par={pars[hIdx]}
                        hasOneStroke={received >= 1}
                        hasTwoStrokes={received >= 2}
                        onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                        style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '18px', outline: 'none' }}
                      />
                      {playerScores[holeNum] > 0 && (
                        <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                          {pts}
                        </div>
                      )}
                    </td>
                  );
                };

                return (
                  <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                      {player.player_name || player.name}
                      <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                        HCP: {playerHcp}
                        {useQuota && (() => {
                          const totalPoints = getPlayerPointsUpToHole(player.id);
                          const remaining = quotaGoal - totalPoints;
                          return (
                            <span style={{ marginLeft: '6px', color: remaining <= 0 ? '#4CAF50' : '#ff9800', fontWeight: 'bold' }}>
                              Q: {remaining <= 0 ? `+${Math.abs(remaining)}` : remaining}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    {frontHoles.map(renderCell)}
                    {is18 && (
                      <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #4CAF50', borderRight: '3px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                        {outStrokes > 0 ? outStrokes : '-'}
                      </td>
                    )}
                    {backHoles.map(renderCell)}
                    {is18 && (
                      <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                        {inStrokes > 0 ? inStrokes : '-'}
                      </td>
                    )}
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>
                      {totalStrokes > 0 ? totalStrokes : '-'}
                    </td>
                  </tr>
                );
              })
            )}
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
            backgroundColor: '#4CAF50',
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
