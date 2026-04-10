import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FourBallGrid({ matchId, players, useHandicaps, useQuota, courseData }) {
  const [scores, setScores] = useState({});

  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

  // --- Fetch & Realtime ---
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

    const channel = supabase.channel('realtime-fourball')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `match_id=eq.${matchId}` }, fetchScores)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [matchId]);

  // --- Save Score ---
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

  // --- Net score for a player on a hole ---
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

  // --- Calculate Stableford points for quota ---
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

  // --- Get player points up to a hole ---
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

  // --- Get players by team name ---
  const getTeamPlayers = (teamName) =>
    players.filter(p => {
      if (p.team === teamName || p.team_name === teamName) return true;
      if (p.teams && p.teams.team_name === teamName) return true;
      return false;
    });

  // --- Best net score for a team on a hole ---
  const getBestNet = (teamPlayers, holeIndex) => {
    const holeNum = holeIndex + 1;
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

  // --- Hole result for a match pair: 1 = team1 wins, 2 = team2 wins, 0 = halved ---
  const getHoleResult = (team1Players, team2Players, holeIndex) => {
    const best1 = getBestNet(team1Players, holeIndex);
    const best2 = getBestNet(team2Players, holeIndex);
    if (best1 === null || best2 === null) return null;
    if (best1 < best2) return 1;
    if (best2 < best1) return 2;
    return 0;
  };

  const scoreColor = (net, par) => {
    if (net === null) return '#fff';
    const diff = net - par;
    if (diff <= -2) return '#FFD700';
    if (diff === -1) return '#4CAF50';
    if (diff === 0) return '#fff';
    if (diff === 1) return '#ff9800';
    return '#f44336';
  };

  // --- All 4 teams ---
  const teamNames = ['Team A', 'Team B', 'Team C', 'Team D'];
  const teamColors = {
    'Team A': '#4CAF50',
    'Team B': '#2196F3',
    'Team C': '#9C27B0',
    'Team D': '#FF5722'
  };

  // Get teams that have players
  const activeTeams = teamNames.filter(t => getTeamPlayers(t).length > 0);

  // Generate all matchups between active teams (combinations of 2)
  const matchups = [];
  for (let i = 0; i < activeTeams.length; i++) {
    for (let j = i + 1; j < activeTeams.length; j++) {
      matchups.push({ team1: activeTeams[i], team2: activeTeams[j] });
    }
  }

  // Calculate standings (points: win = 1, halve = 0.5, loss = 0 per hole per matchup)
  const standings = {};
  activeTeams.forEach(t => { standings[t] = { wins: 0, losses: 0, halves: 0, points: 0 }; });

  matchups.forEach(({ team1, team2 }) => {
    const t1Players = getTeamPlayers(team1);
    const t2Players = getTeamPlayers(team2);
    for (let h = 0; h < 18; h++) {
      const result = getHoleResult(t1Players, t2Players, h);
      if (result === 1) {
        standings[team1].wins++;
        standings[team1].points += 1;
        standings[team2].losses++;
      } else if (result === 2) {
        standings[team2].wins++;
        standings[team2].points += 1;
        standings[team1].losses++;
      } else if (result === 0) {
        standings[team1].halves++;
        standings[team1].points += 0.5;
        standings[team2].halves++;
        standings[team2].points += 0.5;
      }
    }
  });

  // Sort teams by points
  const sortedTeams = [...activeTeams].sort((a, b) => standings[b].points - standings[a].points);

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>

      {/* --- OVERALL STANDINGS --- */}
      <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderBottom: '2px solid #4CAF50' }}>
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', marginBottom: '10px' }}>
          4-Ball Round Robin Standings
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '8px', textAlign: 'center' }}>
          {sortedTeams.map((team, idx) => (
            <div key={team} style={{ 
              flex: 1, 
              background: idx === 0 ? teamColors[team] + '33' : '#252525', 
              borderRadius: '8px', 
              padding: '10px', 
              border: `2px solid ${idx === 0 ? teamColors[team] : '#333'}` 
            }}>
              <div style={{ fontSize: '10px', color: teamColors[team], fontWeight: 'bold', textTransform: 'uppercase' }}>
                {idx === 0 ? '🏆 ' : ''}{team.replace('Team ', '')}
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: teamColors[team], marginTop: '2px' }}>
                {standings[team].points}
              </div>
              <div style={{ fontSize: '9px', color: '#666' }}>
                {standings[team].wins}W-{standings[team].losses}L-{standings[team].halves}H
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* --- SCORING GRID (all players) --- */}
      <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '10px', minWidth: '100px', textAlign: 'left', borderRight: '2px solid #4CAF50' }}>PLAYER</th>
              {[...Array(18)].map((_, i) => (
                <th key={i} style={{ padding: '6px', minWidth: '42px', borderLeft: i === 9 ? '2px solid #4CAF50' : '1px solid #333', backgroundColor: (i + 1) % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {i + 1}<br /><span style={{ fontSize: '8px', color: '#666' }}>P{pars[i]}</span>
                </th>
              ))}
              <th style={{ padding: '6px', minWidth: '50px', borderLeft: '2px solid #4CAF50', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {activeTeams.map(teamName => {
              const teamPlayers = getTeamPlayers(teamName);
              const color = teamColors[teamName];

              return (
                <React.Fragment key={teamName}>
                  <tr>
                    <td colSpan={20} style={{ backgroundColor: color + '22', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', borderTop: `2px solid ${color}55` }}>
                      {teamName}
                    </td>
                  </tr>
                  {teamPlayers.map(player => {
                    const playerScores = scores[player.id] || {};
                    const playerHcp = player.handicap ?? player.hcp ?? 0;
                    const quotaGoal = 36 - playerHcp;

                    // Calculate total strokes
                    let totalStrokes = 0;
                    for (let h = 1; h <= 18; h++) {
                      if (playerScores[h]) totalStrokes += playerScores[h];
                    }

                    return (
                      <tr key={player.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '8px 10px', fontWeight: 'bold', borderRight: '2px solid #333', whiteSpace: 'nowrap' }}>
                          {player.player_name || player.name}
                          <div style={{ fontSize: '8px', color: '#666', fontWeight: 'normal' }}>
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
                          const strokes = playerScores[holeNum];
                          const net = getNetScore(strokes, i, playerHcp);
                          const par = pars[i];
                          const pts = calculatePoints(strokes, i, playerHcp);

                          const bestNet = getBestNet(teamPlayers, i);
                          const isBest = net !== null && net === bestNet && teamPlayers.length > 1;

                          const holeDiff = hcds[i];
                          const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                          const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                          // Quota remaining
                          const pointsSoFar = getPlayerPointsUpToHole(player.id, holeNum, playerHcp);
                          const quotaRemaining = quotaGoal - pointsSoFar;

                          return (
                            <td key={i} style={{
                              padding: '3px',
                              textAlign: 'center',
                              borderLeft: i === 9 ? '2px solid #4CAF50' : '1px solid #2a2a2a',
                              backgroundColor: (i + 1) % 2 === 0 ? '#1a1a1a' : '#1e1e1e',
                              position: 'relative',
                              minWidth: '50px'
                            }}>
                              <div style={{ position: 'absolute', top: '2px', left: '3px', display: 'flex', gap: '1px' }}>
                                {hasOneStroke && <div style={{ width: '4px', height: '4px', backgroundColor: color, borderRadius: '50%' }} />}
                                {hasTwoStrokes && <div style={{ width: '4px', height: '4px', backgroundColor: color, borderRadius: '50%' }} />}
                              </div>

                              <input
                                type="tel" inputMode="numeric"
                                value={strokes || ''}
                                onChange={(e) => saveScore(player.id, holeNum, e.target.value)}
                                style={{
                                  width: '34px', height: '34px', textAlign: 'center',
                                  backgroundColor: isBest ? color + '33' : '#2a2a2a',
                                  color: net !== null ? scoreColor(net, par) : '#fff',
                                  border: isBest ? `2px solid ${color}` : '1px solid #444',
                                  borderRadius: '4px', fontSize: '16px',
                                  outline: 'none'
                                }}
                              />

                              {/* Net score (top right) - show when handicaps enabled */}
                              {net !== null && useHandicaps && (
                                <div style={{
                                  position: 'absolute', top: '1px', right: '3px',
                                  fontSize: '8px', fontWeight: '900',
                                  color: scoreColor(net, par),
                                  background: 'rgba(0,0,0,0.4)',
                                  padding: '0 2px', borderRadius: '2px'
                                }}>
                                  {net}
                                </div>
                              )}

                              {/* Quota points earned on this hole (bottom right) */}
                              {useQuota && strokes > 0 && (
                                <div style={{ 
                                  position: 'absolute', 
                                  bottom: '1px', 
                                  right: '3px', 
                                  fontSize: '8px', 
                                  fontWeight: '700',
                                  color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800',
                                  background: 'rgba(0,0,0,0.5)',
                                  padding: '0 3px',
                                  borderRadius: '2px'
                                }}>
                                  {pts}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #4CAF50', fontWeight: 'bold', fontSize: '14px', color: '#fff' }}>
                          {totalStrokes > 0 ? totalStrokes : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
