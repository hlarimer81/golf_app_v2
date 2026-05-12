import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';

export default function SinglesGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch }) {
    const [scores, setScores] = useState({});
    const [showSummary, setShowSummary] = useState(false);
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);
  
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
  
      const channel = supabase.channel('realtime-scores-singles')
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
  
      if (val === null) {
        // Delete the score from database
        await supabase.from('scores')
          .delete()
          .eq('match_id', matchId)
          .eq('player_id', playerId)
          .eq('hole_number', holeNum);
        return;
      }
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
          useQuota={useQuota}
          courseData={courseData}
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
  
    return (
      <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>
        
        {/* --- SCROLLABLE GRID --- */}
        <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
              <tr style={{ backgroundColor: '#252525' }}>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #00BCD4' }}>PLAYER</th>
                {[...Array(9)].map((_, i) => (
                  <th key={`f-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                      {i + 1}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i]}</span>
                  </th>
                ))}
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #00BCD4', borderRight: '3px solid #00BCD4', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  OUT
                </th>
                {[...Array(9)].map((_, i) => (
                  <th key={`b-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 10) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                      {i + 10}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i+9]}</span>
                  </th>
                ))}
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #00BCD4', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  IN
                </th>
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
                for (let h = 1; h <= 9; h++) if (playerScores[h]) outStrokes += playerScores[h];
                for (let h = 10; h <= 18; h++) if (playerScores[h]) inStrokes += playerScores[h];
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
                        {useQuota && (() => {
                          const quotaGoal = 36 - playerHcp;
                          const totalPoints = getPlayerPointsUpToHole(player.id, 18, playerHcp);
                          const remaining = quotaGoal - totalPoints;
                          return (
                            <span style={{ marginLeft: '6px', color: remaining <= 0 ? '#00BCD4' : '#ff9800', fontWeight: 'bold' }}>
                              Q: {remaining <= 0 ? `+${Math.abs(remaining)}` : remaining}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    {[...Array(9)].map((_, i) => {
                      const holeNum = i + 1;
                      const strokes = playerScores[holeNum];
                      const net = getNetScore(strokes, i, playerHcp);
                      const holeDifficulty = hcds[i];
                      const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                      const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);
  
                      return (
                        <td key={`f-${i}`} style={{ 
                          padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                          backgroundColor: (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                        }}>
                          <div style={{ position: 'absolute', top: '3px', left: '4px', display: 'flex', gap: '2px' }}>
                            {hasOneStroke && <div style={{ width: '5px', height: '5px', backgroundColor: '#00BCD4', borderRadius: '50%' }} />}
                            {hasTwoStrokes && <div style={{ width: '5px', height: '5px', backgroundColor: '#00BCD4', borderRadius: '50%' }} />}
                          </div>
                          <input id={`score-${holeNum}-${globalIdx}`} type="tel" inputMode="numeric" value={playerScores[holeNum] || ''} onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                            style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', fontSize: '18px', outline: 'none' }} />
                          {net !== null && useHandicaps && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: '#00BCD4', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px' }}>{net}</div>}
                          {useQuota && playerScores[holeNum] > 0 && (
                            <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '700', color: calculatePoints(playerScores[holeNum], i, playerHcp) >= 3 ? '#00BCD4' : calculatePoints(playerScores[holeNum], i, playerHcp) === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.5)', padding: '0 3px', borderRadius: '2px' }}>
                              {calculatePoints(playerScores[holeNum], i, 0)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #00BCD4', borderRight: '3px solid #00BCD4', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                      {outStrokes > 0 ? outStrokes : '-'}
                    </td>
                    {[...Array(9)].map((_, i) => {
                      const holeNum = i + 10;
                      const realIndex = i + 9;
                      const strokes = playerScores[holeNum];
                      const net = getNetScore(strokes, realIndex, playerHcp);
                      const holeDifficulty = hcds[realIndex];
                      const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                      const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);
  
                      return (
                        <td key={`b-${i}`} style={{ 
                          padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                          backgroundColor: (i + 10) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                        }}>
                          <div style={{ position: 'absolute', top: '3px', left: '4px', display: 'flex', gap: '2px' }}>
                            {hasOneStroke && <div style={{ width: '5px', height: '5px', backgroundColor: '#00BCD4', borderRadius: '50%' }} />}
                            {hasTwoStrokes && <div style={{ width: '5px', height: '5px', backgroundColor: '#00BCD4', borderRadius: '50%' }} />}
                          </div>
                          <input id={`score-${holeNum}-${globalIdx}`} type="tel" inputMode="numeric" value={playerScores[holeNum] || ''} onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                            style={{ width: '38px', height: '38px', textAlign: 'center', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', fontSize: '18px', outline: 'none' }} />
                          {net !== null && useHandicaps && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: '#00BCD4', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px' }}>{net}</div>}
                          {useQuota && playerScores[holeNum] > 0 && (
                            <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '700', color: calculatePoints(playerScores[holeNum], realIndex, playerHcp) >= 3 ? '#00BCD4' : calculatePoints(playerScores[holeNum], realIndex, playerHcp) === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.5)', padding: '0 3px', borderRadius: '2px' }}>
                              {calculatePoints(playerScores[holeNum], realIndex, 0)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #00BCD4', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                      {inStrokes > 0 ? inStrokes : '-'}
                    </td>
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
            onClick={() => setShowSummary(true)}
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