import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MatchSummary from './MatchSummary';
import GolfScoreTile from './GolfScoreTile';

export default function FourBallGrid({ matchId, matchName, matchCode, players, useHandicaps, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
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

  // --- Active teams and colors ---
  const activeTeams = [...new Set(players.map(p => p.teams?.team_name || p.team || p.team_name).filter(Boolean))];
  
  const colorPalette = ['#4CAF50', '#2196F3', '#9C27B0', '#FF5722', '#FFC107', '#00BCD4'];
  const teamColors = {};
  activeTeams.forEach((t, i) => {
    teamColors[t] = colorPalette[i % colorPalette.length];
  });

  const didContributeToHolePoints = (playerId, teamName, holeIndex) => {
    const holeNum = holeIndex + 1;
    const strokes = scores[playerId]?.[holeNum];
    if (!strokes) return false;
    
    const player = players.find(p => p.id === playerId);
    const playerHcp = player?.handicap ?? player?.hcp ?? 0;
    const playerHoleScore = getNetScore(strokes, holeIndex, playerHcp);
    if (playerHoleScore === null) return false;
    
    const teamPlayers = getTeamPlayers(teamName);
    const bestTeamScore = getBestNet(teamPlayers, holeIndex);
    if (playerHoleScore !== bestTeamScore) return false;
    
    let wonOrHalvedAny = false;
    activeTeams.forEach(otherTeam => {
      if (otherTeam === teamName) return;
      const otherTeamPlayers = getTeamPlayers(otherTeam);
      const otherTeamBest = getBestNet(otherTeamPlayers, holeIndex);
      if (otherTeamBest !== null && bestTeamScore <= otherTeamBest) {
        wonOrHalvedAny = true;
      }
    });
    
    return wonOrHalvedAny;
  };

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
    for (const holeNum of holeNumbers) {
      const h = holeNum - 1;
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

  // Show summary screen
  if (showSummary) {
    return (
      <MatchSummary
        matchName={matchName}
        matchCode={matchCode}
        gameType="fourball"
        players={players}
        scores={scores}
        useHandicaps={useHandicaps}
        
        courseData={courseData}
        holesCount={holesCount}
        startHole={startHole}
        onBack={() => setShowSummary(false)}
        onNewMatch={onNewMatch}
      />
    );
  }

  // Column span for team header row: 1 (player) + frontHoles + (OUT if 18) + backHoles + (IN if 18) + TOT
  const teamHeaderColSpan = 1 + frontHoles.length + (is18 ? 1 : 0) + backHoles.length + (is18 ? 1 : 0) + 1;

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* --- OVERALL STANDINGS (STICKY) --- */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderBottom: '2px solid #4CAF50', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
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
      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '10px', minWidth: '100px', textAlign: 'left', borderRight: '2px solid #4CAF50' }}>PLAYER</th>
              {frontHoles.map((hNum) => (
                <th key={`f-${hNum}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '8px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #4CAF50', borderRight: '2px solid #4CAF50', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  OUT
                </th>
              )}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '6px', minWidth: '42px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '8px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && (
                <th style={{ padding: '6px', minWidth: '42px', borderLeft: '2px solid #4CAF50', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>
                  IN
                </th>
              )}
              <th style={{ padding: '6px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>
                TOT
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const renderedPlayersList = activeTeams.flatMap(t => getTeamPlayers(t));
              return activeTeams.map(teamName => {
                const teamPlayers = getTeamPlayers(teamName);
                const color = teamColors[teamName];

                return (
                  <React.Fragment key={teamName}>
                    <tr>
                      <td colSpan={teamHeaderColSpan} style={{ backgroundColor: color + '22', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', borderTop: `2px solid ${color}55` }}>
                        {teamName}
                      </td>
                    </tr>
                    {teamPlayers.map(player => {
                      const globalIdx = renderedPlayersList.findIndex(p => p.id === player.id);
                      const playerScores = scores[player.id] || {};
                      const playerHcp = player.handicap ?? player.hcp ?? 0;
                      const quotaGoal = 36 - playerHcp;

                      // Calculate total strokes
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
                        {frontHoles.map((hNum) => {
                          const hIdx = hNum - 1;
                          const strokes = playerScores[hNum];
                          const net = getNetScore(strokes, hIdx, playerHcp);
                          const par = pars[hIdx];
                          const pts = calculatePoints(strokes, hIdx, playerHcp);
                          const holeDiff = hcds[hIdx];
                          const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                          const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                          return (
                            <td key={`f-${hNum}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: hNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                              <GolfScoreTile 
                                id={`score-${hNum}-${globalIdx}`}
                                type="tel"
                                inputMode="numeric"
                                score={strokes || ''}
                                par={pars[hIdx]}
                                hasOneStroke={hasOneStroke}
                                hasTwoStrokes={hasTwoStrokes}
                                onChange={(e) => handleScoreChange(hNum, e.target.value)}
                                style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: didContributeToHolePoints(player.id, teamName, hIdx) ? color + '55' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                              />
                              {net !== null && useHandicaps && (
                                <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                                  {net}
                                </div>
                              )}
                              {useQuota && strokes > 0 && (
                                <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '8px', fontWeight: '700', color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.5)', padding: '0 3px', borderRadius: '2px', zIndex: 10 }}>
                                  {pts}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {is18 && (
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #4CAF50', borderRight: '2px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                            {outStrokes > 0 ? outStrokes : '-'}
                          </td>
                        )}
                        {backHoles.map((hNum) => {
                          const hIdx = hNum - 1;
                          const strokes = playerScores[hNum];
                          const net = getNetScore(strokes, hIdx, playerHcp);
                          const par = pars[hIdx];
                          const pts = calculatePoints(strokes, hIdx, playerHcp);
                          const holeDiff = hcds[hIdx];
                          const hasOneStroke = useHandicaps && playerHcp >= holeDiff;
                          const hasTwoStrokes = useHandicaps && playerHcp >= holeDiff + 18;

                          return (
                            <td key={`b-${hNum}`} style={{ padding: '3px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: hNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e', position: 'relative', minWidth: '50px' }}>
                              <GolfScoreTile 
                                id={`score-${hNum}-${globalIdx}`}
                                type="tel"
                                inputMode="numeric"
                                score={strokes || ''}
                                par={pars[hIdx]}
                                hasOneStroke={hasOneStroke}
                                hasTwoStrokes={hasTwoStrokes}
                                onChange={(e) => handleScoreChange(hNum, e.target.value)}
                                style={{ width: '34px', height: '34px', textAlign: 'center', backgroundColor: didContributeToHolePoints(player.id, teamName, hIdx) ? color + '55' : '#2a2a2a', color: net !== null ? scoreColor(net, par) : '#fff', fontSize: '16px', outline: 'none' }}
                              />
                              {net !== null && useHandicaps && (
                                <div style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '8px', fontWeight: '900', color: scoreColor(net, par), background: 'rgba(0,0,0,0.4)', padding: '0 2px', borderRadius: '2px', zIndex: 10 }}>
                                  {net}
                                </div>
                              )}
                              {useQuota && strokes > 0 && (
                                <div style={{ position: 'absolute', bottom: '1px', left: '3px', fontSize: '8px', fontWeight: '700', color: pts >= 3 ? '#4CAF50' : pts === 2 ? '#888' : '#ff9800', background: 'rgba(0,0,0,0.5)', padding: '0 3px', borderRadius: '2px', zIndex: 10 }}>
                                  {pts}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {is18 && (
                          <td style={{ padding: '6px', textAlign: 'center', borderLeft: '2px solid #4CAF50', backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '13px' }}>
                            {inStrokes > 0 ? inStrokes : '-'}
                          </td>
                        )}
                        <td style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>
                          {totalStrokes > 0 ? totalStrokes : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })})()}
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
