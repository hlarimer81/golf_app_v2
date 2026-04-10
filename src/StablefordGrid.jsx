import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';

export default function StablefordGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData }) {
    const [scores, setScores] = useState({});
    const [showSummary, setShowSummary] = useState(false);
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);
  
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

  // Fetch Scores
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

    const channel = supabase.channel('realtime-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `match_id=eq.${matchId}` }, fetchScores)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [matchId]);

  // Save Score
  const saveScore = async (playerId, holeNum, strokes) => {
    const val = strokes === '' ? null : parseInt(strokes);
    setScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNum]: val }
    }));

    if (val === null) return;
    await supabase.from('scores').upsert(
      {
        match_id: matchId,
        player_id: playerId,
        hole_number: holeNum,
        strokes: val
      },
      { onConflict: 'match_id,player_id,hole_number' }
    );
  };

  // Calculate total points for a player up to a certain hole
  const getPlayerPointsUpToHole = (playerId, upToHole, playerHcp) => {
    const playerScores = scores[playerId] || {};
    let total = 0;
    for (let h = 1; h <= upToHole; h++) {
      if (playerScores[h]) {
        total += calculatePoints(playerScores[h], h - 1, playerHcp);
      }
    }
    return total;
  };

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
        onBack={() => setShowSummary(false)}
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
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
          {['Team A', 'Team B', 'Team C', 'Team D'].map(tName => {
            const teamPlayers = players.filter(p => {
              if (p.team === tName || p.team_name === tName || p.team_id_name === tName) return true;
              if (p.teams && p.teams.team_name === tName) return true;
              return false;
            });

            if (teamPlayers.length === 0) return null;

            const teamTotal = teamPlayers.reduce((tSum, p) => {
              const pScores = scores[p.id] || {};
              const playerHcp = p.handicap ?? p.hcp ?? 0;
              
              const pTotalPoints = Object.keys(pScores).reduce((sSum, hNum) => 
                sSum + calculatePoints(pScores[hNum], hNum - 1, playerHcp), 0
              );
              return tSum + pTotalPoints;
            }, 0);

            return (
              <div key={tName} style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>{tName.replace('Team ', '')}</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: '#4CAF50' }}>{teamTotal}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- THE SCROLLABLE GRID --- */}
      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #4CAF50' }}>PLAYER</th>
              {[...Array(18)].map((_, i) => (
                <th key={i} style={{ padding: '8px', minWidth: '45px', borderLeft: i === 9 ? '3px solid #4CAF50' : '1px solid #333', backgroundColor: (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 1}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const playerScores = scores[player.id] || {};
              const playerHcp = player.handicap ?? player.hcp ?? 0;
              
              // Quota calculation: goal = 36 - handicap
              const quotaGoal = 36 - playerHcp;

              return (
                <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                      HCP: {playerHcp}
                      {useQuota && (() => {
                        const totalPoints = getPlayerPointsUpToHole(player.id, 18, playerHcp);
                        const remaining = quotaGoal - totalPoints;
                        return (
                          <span style={{ marginLeft: '6px', color: remaining <= 0 ? '#4CAF50' : '#ff9800', fontWeight: 'bold' }}>
                            Q: {remaining <= 0 ? `+${Math.abs(remaining)}` : remaining}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  {[...Array(18)].map((_, i) => {
                    const holeNum = i + 1;
                    const pts = calculatePoints(playerScores[holeNum], i, playerHcp);
                    
                    // Stroke dot logic
                    const holeDifficulty = hcds[i];
                    const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                    const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);

                    // Quota remaining: goal minus points earned so far
                    const pointsSoFar = getPlayerPointsUpToHole(player.id, holeNum, playerHcp);
                    const quotaRemaining = quotaGoal - pointsSoFar;

                    return (
                      <td key={i} style={{ 
                        padding: '4px', 
                        textAlign: 'center', 
                        borderLeft: i === 9 ? '3px solid #4CAF50' : '1px solid #2a2a2a', 
                        backgroundColor: (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e',
                        position: 'relative', 
                        minWidth: '55px'
                      }}>
                        {/* --- STROKE DOTS (Top Left) --- */}
                        <div style={{ 
                          position: 'absolute', 
                          top: '3px', 
                          left: '4px', 
                          display: 'flex', 
                          gap: '2px' 
                        }}>
                          {hasOneStroke && (
                            <div style={{ width: '5px', height: '5px', backgroundColor: '#4CAF50', borderRadius: '50%' }} />
                          )}
                          {hasTwoStrokes && (
                            <div style={{ width: '5px', height: '5px', backgroundColor: '#4CAF50', borderRadius: '50%' }} />
                          )}
                        </div>

                        {/* THE SCORE INPUT */}
                        <input 
                          type="tel" inputMode="numeric" 
                          value={playerScores[holeNum] || ''} 
                          onChange={(e) => saveScore(player.id, holeNum, e.target.value)}
                          style={{ 
                            width: '38px', height: '38px', textAlign: 'center', 
                            backgroundColor: '#2a2a2a', color: '#fff', 
                            border: '1px solid #444', borderRadius: '4px', fontSize: '18px',
                            outline: 'none'
                          }}
                        />

                        {/* THE STABLEFORD POINTS (Top Right) */}
                        {playerScores[holeNum] > 0 && (
                          <div style={{ 
                            position: 'absolute', 
                            top: '2px', 
                            right: '4px', 
                            fontSize: '10px', 
                            fontWeight: '900',
                            color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800',
                            background: 'rgba(0,0,0,0.4)',
                            padding: '0 2px',
                            borderRadius: '2px'
                          }}>
                            {pts}
                          </div>
                        )}

                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- FINISH MATCH BUTTON --- */}
      <button
        onClick={() => setShowSummary(true)}
        style={{
          flexShrink: 0,
          marginTop: '10px',
          padding: '15px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          width: '100%'
        }}
      >
        🏁 Finish Match
      </button>
    </div>
  );
}
