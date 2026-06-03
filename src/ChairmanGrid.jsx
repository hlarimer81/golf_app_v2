import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function ChairmanGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch }) {
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

    const channel = supabase.channel('realtime-chairman')
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

  // --- Get players by team name ---
  const getTeamPlayers = (teamName) =>
    players.filter(p => {
      if (p.team === teamName || p.team_name === teamName) return true;
      if (p.teams && p.teams.team_name === teamName) return true;
      return false;
    });

  // --- Active teams and colors ---
  const activeTeams = [...new Set(players.map(p => p.teams?.team_name || p.team || p.team_name).filter(Boolean))];
  const colorPalette = ['#8B4513', '#2196F3', '#9C27B0', '#FF5722', '#FFC107', '#00BCD4'];
  const teamColors = {};
  activeTeams.forEach((t, i) => {
    teamColors[t] = colorPalette[i % colorPalette.length];
  });

  // --- Best net score for a team on a hole ---
  const getTeamBestNet = (teamName, holeIndex) => {
    const holeNum = holeIndex + 1;
    const teamPlayers = getTeamPlayers(teamName);
    const nets = teamPlayers
      .map(p => {
        const strokes = (scores[p.id] || {})[holeNum];
        const hcp = p.handicap ?? p.hcp ?? 0;
        return getNetScore(strokes, holeIndex, hcp);
      })
      .filter(n => n !== null);
    if (nets.length === 0) return null;
    return Math.min(...nets);
  };

  // Calculate Team Chairman game results
  const calculateChairman = () => {
    const chairmanPoints = {}; // { teamName: points }
    activeTeams.forEach(t => { chairmanPoints[t] = 0; });
    
    let currentChairman = null; // Will hold teamName
    const holeResults = []; // Track results for each hole
    
    for (let holeIndex = 0; holeIndex < 18; holeIndex++) {
      const holeScores = [];
      
      // Get best net score for each team
      activeTeams.forEach(team => {
        const bestNet = getTeamBestNet(team, holeIndex);
        if (bestNet !== null) {
          holeScores.push({ team, net: bestNet });
        }
      });
      
      // Need all teams to have a score
      if (holeScores.length !== activeTeams.length) {
        holeResults.push({ status: 'incomplete', chairman: currentChairman });
        continue;
      }
      
      // Find the lowest score(s)
      const minScore = Math.min(...holeScores.map(s => s.net));
      const winners = holeScores.filter(s => s.net === minScore);
      
      if (currentChairman === null) {
        // First hole - need outright winner to become chairman
        if (winners.length === 1) {
          currentChairman = winners[0].team;
          holeResults.push({ 
            status: 'new_chairman', 
            chairman: currentChairman, 
            winnerName: winners[0].team,
            points: 0 // No points for becoming chairman
          });
        } else {
          holeResults.push({ status: 'tie_no_chairman', chairman: null });
        }
      } else {
        // Chairman exists
        const chairmanWon = winners.length === 1 && winners[0].team === currentChairman;
        const chairmanTied = winners.some(w => w.team === currentChairman);
        
        if (chairmanWon) {
          // Chairman wins outright - earns 1 point
          chairmanPoints[currentChairman] += 1;
          holeResults.push({ 
            status: 'chairman_wins', 
            chairman: currentChairman,
            points: 1
          });
        } else if (chairmanTied) {
          // Chairman ties for low - stays chairman, no points
          holeResults.push({ 
            status: 'chairman_ties', 
            chairman: currentChairman,
            points: 0
          });
        } else if (winners.length === 1) {
          // Someone else wins outright - they become new chairman
          currentChairman = winners[0].team;
          holeResults.push({ 
            status: 'new_chairman', 
            chairman: currentChairman,
            winnerName: winners[0].team,
            points: 0
          });
        } else {
          // Multiple non-chairman teams tie for low
          // Chairman loses but no clear winner - chairman stays
          holeResults.push({ 
            status: 'challengers_tie', 
            chairman: currentChairman,
            points: 0
          });
        }
      }
    }
    
    return { chairmanPoints, holeResults, currentChairman };
  };

  const { chairmanPoints, holeResults, currentChairman } = calculateChairman();
  const sortedTeams = [...activeTeams].sort((a, b) => chairmanPoints[b] - chairmanPoints[a]);

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
        gameType="chairman"
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

      {/* --- CHAIRMAN LEADERBOARD (STICKY) --- */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderBottom: '2px solid #8B4513', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', marginBottom: '10px' }}>
          👑 Chairman {useHandicaps ? '(Net)' : '(Gross)'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '8px', textAlign: 'center', flexWrap: 'wrap' }}>
          {sortedTeams.slice(0, 8).map((teamName, idx) => {
            const points = chairmanPoints[teamName] || 0;
            const isChairman = currentChairman === teamName;
            return (
              <div key={teamName} style={{ 
                flex: '1 1 80px',
                minWidth: '70px',
                background: isChairman ? '#8B451333' : idx === 0 && points > 0 ? '#FFD70022' : '#252525', 
                borderRadius: '8px', 
                padding: '8px', 
                border: `2px solid ${isChairman ? '#8B4513' : idx === 0 && points > 0 ? '#FFD700' : '#333'}` 
              }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isChairman ? '👑 ' : ''}{teamName}
                </div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: points > 0 ? '#FFD700' : '#666', marginTop: '2px' }}>
                  {points}
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
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '10px', minWidth: '100px', textAlign: 'left', borderRight: '2px solid #8B4513' }}>PLAYER</th>
              {[...Array(9)].map((_, i) => {
                const result = holeResults[i] || { status: 'incomplete' };
                let headerIcon = `P${pars[i]}`;
                let headerColor = '#666';
                if (result.status === 'chairman_wins') { headerIcon = '👑+1'; headerColor = '#FFD700'; } 
                else if (result.status === 'new_chairman') { headerIcon = '👑↑'; headerColor = '#8B4513'; } 
                else if (result.status === 'chairman_ties' || result.status === 'challengers_tie') { headerIcon = '↔️'; headerColor = '#ff9800'; } 
                else if (result.status === 'tie_no_chairman') { headerIcon = '—'; headerColor = '#666'; }
                return (
                  <th key={`f-${i}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'chairman_wins' ? '#FFD70022' : (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 1}<br /><span style={{ fontSize: '8px', color: headerColor }}>{headerIcon}</span>
                  </th>
                );
              })}
              <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #8B4513', borderRight: '2px solid #8B4513', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>
              {[...Array(9)].map((_, i) => {
                const result = holeResults[i + 9] || { status: 'incomplete' };
                let headerIcon = `P${pars[i+9]}`;
                let headerColor = '#666';
                if (result.status === 'chairman_wins') { headerIcon = '👑+1'; headerColor = '#FFD700'; } 
                else if (result.status === 'new_chairman') { headerIcon = '👑↑'; headerColor = '#8B4513'; } 
                else if (result.status === 'chairman_ties' || result.status === 'challengers_tie') { headerIcon = '↔️'; headerColor = '#ff9800'; } 
                else if (result.status === 'tie_no_chairman') { headerIcon = '—'; headerColor = '#666'; }
                return (
                  <th key={`b-${i}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: result.status === 'chairman_wins' ? '#FFD70022' : (i + 10) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                    {i + 10}<br /><span style={{ fontSize: '8px', color: headerColor }}>{headerIcon}</span>
                  </th>
                );
              })}
              <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #8B4513', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>
              <th style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>TOT</th>
              <th style={{ padding: '6px', minWidth: '50px', borderLeft: '2px solid #8B4513', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>PTS</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const renderedPlayersList = activeTeams.flatMap(t => getTeamPlayers(t));
              return activeTeams.map(teamName => {
                const teamPlayers = getTeamPlayers(teamName);
                const color = teamColors[teamName] || '#8B4513';
                const isCurrentChairman = currentChairman === teamName;

                return (
                  <React.Fragment key={teamName}>
                    <tr>
                      <td colSpan={22} style={{ backgroundColor: color + '22', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', borderTop: `2px solid ${color}55` }}>
                        {isCurrentChairman ? '👑 ' : ''}{teamName}
                      </td>
                      <td style={{ backgroundColor: color + '22', padding: '4px 10px', fontSize: '14px', fontWeight: 'bold', color: '#FFD700', textAlign: 'center', borderTop: `2px solid ${color}55`, borderLeft: '2px solid #8B4513' }}>
                        {chairmanPoints[teamName] || 0}
                      </td>
                    </tr>
                    {teamPlayers.map(player => {
                      const globalIdx = renderedPlayersList.findIndex(p => p.id === player.id);
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
                        <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a', backgroundColor: isCurrentChairman ? '#8B451311' : 'transparent' }}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: isCurrentChairman ? '#1a1a1a' : '#1a1a1a', padding: '8px 10px', fontWeight: 'bold', borderRight: '2px solid #333', whiteSpace: 'nowrap' }}>
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
                            </div>
                          </td>
                          {[...Array(9)].map((_, i) => {
                            const holeNum = i + 1;
                            const strokes = playerScores[holeNum];
                            const net = getNetScore(strokes, i, playerHcp);
                            const par = pars[i];
                            const result = holeResults[i] || { status: 'incomplete' };
                            const wonPoint = result.status === 'chairman_wins' && result.chairman === teamName;
                            const becameChairman = result.status === 'new_chairman' && result.chairman === teamName;
                            
                            const bestTeamNet = getTeamBestNet(teamName, i);
                            const isBestForTeam = net !== null && net === bestTeamNet;

                            const holeDiff = hcds[i];
                            const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                            const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                            return (
                              <td key={`f-${i}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: wonPoint ? '#FFD70033' : becameChairman ? '#8B451322' : (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                                <GolfScoreTile 
                                  id={`score-${holeNum}-${globalIdx}`}
                                  type="tel"
                                  inputMode="numeric"
                                  score={strokes || ''}
                                  par={pars[i]}
                                  hasOneStroke={hasOneStroke}
                                  hasTwoStrokes={hasTwoStrokes}
                                  customBorderColor={isBestForTeam ? color : wonPoint ? '#FFD700' : becameChairman ? '#8B4513' : undefined}
                                  onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                                  style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: isBestForTeam ? color + '33' : wonPoint ? '#FFD70044' : becameChairman ? '#8B451333' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                                />
                                {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                                {wonPoint && isBestForTeam && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>+1</div>}
                                {becameChairman && isBestForTeam && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>👑</div>}
                              </td>
                            );
                          })}
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #8B4513', borderRight: '2px solid #8B4513', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                            {outStrokes > 0 ? outStrokes : '-'}
                          </td>
                          {[...Array(9)].map((_, i) => {
                            const holeNum = i + 10;
                            const realIndex = i + 9;
                            const strokes = playerScores[holeNum];
                            const net = getNetScore(strokes, realIndex, playerHcp);
                            const par = pars[realIndex];
                            const result = holeResults[realIndex] || { status: 'incomplete' };
                            const wonPoint = result.status === 'chairman_wins' && result.chairman === teamName;
                            const becameChairman = result.status === 'new_chairman' && result.chairman === teamName;
                            
                            const bestTeamNet = getTeamBestNet(teamName, realIndex);
                            const isBestForTeam = net !== null && net === bestTeamNet;
                            
                            const holeDiff = hcds[realIndex];
                            const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                            const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                            return (
                              <td key={`b-${i}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: wonPoint ? '#FFD70033' : becameChairman ? '#8B451322' : (i + 10) % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                                <GolfScoreTile 
                                  id={`score-${holeNum}-${globalIdx}`}
                                  type="tel"
                                  inputMode="numeric"
                                  score={strokes || ''}
                                  par={pars[realIndex]}
                                  hasOneStroke={hasOneStroke}
                                  hasTwoStrokes={hasTwoStrokes}
                                  customBorderColor={isBestForTeam ? color : wonPoint ? '#FFD700' : becameChairman ? '#8B4513' : undefined}
                                  onChange={(e) => handleScoreChange(holeNum, e.target.value)}
                                  style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: isBestForTeam ? color + '33' : wonPoint ? '#FFD70044' : becameChairman ? '#8B451333' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                                />
                                {net !== null && useHandicaps && <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>{net}</div>}
                                {wonPoint && isBestForTeam && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>+1</div>}
                                {becameChairman && isBestForTeam && <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '10px', zIndex: 10 }}>👑</div>}
                              </td>
                            );
                          })}
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #8B4513', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                            {inStrokes > 0 ? inStrokes : '-'}
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>
                            {totalStrokes > 0 ? totalStrokes : '-'}
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #8B4513', fontWeight: 'bold', fontSize: '18px', color: '#888' }}>
                            -
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()}
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
            backgroundColor: '#8B4513',
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
