import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function NassauGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
    const [scores, setScores] = useState({});
    const [showSummary, setShowSummary] = useState(false);
    
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
        useQuota={useQuota}
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
    </div>
  );
}
