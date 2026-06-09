import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function VegasGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
    const [scores, setScores] = useState({});
    const [showSummary, setShowSummary] = useState(false);
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);

    // Build dynamic hole list
    const holeNumbers = [];
    for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);
    const is18 = holesCount === 18;
    const frontHoles = is18 ? holeNumbers.slice(0, 9) : holeNumbers;
    const backHoles = is18 ? holeNumbers.slice(9) : [];
  
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

    if (val === null) {
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

  const getVegasPoints = (holeIndex) => {
    const teams = {};
    players.forEach(p => {
      if (!teams[p.team]) teams[p.team] = [];
      const strokes = scores[p.id]?.[holeIndex + 1];
      if (strokes) {
        teams[p.team].push(calculateNetStrokes(strokes, holeIndex, p.handicap || p.hcp));
      }
    });
    
    const teamKeys = Object.keys(teams);
    if (teamKeys.length < 2) return { t1: 0, t2: 0 };
    
    const t1 = teams[teamKeys[0]].slice(0, 2);
    const t2 = teams[teamKeys[1]].slice(0, 2);
    
    if (t1.length < 2 || t1.includes(null) || t2.length < 2 || t2.includes(null)) return { t1: 0, t2: 0 };
    
    const par = pars[holeIndex];
    
    const t1Lo = Math.min(...t1);
    const t1Hi = Math.max(...t1);
    const t2Lo = Math.min(...t2);
    const t2Hi = Math.max(...t2);
    
    const t1Birdie = t1Lo <= par - 1;
    const t2Birdie = t2Lo <= par - 1;
    
    const t1Score = t2Birdie ? (t1Hi * 10 + t1Lo) : (t1Lo * 10 + t1Hi);
    const t2Score = t1Birdie ? (t2Hi * 10 + t2Lo) : (t2Lo * 10 + t2Hi);
    
    if (t1Score < t2Score) return { [teamKeys[0]]: t2Score - t1Score, [teamKeys[1]]: 0, t1Score, t2Score };
    if (t2Score < t1Score) return { [teamKeys[1]]: t1Score - t2Score, [teamKeys[0]]: 0, t1Score, t2Score };
    return { [teamKeys[0]]: 0, [teamKeys[1]]: 0, t1Score, t2Score };
  };

  // Show summary screen
  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="vegas"
        players={players}
        scores={scores}
        useHandicaps={useHandicaps}
        useQuota={useQuota}
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
      
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '15px', borderBottom: '2px solid #E91E63' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
          {[...new Set(players.map(p => p.team).filter(Boolean))].map(tName => {
            let teamTotal = 0;
            for (const holeNum of holeNumbers) {
              const h = holeNum - 1;
              const pts = getVegasPoints(h);
              teamTotal += pts[tName] || 0;
            }

            return (
              <div key={tName} style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>{tName.replace('Team ', '')}</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: '#E91E63' }}>{teamTotal}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #E91E63' }}>PLAYER</th>
              {frontHoles.map((hNum) => (
                <th key={`f-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #E91E63', borderRight: '3px solid #E91E63', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  OUT
                </th>
              )}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {hNum}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #E91E63', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
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
                  {frontHoles.map((holeNum) => {
                    const i = holeNum - 1;
                    const pts = getVegasPoints(i);
                    const isWinningTeam = pts[player.team] > 0;
                    
                    const holeDifficulty = hcds[i];
                    const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                    const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);

                    return (
                      <td key={`f-${holeNum}`} style={{ 
                        padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                        backgroundColor: holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                      }}>
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
                          <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: '#E91E63', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                            +{pts[player.team]}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {is18 && (
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #E91E63', borderRight: '3px solid #E91E63', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
                      {outStrokes > 0 ? outStrokes : '-'}
                    </td>
                  )}
                  {backHoles.map((holeNum) => {
                    const realIndex = holeNum - 1;
                    const pts = getVegasPoints(realIndex);
                    const isWinningTeam = pts[player.team] > 0;
                    
                    const holeDifficulty = hcds[realIndex];
                    const hasOneStroke = useHandicaps && playerHcp >= holeDifficulty;
                    const hasTwoStrokes = useHandicaps && playerHcp >= (holeDifficulty + 18);

                    return (
                      <td key={`b-${holeNum}`} style={{ 
                        padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', 
                        backgroundColor: holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '55px'
                      }}>
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
                          <div style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: '900', color: '#E91E63', background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                            +{pts[player.team]}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {is18 && (
                    <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #E91E63', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>
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
            backgroundColor: '#E91E63',
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
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
