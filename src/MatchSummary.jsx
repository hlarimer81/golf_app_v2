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
  onBack 
}) {
  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

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

  // Get player stats
  const getPlayerStats = (player) => {
    const playerScores = scores[player.id] || {};
    const playerHcp = player.handicap ?? player.hcp ?? 0;
    const quotaGoal = 36 - playerHcp;

    let totalStrokes = 0;
    let totalPoints = 0;
    let holesPlayed = 0;

    for (let h = 1; h <= 18; h++) {
      if (playerScores[h]) {
        totalStrokes += playerScores[h];
        totalPoints += calculatePoints(playerScores[h], h - 1, playerHcp);
        holesPlayed++;
      }
    }

    const quotaResult = totalPoints - quotaGoal;

    return {
      name: player.player_name || player.name,
      team: player.teams?.team_name || player.team || 'Unknown',
      handicap: playerHcp,
      strokes: totalStrokes,
      points: totalPoints,
      holesPlayed,
      quotaGoal,
      quotaResult
    };
  };

  // Get all player stats and sort by points (descending)
  const playerStats = players.map(getPlayerStats).sort((a, b) => b.points - a.points);

  // Team totals
  const teamTotals = {};
  playerStats.forEach(p => {
    if (!teamTotals[p.team]) {
      teamTotals[p.team] = { points: 0, strokes: 0, quotaResult: 0 };
    }
    teamTotals[p.team].points += p.points;
    teamTotals[p.team].strokes += p.strokes;
    teamTotals[p.team].quotaResult += p.quotaResult;
  });

  const sortedTeams = Object.entries(teamTotals)
    .sort((a, b) => b[1].points - a[1].points)
    .map(([name, stats], idx) => ({ name, ...stats, rank: idx + 1 }));

  const teamColors = {
    'Team A': '#4CAF50',
    'Team B': '#2196F3',
    'Team C': '#9C27B0',
    'Team D': '#FF5722'
  };

  return (
    <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>🏆 Match Complete</h1>
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

      {/* Team Standings */}
      <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Team Standings
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedTeams.map((team, idx) => (
            <div key={team.name} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '15px',
              background: idx === 0 ? (teamColors[team.name] || '#4CAF50') + '22' : '#252525',
              padding: '15px',
              borderRadius: '8px',
              border: `2px solid ${idx === 0 ? (teamColors[team.name] || '#4CAF50') : '#333'}`
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
                <div style={{ fontWeight: 'bold', color: teamColors[team.name] || '#fff' }}>
                  {team.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', fontWeight: '900', color: teamColors[team.name] || '#4CAF50' }}>
                  {team.points}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>points</div>
              </div>
              {useQuota && (
                <div style={{ textAlign: 'right', marginLeft: '10px' }}>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: '700', 
                    color: team.quotaResult >= 0 ? '#4CAF50' : '#ff9800' 
                  }}>
                    {team.quotaResult >= 0 ? '+' : ''}{team.quotaResult}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>quota</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Individual Leaderboard */}
      <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Individual Leaderboard
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>#</th>
              <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>Player</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>HCP</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Strokes</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Points</th>
              {useQuota && <th style={{ padding: '10px', textAlign: 'center', color: '#888' }}>Quota</th>}
            </tr>
          </thead>
          <tbody>
            {playerStats.map((player, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #2a2a2a' }}>
                <td style={{ padding: '12px 10px', fontWeight: 'bold', color: idx < 3 ? '#FFD700' : '#666' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </td>
                <td style={{ padding: '12px 10px' }}>
                  <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                  <div style={{ fontSize: '11px', color: teamColors[player.team] || '#666' }}>{player.team}</div>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center', color: '#888' }}>{player.handicap}</td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>{player.strokes || '-'}</td>
                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: '#4CAF50' }}>
                  {player.points}
                </td>
                {useQuota && (
                  <td style={{ 
                    padding: '12px 10px', 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    color: player.quotaResult >= 0 ? '#4CAF50' : '#ff9800'
                  }}>
                    {player.quotaResult >= 0 ? '+' : ''}{player.quotaResult}
                    <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>
                      ({player.points}/{player.quotaGoal})
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Back button */}
      <button 
        onClick={onBack}
        style={{ 
          width: '100%', 
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
    </div>
  );
}
