import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function SkinsGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, useCarryover, courseData, onNewMatch }) {
  const [scores, setScores] = useState({});
  const [showSummary, setShowSummary] = useState(false);

  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

  // Fetch & Realtime
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

    const channel = supabase.channel('realtime-skins')
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

  // Get net score for a player on a hole
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

  // Calculate Stableford points for quota
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

  // Get player points up to a hole (for quota)
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

  // Calculate skins for each hole
  const calculateSkins = () => {
    const skins = {}; // { playerId: skinCount }
    players.forEach(p => { skins[p.id] = 0; });
    
    let carryover = 0;
    
    for (let holeIndex = 0; holeIndex < 18; holeIndex++) {
      const holeNum = holeIndex + 1;
      const holeScores = [];
      
      // Get all net scores for this hole
      players.forEach(player => {
        const strokes = (scores[player.id] || {})[holeNum];
        const hcp = player.handicap ?? player.hcp ?? 0;
        const net = getNetScore(strokes, holeIndex, hcp);
        if (net !== null) {
          holeScores.push({ playerId: player.id, net });
        }
      });
      
      // Need all players to have a score
      if (holeScores.length !== players.length) continue;
      
      // Find the lowest score
      const minScore = Math.min(...holeScores.map(s => s.net));
      const winners = holeScores.filter(s => s.net === minScore);
      
      if (winners.length === 1) {
        // Single winner - gets the skin plus any carryover
        skins[winners[0].playerId] += 1 + carryover;
        carryover = 0;
      } else if (useCarryover) {
        // Tie - carryover to next hole
        carryover += 1;
      }
      // If no carryover and tie, no one wins the skin
    }
    
    return skins;
  };

  // Get skin result for a specific hole
  const getHoleSkinResult = (holeIndex) => {
    const holeNum = holeIndex + 1;
    const holeScores = [];
    
    players.forEach(player => {
      const strokes = (scores[player.id] || {})[holeNum];
      const hcp = player.handicap ?? player.hcp ?? 0;
      const net = getNetScore(strokes, holeIndex, hcp);
      if (net !== null) {
        holeScores.push({ playerId: player.id, playerName: player.player_name || player.name, net });
      }
    });
    
    if (holeScores.length !== players.length) return { status: 'incomplete' };
    
    const minScore = Math.min(...holeScores.map(s => s.net));
    const winners = holeScores.filter(s => s.net === minScore);
    
    if (winners.length === 1) {
      return { status: 'won', winner: winners[0].playerName, playerId: winners[0].playerId };
    }
    return { status: 'push' };
  };

  const skinTotals = calculateSkins();
  const sortedPlayers = [...players].sort((a, b) => (skinTotals[b.id] || 0) - (skinTotals[a.id] || 0));

  const scoreColor = (net, par) => {
    if (net === null) return '#fff';
    const diff = net - par;
    if (diff <= -2) return '#FFD700';
    if (diff === -1) return '#4CAF50';
    if (diff === 0) return '#fff';
    if (diff === 1) return '#ff9800';
    return '#f44336';
  };

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
        useQuota={useQuota}
        courseData={courseData}
        onBack={() => setShowSummary(false)}
        onNewMatch={onNewMatch}
      />
    );
  }

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* --- SKINS LEADERBOARD (STICKY) --- */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderBottom: '2px solid #FFD700', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', marginBottom: '10px' }}>
          🎰 Skins {useCarryover ? '(Carryover)' : '(No Carryover)'}
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
              {[...Array(9)].map((_, i) => {
                const result = getHoleSkinResult(i);
                return (
                  <th key={`f-${i}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'won' ? '#FFD70022' : result.status === 'push' ? '#ff980022' : (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 1}<br /><span style={{ fontSize: '8px', color: result.status === 'won' ? '#FFD700' : result.status === 'push' ? '#ff9800' : '#666' }}>{result.status === 'won' ? '🏆' : result.status === 'push' ? '↔️' : `P${pars[i]}`}</span>
                  </th>
                );
              })}
              <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #FFD700', borderRight: '2px solid #FFD700', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              {[...Array(9)].map((_, i) => {
                const result = getHoleSkinResult(i + 9);
                return (
                  <th key={`b-${i}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'won' ? '#FFD70022' : result.status === 'push' ? '#ff980022' : (i + 10) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 10}<br /><span style={{ fontSize: '8px', color: result.status === 'won' ? '#FFD700' : result.status === 'push' ? '#ff9800' : '#666' }}>{result.status === 'won' ? '🏆' : result.status === 'push' ? '↔️' : `P${pars[i+9]}`}</span>
                  </th>
                );
              })}
              <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #FFD700', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
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
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '8px 10px', fontWeight: 'bold', borderRight: '2px solid #333', whiteSpace: 'nowrap' }}>
                    {player.player_name || player.name}
                    <div style={{ fontSize: '8px', color: '#666', fontWeight: 'normal' }}>
                      {useHandicaps && `HCP: ${playerHcp}`}
                      {useQuota && (() => {
                        const totalPoints = getPlayerPointsUpToHole(player.id, 18, playerHcp);
                        const remaining = quotaGoal - totalPoints;
                        return (
                          <span style={{ marginLeft: '6px', color: remaining <= 0 ? '#4CAF50' : '#ff9800', fontWeight: 'bold' }}>
                            Q: {remaining <= 0 ? `+${Math.abs(remaining)}` : remaining}
                          </span>
                        );
                      })()}
                      <span style={{ marginLeft: '6px', color: '#FFD700', fontWeight: 'bold' }}>
                        🎰 {skinTotals[player.id] || 0}
                      </span>
                    </div>
                  </td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 1;
                    const strokes = playerScores[holeNum];
                    const net = getNetScore(strokes, i, playerHcp);
                    const par = pars[i];
                    const result = getHoleSkinResult(i);
                    const isWinner = result.status === 'won' && result.playerId === player.id;
                    const holeDiff = hcds[i];
                    const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                    const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                    return (
                      <td key={`f-${i}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: isWinner ? '#FFD70033' : (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                        <GolfScoreTile 
                          id={`score-${holeNum}-${globalIdx}`}
                          type="tel"
                          inputMode="numeric"
                          score={strokes || ''}
                          par={pars[i]}
                          hasOneStroke={hasOneStroke}
                          hasTwoStrokes={hasTwoStrokes}
                          customBorderColor={isWinner ? '#FFD700' : undefined}
                          onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                          style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: isWinner ? '#FFD70044' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                        />
                        {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                        {isWinner && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>🏆</div>}
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #FFD700', borderRight: '2px solid #FFD700', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                    {outStrokes > 0 ? outStrokes : '-'}
                  </td>
                  {[...Array(9)].map((_, i) => {
                    const holeNum = i + 10;
                    const realIndex = i + 9;
                    const strokes = playerScores[holeNum];
                    const net = getNetScore(strokes, realIndex, playerHcp);
                    const par = pars[realIndex];
                    const result = getHoleSkinResult(realIndex);
                    const isWinner = result.status === 'won' && result.playerId === player.id;
                    const holeDiff = hcds[realIndex];
                    const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                    const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                    return (
                      <td key={`b-${i}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: isWinner ? '#FFD70033' : (i + 10) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                        <GolfScoreTile 
                          id={`score-${holeNum}-${globalIdx}`}
                          type="tel"
                          inputMode="numeric"
                          score={strokes || ''}
                          par={pars[realIndex]}
                          hasOneStroke={hasOneStroke}
                          hasTwoStrokes={hasTwoStrokes}
                          customBorderColor={isWinner ? '#FFD700' : undefined}
                          onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                          style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: isWinner ? '#FFD70044' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                        />
                        {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                        {isWinner && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>🏆</div>}
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #FFD700', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                    {inStrokes > 0 ? inStrokes : '-'}
                  </td>
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
    </div>
  );
}
