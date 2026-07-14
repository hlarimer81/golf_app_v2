import React from 'react';

export default function MatchSummary({ 
  matchName, 
  matchCode, 
  gameType, 
  players, 
  scores, 
  useHandicaps, 
  useQuota, 
  courseData,
  stablefordMode,
  onBack,
  onNewMatch,
  holesCount = 18,
  startHole = 1
}) {
  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

  // Build dynamic hole list of holes actually played
  const holeNumbers = [];
  for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);

  // Get team name for a player
  const getPlayerTeam = (player) => {
    return player.teams?.team_name || player.team || player.team_name || 'Unknown';
  };

  const activeTeamsList = [...new Set(players.map(p => getPlayerTeam(p)).filter(t => t !== 'Unknown'))];
  const colorPalette = ['#4CAF50', '#2196F3', '#9C27B0', '#FF5722', '#FFC107', '#00BCD4'];
  const teamColors = {};
  activeTeamsList.forEach((t, i) => {
    teamColors[t] = colorPalette[i % colorPalette.length];
  });

  // Get players by team name
  const getTeamPlayers = (teamName) =>
    players.filter(p => getPlayerTeam(p) === teamName);

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

  // Calculate Stableford points
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

  // Best net score for a team on a hole (for 4-ball)
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

  // Hole result for a match pair: 1 = team1 wins, 2 = team2 wins, 0 = halved
  const getHoleResult = (team1Players, team2Players, holeIndex) => {
    const best1 = getBestNet(team1Players, holeIndex);
    const best2 = getBestNet(team2Players, holeIndex);
    if (best1 === null || best2 === null) return null;
    if (best1 < best2) return 1;
    if (best2 < best1) return 2;
    return 0;
  };

  const getNinePointDistribution = (holeIndex) => {
    const holeNum = holeIndex + 1;
    const holeScores = [];
    
    players.forEach(player => {
      const strokes = (scores[player.id] || {})[holeNum];
      const hcp = player.handicap ?? player.hcp ?? 0;
      const net = getNetScore(strokes, holeIndex, hcp);
      if (net !== null) {
        holeScores.push({ playerId: player.id, net });
      }
    });

    if (holeScores.length !== 3) return {};

    const sorted = [...holeScores].sort((a, b) => a.net - b.net);
    const p1 = sorted[0];
    const p2 = sorted[1];
    const p3 = sorted[2];

    const dist = {};
    if (p1.net === p2.net && p2.net === p3.net) {
      dist[p1.playerId] = 3; dist[p2.playerId] = 3; dist[p3.playerId] = 3;
    } else if (p1.net === p2.net) {
      dist[p1.playerId] = 4; dist[p2.playerId] = 4; dist[p3.playerId] = 1;
    } else if (p2.net === p3.net) {
      dist[p1.playerId] = 5; dist[p2.playerId] = 2; dist[p3.playerId] = 2;
    } else {
      dist[p1.playerId] = 5; dist[p2.playerId] = 3; dist[p3.playerId] = 1;
    }
    return dist;
  };

  const calculateNinePoints = () => {
    const totals = {};
    players.forEach(p => { totals[p.id] = 0; });

    for (const holeNum of holeNumbers) {
      const i = holeNum - 1;
      const dist = getNinePointDistribution(i);
      players.forEach(p => {
        if (dist[p.id] !== undefined) totals[p.id] += dist[p.id];
      });
    }
    return totals;
  };

  const ninePointTotals = gameType === 'ninepoint' ? calculateNinePoints() : {};

  // Calculate Vegas points for each hole
  const getVegasPoints = (holeIndex) => {
    const teams = {};
    players.forEach(p => {
      const teamName = getPlayerTeam(p);
      if (!teams[teamName]) teams[teamName] = [];
      const holeNum = holeIndex + 1;
      const strokes = scores[p.id]?.[holeNum];
      const hcp = p.handicap ?? p.hcp ?? 0;
      if (strokes) {
        teams[teamName].push(getNetScore(strokes, holeIndex, hcp));
      }
    });

    const teamKeys = Object.keys(teams);
    if (teamKeys.length < 2) return {};

    const t1 = teams[teamKeys[0]].slice(0, 2);
    const t2 = teams[teamKeys[1]].slice(0, 2);

    if (t1.length < 2 || t1.includes(null) || t2.length < 2 || t2.includes(null)) return {};

    const par = pars[holeIndex];

    const t1Lo = Math.min(...t1);
    const t1Hi = Math.max(...t1);
    const t2Lo = Math.min(...t2);
    const t2Hi = Math.max(...t2);

    const t1Birdie = t1Lo <= par - 1;
    const t2Birdie = t2Lo <= par - 1;

    const t1Score = t2Birdie ? (t1Hi * 10 + t1Lo) : (t1Lo * 10 + t1Hi);
    const t2Score = t1Birdie ? (t2Hi * 10 + t2Lo) : (t2Lo * 10 + t2Hi);

    if (t1Score < t2Score) return { [teamKeys[0]]: t2Score - t1Score, [teamKeys[1]]: 0 };
    if (t2Score < t1Score) return { [teamKeys[1]]: t1Score - t2Score, [teamKeys[0]]: 0 };
    return { [teamKeys[0]]: 0, [teamKeys[1]]: 0 };
  };

  // Calculate total Vegas points for each team
  const calculateVegasTeamTotals = () => {
    const teamTotals = {};
    activeTeamsList.forEach(t => { teamTotals[t] = 0; });

    for (const holeNum of holeNumbers) {
      const holeIndex = holeNum - 1;
      const pts = getVegasPoints(holeIndex);
      Object.keys(pts).forEach(team => {
        teamTotals[team] += pts[team] || 0;
      });
    }
    return teamTotals;
  };

  const vegasTeamTotals = gameType === 'vegas' ? calculateVegasTeamTotals() : {};

  // Calculate Chairman game results for teams
  const calculateChairman = () => {
    const chairmanPoints = {}; // { teamName: points }
    activeTeamsList.forEach(t => { chairmanPoints[t] = 0; });
    
    let currentChairman = null; // Will hold teamName
    
    for (const holeNum of holeNumbers) {
      const holeIndex = holeNum - 1;
      const holeScores = [];
      
      // Get best net score for each team
      activeTeamsList.forEach(team => {
        const bestNet = getBestNet(getTeamPlayers(team), holeIndex);
        if (bestNet !== null) {
          holeScores.push({ team, net: bestNet });
        }
      });
      
      // Need all teams to have a score
      if (holeScores.length !== activeTeamsList.length || activeTeamsList.length === 0) {
        continue;
      }
      
      // Find the lowest score(s)
      const minScore = Math.min(...holeScores.map(s => s.net));
      const winners = holeScores.filter(s => s.net === minScore);
      
      if (currentChairman === null) {
        if (winners.length === 1) {
          currentChairman = winners[0].team;
        }
      } else {
        const chairmanWon = winners.length === 1 && winners[0].team === currentChairman;
        const chairmanTied = winners.some(w => w.team === currentChairman);
        
        if (chairmanWon) {
          chairmanPoints[currentChairman] += 1;
        } else if (!chairmanTied && winners.length === 1) {
          currentChairman = winners[0].team;
        }
      }
    }
    
    return chairmanPoints;
  };
  const chairmanTeamPoints = gameType === 'chairman' ? calculateChairman() : {};

  // Get player stats
  const getPlayerStats = (player) => {
    const playerScores = scores[player.id] || {};
    const playerHcp = player.handicap ?? player.hcp ?? 0;
    const quotaGoal = 36 - playerHcp;

    let totalStrokes = 0;
    let totalNetStrokes = 0;
    let totalPoints = 0;
    let totalQuotaPoints = 0;
    let holesPlayed = 0;

    for (const h of holeNumbers) {
      if (playerScores[h]) {
        totalStrokes += playerScores[h];
        const netS = getNetScore(playerScores[h], h - 1, playerHcp);
        if (netS !== null) totalNetStrokes += netS;
        totalPoints += calculatePoints(playerScores[h], h - 1, playerHcp);
        totalQuotaPoints += calculatePoints(playerScores[h], h - 1, 0); // Gross points for quota
        holesPlayed++;
      }
    }

    // Calculate 4-ball holes contributed
    let holesContributed = 0;
    if (gameType === 'fourball') {
      const teamName = getPlayerTeam(player);
      const teamPlayers = getTeamPlayers(teamName);
      
      for (const holeNum of holeNumbers) {
        const h = holeNum - 1;
        const strokes = playerScores[holeNum];
        if (!strokes) continue;
        
        const playerHoleScore = getNetScore(strokes, h, playerHcp);
        if (playerHoleScore === null) continue;
        
        const bestTeamScore = getBestNet(teamPlayers, h);
        if (playerHoleScore !== bestTeamScore) continue;
        
        let wonOrHalvedAny = false;
        activeTeamsList.filter(t => getTeamPlayers(t).length > 0).forEach(otherTeam => {
          if (otherTeam === teamName) return;
          const otherTeamPlayers = getTeamPlayers(otherTeam);
          const otherTeamBest = getBestNet(otherTeamPlayers, h);
          if (otherTeamBest !== null && bestTeamScore <= otherTeamBest) {
            wonOrHalvedAny = true;
          }
        });
        
        if (wonOrHalvedAny) {
          holesContributed++;
        }
      }
    }

    const quotaResult = totalQuotaPoints - quotaGoal;
    return {
      id: player.id,
      name: player.player_name || player.name,
      team: getPlayerTeam(player),
      handicap: playerHcp,
      strokes: totalStrokes,
      netStrokes: totalNetStrokes,
      points: totalPoints,
      ninePoints: ninePointTotals[player.id] || 0,
      quotaPoints: totalQuotaPoints,
      holesPlayed,
      quotaGoal,
      quotaResult,
      holesContributed
    };
  };

  // Get all player stats
  const playerStats = players.map(getPlayerStats);
  
  // Sort by strokes for 4-ball or chairman, by net/gross for singles, by 9-point points for ninepoint, by stableford points for others
  const sortedPlayerStats = [...playerStats].sort((a, b) => {
    if (gameType === 'fourball' || gameType === 'chairman') {
      return a.strokes - b.strokes; // Lower strokes is better
    }
    if (gameType === 'singles') {
      return useHandicaps ? a.netStrokes - b.netStrokes : a.strokes - b.strokes; // Lower strokes is better
    }
    if (gameType === 'ninepoint') {
      return b.ninePoints - a.ninePoints; // Higher nine points is better
    }
    return b.points - a.points; // Higher points is better
  });

  // Calculate 4-Ball team standings (match play points)
  const activeTeams = activeTeamsList.filter(t => getTeamPlayers(t).length > 0);

  // Generate all matchups between active teams
  const matchups = [];
  for (let i = 0; i < activeTeams.length; i++) {
    for (let j = i + 1; j < activeTeams.length; j++) {
      matchups.push({ team1: activeTeams[i], team2: activeTeams[j] });
    }
  }

  // Calculate 4-ball standings
  const fourBallStandings = {};
  activeTeams.forEach(t => { fourBallStandings[t] = { wins: 0, losses: 0, halves: 0, points: 0 }; });

  matchups.forEach(({ team1, team2 }) => {
    const t1Players = getTeamPlayers(team1);
    const t2Players = getTeamPlayers(team2);
    for (const holeNum of holeNumbers) {
      const h = holeNum - 1;
      const result = getHoleResult(t1Players, t2Players, h);
      if (result === 1) {
        fourBallStandings[team1].wins++;
        fourBallStandings[team1].points += 1;
        fourBallStandings[team2].losses++;
      } else if (result === 2) {
        fourBallStandings[team2].wins++;
        fourBallStandings[team2].points += 1;
        fourBallStandings[team1].losses++;
      } else if (result === 0) {
        fourBallStandings[team1].halves++;
        fourBallStandings[team1].points += 0.5;
        fourBallStandings[team2].halves++;
        fourBallStandings[team2].points += 0.5;
      }
    }
  });

  // Stableford team totals
  const stablefordTeamTotals = {};
  playerStats.forEach(p => {
    if (!stablefordTeamTotals[p.team]) {
      stablefordTeamTotals[p.team] = { points: 0, strokes: 0, quotaResult: 0 };
    }
    stablefordTeamTotals[p.team].points += p.points;
    stablefordTeamTotals[p.team].strokes += p.strokes;
    stablefordTeamTotals[p.team].quotaResult += p.quotaResult;
  });

  // Sort teams based on game type
  const sortedTeams = gameType === 'fourball'
    ? [...activeTeams].sort((a, b) => fourBallStandings[b].points - fourBallStandings[a].points)
    : gameType === 'chairman'
      ? [...activeTeamsList].sort((a, b) => chairmanTeamPoints[b] - chairmanTeamPoints[a])
      : gameType === 'vegas'
        ? [...activeTeamsList].sort((a, b) => vegasTeamTotals[b] - vegasTeamTotals[a])
        : Object.entries(stablefordTeamTotals)
            .sort((a, b) => b[1].points - a[1].points)
            .map(([name]) => name);

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>🏆 Round Complete</h1>
        <div style={{ color: '#888', fontSize: '14px' }}>{matchName}</div>
        <div style={{ 
          display: 'inline-block',
          background: '#333', 
          padding: '4px 12px', 
          borderRadius: '4px', 
          marginTop: '8px',
          fontSize: '12px',
          letterSpacing: '2px'
        }}>
          {matchCode}
        </div>
      </div>

      {/* Team Standings - only show for stableford (if team play), fourball, chairman, and vegas games */}
      {gameType !== 'skins' && gameType !== 'ninepoint' && gameType !== 'singles' && !(gameType === 'stableford' && stablefordMode === 'singles') && (
        <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {gameType === 'fourball' ? '4-Ball Match Play Standings' : gameType === 'chairman' ? '👑 Chairman Team Standings' : gameType === 'vegas' ? '🎰 Vegas Team Standings' : 'Team Standings'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedTeams.map((teamName, idx) => {
              const stats = gameType === 'fourball'
                ? fourBallStandings[teamName]
                : gameType === 'chairman'
                  ? { points: chairmanTeamPoints[teamName] }
                  : gameType === 'vegas'
                    ? { points: vegasTeamTotals[teamName] }
                    : stablefordTeamTotals[teamName];
              
              return (
                <div key={teamName} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '15px',
                  background: idx === 0 ? (teamColors[teamName] || '#4CAF50') + '22' : '#252525',
                  padding: '15px',
                  borderRadius: '8px',
                  border: `2px solid ${idx === 0 ? (teamColors[teamName] || '#4CAF50') : '#333'}`
                }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '900', 
                    color: idx === 0 ? '#FFD700' : '#666',
                    width: '30px'
                  }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: teamColors[teamName] || '#fff' }}>
                      {teamName}
                    </div>
                    {gameType === 'fourball' && (
                      <div style={{ fontSize: '11px', color: '#888' }}>
                        {stats.wins}W - {stats.losses}L - {stats.halves}H
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: teamColors[teamName] || '#4CAF50' }}>
                      {stats.points}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      {gameType === 'fourball' ? 'match pts' : gameType === 'chairman' ? '👑 pts' : gameType === 'vegas' ? 'vegas pts' : 'points'}
                    </div>
                  </div>
                  {useQuota && gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'vegas' && (
                    <div style={{ textAlign: 'right', marginLeft: '10px' }}>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: '700', 
                        color: stats.quotaResult >= 0 ? '#4CAF50' : '#ff9800' 
                      }}>
                        {stats.quotaResult >= 0 ? '+' : ''}{stats.quotaResult}
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>quota</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual Results */}
      <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {gameType === 'fourball' || gameType === 'chairman' || gameType === 'vegas' ? 'Individual Scores' : 'Individual Leaderboard'}
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              {gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'vegas' && <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>#</th>}
              <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>Player</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>HCP</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Gross</th>
              {gameType === 'singles' && (
                <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Net</th>
              )}
              {gameType === 'fourball' && (
                <th style={{ padding: '10px', textAlign: 'center', color: '#4CAF50' }}>Holes Contributed</th>
              )}
              {gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'ninepoint' && gameType !== 'singles' && gameType !== 'vegas' && (
                <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Points</th>
              )}
              {gameType === 'ninepoint' && (
                <th style={{ padding: '10px', textAlign: 'center', color: '#00BCD4' }}>9-Pts</th>
              )}
              {useQuota && <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Quota</th>}
            </tr>
          </thead>
          <tbody>
            {sortedPlayerStats.map((player, idx) => (
              <tr key={player.id || idx} style={{ borderBottom: '1px solid #2a2a2a' }}>
                {gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'vegas' && (
                  <td style={{ padding: '12px 10px', fontWeight: 'bold', color: idx < 3 ? '#FFD700' : '#666' }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </td>
                )}
                <td style={{ padding: '12px 10px' }}>
                  <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                  {gameType !== 'skins' && gameType !== 'ninepoint' && gameType !== 'singles' && !(gameType === 'stableford' && stablefordMode === 'singles') && (
                    <div style={{ fontSize: '11px', color: teamColors[player.team] || '#666' }}>{player.team}</div>
                  )}
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center', color: '#888' }}>{player.handicap}</td>
                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: gameType === 'fourball' || gameType === 'chairman' || gameType === 'vegas' || (gameType === 'singles' && !useHandicaps) ? 'bold' : 'normal', fontSize: gameType === 'fourball' || gameType === 'chairman' || gameType === 'vegas' || (gameType === 'singles' && !useHandicaps) ? '18px' : '14px' }}>
                  {player.strokes || '-'}
                </td>
                {gameType === 'singles' && (
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: useHandicaps ? 'bold' : 'normal', fontSize: useHandicaps ? '18px' : '14px', color: useHandicaps ? '#4CAF50' : '#e0e0e0' }}>
                    {player.netStrokes || '-'}
                  </td>
                )}
                {gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'ninepoint' && gameType !== 'singles' && gameType !== 'vegas' && (
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: '#4CAF50' }}>
                    {player.points}
                  </td>
                )}
                {gameType === 'ninepoint' && (
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: '#00BCD4' }}>
                    {player.ninePoints}
                  </td>
                )}
                {gameType === 'fourball' && (
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px', color: '#4CAF50' }}>
                    {player.holesContributed}
                  </td>
                )}
                {useQuota && (
                  <td style={{
                    padding: '12px 10px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: player.quotaResult >= 0 ? '#4CAF50' : '#ff9800'
                  }}>
                    {player.quotaResult >= 0 ? '+' : ''}{player.quotaResult}
                    {gameType !== 'fourball' && gameType !== 'chairman' && gameType !== 'vegas' && (
                      <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                        ({player.quotaPoints}/{player.quotaGoal})
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={onBack}
          style={{ 
            flex: 1,
            padding: '15px', 
            backgroundColor: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          ← Back to Scorecard
        </button>
        {onNewMatch && (
          <button 
            onClick={onNewMatch}
            style={{ 
              flex: 1,
              padding: '15px', 
              backgroundColor: '#4CAF50', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🆕 New Round
          </button>
        )}
      </div>
    </div>
  );
}
