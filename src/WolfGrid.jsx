import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function WolfGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch }) {
    const [scores, setScores] = useState({});
    const [showSummary, setShowSummary] = useState(false);
    // wolfChoices[holeNum] = { wolf: playerId, partner: playerId | 'lone' | null }
    const [wolfChoices, setWolfChoices] = useState({});
    
    const pars = courseData?.pars || Array(18).fill(4);
    const hcds = courseData?.handicaps || Array(18).fill(10);

    // Wolf rotation: each hole the wolf rotates through the players
    const getWolfIndex = (holeNum) => (holeNum - 1) % players.length;
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

    // Calculate net score for a player on a hole
    const getNetScore = (playerId, holeNum) => {
      const strokes = scores[playerId]?.[holeNum];
      if (!strokes) return null;
      const player = players.find(p => p.id === playerId);
      if (!player) return strokes;
      return calculateNetStrokes(strokes, holeNum - 1, player.handicap ?? player.hcp ?? 0);
    };

    // Calculate Wolf game points for each player across all holes
    const calculateWolfPoints = () => {
      const points = {};
      players.forEach(p => { points[p.id] = 0; });

      for (let hole = 1; hole <= 18; hole++) {
        const choice = wolfChoices[hole];
        if (!choice || !choice.wolf) continue;

        const wolfId = choice.wolf;
        const isLoneWolf = choice.partner === 'lone';
        const partnerId = !isLoneWolf ? choice.partner : null;

        // Get all net scores for this hole
        const holeScores = {};
        let allScored = true;
        players.forEach(p => {
          const ns = getNetScore(p.id, hole);
          if (ns === null) allScored = false;
          holeScores[p.id] = ns;
        });

        if (!allScored) continue;

        if (isLoneWolf) {
          // Lone Wolf: wolf vs all others. Points doubled (2 per opponent beaten)
          const wolfScore = holeScores[wolfId];
          const others = players.filter(p => p.id !== wolfId);
          const bestOther = Math.min(...others.map(p => holeScores[p.id]));

          if (wolfScore < bestOther) {
            // Wolf wins: gets 4 points (doubled since lone wolf)
            points[wolfId] += 4;
          } else if (wolfScore > bestOther) {
            // Others win: each gets 2 points
            others.forEach(p => { points[p.id] += 2; });
          }
          // Tie = no points
        } else if (partnerId) {
          // Wolf + Partner vs Others
          const wolfTeam = [wolfId, partnerId];
          const otherTeam = players.filter(p => !wolfTeam.includes(p.id)).map(p => p.id);

          const bestWolfTeam = Math.min(...wolfTeam.map(id => holeScores[id]));
          const bestOtherTeam = Math.min(...otherTeam.map(id => holeScores[id]));

          if (bestWolfTeam < bestOtherTeam) {
            // Wolf team wins
            wolfTeam.forEach(id => { points[id] += 2; });
          } else if (bestOtherTeam < bestWolfTeam) {
            // Other team wins
            otherTeam.forEach(id => { points[id] += 2; });
          }
          // Tie = no points
        }
      }
      return points;
    };

    const wolfPoints = calculateWolfPoints();

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

  const handleWolfChoice = (holeNum, partnerId) => {
    const wolfPlayer = getWolfPlayer(holeNum);
    setWolfChoices(prev => ({
      ...prev,
      [holeNum]: {
        wolf: wolfPlayer.id,
        partner: partnerId
      }
    }));
  };

  // Check if the current hole has all scores entered (to show partner picker)
  const holeHasScores = (holeNum) => {
    return players.every(p => scores[p.id]?.[holeNum] != null);
  };

  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="wolf"
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

      {/* Partner Selection Panel */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '10px', borderRadius: '8px', marginBottom: '10px', maxHeight: '180px', overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', textAlign: 'center' }}>PARTNER SELECTION</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[...Array(18)].map((_, i) => {
            const holeNum = i + 1;
            const wolfPlayer = getWolfPlayer(holeNum);
            const wolfName = (wolfPlayer.player_name || wolfPlayer.name || '').split(' ')[0];
            const otherPlayers = players.filter(p => p.id !== wolfPlayer.id);
            const choice = wolfChoices[holeNum];
            const hasChoice = choice && choice.partner;

            return (
              <div key={holeNum} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '6px 8px', 
                background: hasChoice ? '#252525' : '#2a2a2a', 
                borderRadius: '6px',
                border: hasChoice ? '1px solid #607D8B' : '1px solid #333'
              }}>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  color: '#607D8B', 
                  minWidth: '20px' 
                }}>
                  #{holeNum}
                </div>
                <div style={{ fontSize: '11px', color: '#ccc', minWidth: '50px' }}>
                  🐺 {wolfName}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flex: 1 }}>
                  {otherPlayers.map(op => {
                    const opName = (op.player_name || op.name || '').split(' ')[0];
                    const isSelected = choice?.partner === op.id;
                    return (
                      <button
                        key={op.id}
                        onClick={() => handleWolfChoice(holeNum, op.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          background: isSelected ? '#607D8B' : '#333',
                          color: isSelected ? '#fff' : '#aaa',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {opName}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleWolfChoice(holeNum, 'lone')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: choice?.partner === 'lone' ? 'bold' : 'normal',
                      background: choice?.partner === 'lone' ? '#FF5722' : '#333',
                      color: choice?.partner === 'lone' ? '#fff' : '#aaa',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Lone 🐺
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: '3px solid #607D8B' }}>PLAYER</th>
              {[...Array(9)].map((_, i) => (
                <th key={`f-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 1}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i]}</span>
                </th>
              ))}
              <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #607D8B', borderRight: '3px solid #607D8B', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              {[...Array(9)].map((_, i) => (
                <th key={`b-${i}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: (i + 10) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 10}<br/><span style={{fontSize: '9px', color: '#666'}}>P{pars[i+9]}</span>
                </th>
              ))}
              <th style={{ padding: '8px', minWidth: '45px', borderLeft: '3px solid #607D8B', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
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
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>HCP: {playerHcp} | Pts: {wolfPoints[player.id] || 0}</div>
                  </td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 1;
                    const isWolf = getWolfIndex(holeNum) === globalIdx;
                    const choice = wolfChoices[holeNum];
                    const isPartner = choice?.partner === player.id;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[i];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[i] + 18);

                    let cellBg = (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                    if (isWolf) cellBg = '#2a2620';
                    if (isPartner) cellBg = '#1a2a20';

                    return (
                      <td key={`f-${i}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px' }}>
                        {isWolf && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', zIndex: 10 }}>🐺</div>}
                        {isPartner && <div style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '8px', zIndex: 10 }}>🤝</div>}
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
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #607D8B', borderRight: '3px solid #607D8B', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{outStrokes || '-'}</td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 10;
                    const realIndex = i + 9;
                    const isWolf = getWolfIndex(holeNum) === globalIdx;
                    const choice = wolfChoices[holeNum];
                    const isPartner = choice?.partner === player.id;
                    const hasOneStroke = useHandicaps && playerHcp >= hcds[realIndex];
                    const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[realIndex] + 18);

                    let cellBg = (i + 10) % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                    if (isWolf) cellBg = '#2a2620';
                    if (isPartner) cellBg = '#1a2a20';

                    return (
                      <td key={`b-${i}`} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px' }}>
                        {isWolf && <div style={{ position: 'absolute', top: '1px', right: '3px', fontSize: '8px', zIndex: 10 }}>🐺</div>}
                        {isPartner && <div style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '8px', zIndex: 10 }}>🤝</div>}
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
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '3px solid #607D8B', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{inStrokes || '-'}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{(outStrokes + inStrokes) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(transparent, #121212 30%)', zIndex: 200 }}>
        <button onClick={() => setShowSummary(true)} style={{ padding: '15px', backgroundColor: '#607D8B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
