import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import GolfScoreTile from './GolfScoreTile';

// 2-Ball Aggregate: teams of 2. Each hole a team's score is the SUM of both partners'
// net scores. Teams are compared pairwise per hole (2 half-points for a win, 1 each for
// a tie) plus a per-nine bonus comparing each nine's total aggregate net. Points are
// tracked as "half points" internally (2 = 1 full point) exactly like the firmware.
export default function AggregateGrid({ matchId, matchName, matchCode, players, useHandicaps, useQuota, courseData, onNewMatch, holesCount = 18, startHole = 1 }) {
  const [scores, setScores] = useState({});
  const [showSummary, setShowSummary] = useState(false);

  const pars = courseData?.pars || Array(18).fill(4);
  const hcds = courseData?.handicaps || Array(18).fill(10);

  const holeNumbers = [];
  for (let i = 0; i < holesCount; i++) holeNumbers.push(startHole + i);
  const is18 = holesCount === 18;
  const frontHoles = is18 ? holeNumbers.slice(0, 9) : holeNumbers;
  const backHoles = is18 ? holeNumbers.slice(9) : [];

  const ACCENT = '#26A69A';

  // --- Team helpers ---
  const getPlayerTeam = (p) => p.teams?.team_name || p.team || p.team_name || 'Unknown';
  const activeTeams = [...new Set(players.map(getPlayerTeam).filter(t => t !== 'Unknown'))];
  const teamColors = {};
  const palette = ['#26A69A', '#5C6BC0', '#EF5350', '#FFCA28'];
  activeTeams.forEach((t, i) => { teamColors[t] = palette[i % palette.length]; });
  const getTeamPlayers = (teamName) => players.filter(p => getPlayerTeam(p) === teamName);

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

  // Aggregate (summed) net for a team on a hole (1-based holeNum). Returns 0 if any
  // partner hasn't scored, so the hole doesn't count for the team yet.
  const teamAggregateNet = (teamName, holeNum) => {
    const teamPlayers = getTeamPlayers(teamName);
    if (teamPlayers.length === 0) return 0;
    let sum = 0;
    for (const p of teamPlayers) {
      const strokes = scores[p.id]?.[holeNum];
      const net = calculateNetStrokes(strokes, holeNum - 1, p.handicap ?? p.hcp ?? 0);
      if (net === null) return 0;
      sum += net;
    }
    return sum;
  };

  // Half-points a team earns on a single hole vs all other teams (2 win, 1 tie).
  // Returns -1 if the team hasn't completed the hole.
  const aggregateHolePoints = (teamName, holeNum) => {
    const at = teamAggregateNet(teamName, holeNum);
    if (at <= 0) return -1;
    let half = 0;
    for (const other of activeTeams) {
      if (other === teamName) continue;
      const ao = teamAggregateNet(other, holeNum);
      if (ao <= 0) continue;
      if (at < ao) half += 2;
      else if (at === ao) half += 1;
    }
    return half;
  };

  // Full standings: per-hole pairwise half-points + per-nine bonus.
  const calculateStandings = () => {
    const half = {};
    activeTeams.forEach(t => { half[t] = 0; });

    // Per-hole pairwise
    for (let i = 0; i < activeTeams.length; i++) {
      for (let j = i + 1; j < activeTeams.length; j++) {
        const t1 = activeTeams[i];
        const t2 = activeTeams[j];
        for (const holeNum of holeNumbers) {
          const a1 = teamAggregateNet(t1, holeNum);
          const a2 = teamAggregateNet(t2, holeNum);
          if (a1 <= 0 || a2 <= 0) continue;
          if (a1 < a2) half[t1] += 2;
          else if (a2 < a1) half[t2] += 2;
          else { half[t1] += 1; half[t2] += 1; }
        }
      }
    }

    // Per-nine bonus
    const nines = is18 ? [frontHoles, backHoles] : [holeNumbers];
    for (const nine of nines) {
      const total = {};
      const done = {};
      activeTeams.forEach(t => {
        let sum = 0;
        let complete = true;
        for (const holeNum of nine) {
          const a = teamAggregateNet(t, holeNum);
          if (a <= 0) { complete = false; break; }
          sum += a;
        }
        total[t] = sum;
        done[t] = complete;
      });
      for (let i = 0; i < activeTeams.length; i++) {
        for (let j = i + 1; j < activeTeams.length; j++) {
          const t1 = activeTeams[i];
          const t2 = activeTeams[j];
          if (!done[t1] || !done[t2]) continue;
          if (total[t1] < total[t2]) half[t1] += 2;
          else if (total[t2] < total[t1]) half[t2] += 2;
          else { half[t1] += 1; half[t2] += 1; }
        }
      }
    }
    return half;
  };

  // Team's total aggregate net across all played holes.
  const teamNetTotal = (teamName) => {
    let total = 0;
    for (const holeNum of holeNumbers) total += teamAggregateNet(teamName, holeNum);
    return total;
  };

  const formatHalf = (hp) => (hp & 1) ? `${Math.floor(hp / 2)}½` : `${hp / 2}`;

  const standings = calculateStandings();

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
    const channel = supabase.channel('realtime-aggregate')
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
      { match_id: matchId, player_id: playerId, hole_number: holeNum, strokes: val },
      { onConflict: 'match_id,player_id,hole_number' }
    );
  };

  // ============================ SUMMARY ============================
  if (showSummary) {
    const sortedTeams = [...activeTeams].sort((a, b) => standings[b] - standings[a]);
    const leader = sortedTeams[0];

    return (
      <div style={{ background: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>🏆 Round Complete</h1>
          <div style={{ color: '#888', fontSize: '14px' }}>2-Ball Aggregate {matchName}</div>
          <div style={{ display: 'inline-block', background: '#333', padding: '4px 12px', borderRadius: '4px', marginTop: '8px', fontSize: '12px', letterSpacing: '2px' }}>{matchCode}</div>
        </div>

        {/* Team point cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {sortedTeams.map((tName, idx) => {
            const isLeader = idx === 0 && standings[tName] > 0;
            const tc = teamColors[tName] || ACCENT;
            return (
              <div key={tName} style={{ flex: 1, minWidth: '130px', background: '#1e1e1e', border: `2px solid ${isLeader ? '#FFD700' : tc}`, borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{isLeader ? '🥇 ' : ''}{tName}</div>
                <div style={{ fontSize: '34px', fontWeight: '900', color: isLeader ? '#FFD700' : tc }}>{formatHalf(standings[tName])}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>points</div>
                <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px' }}>{teamNetTotal(tName)} net</div>
              </div>
            );
          })}
        </div>

        {/* Per-hole half-points table */}
        <div style={{ background: '#1e1e1e', borderRadius: '12px', padding: '15px', marginBottom: '20px', overflowX: 'auto' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Per-Hole Points</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>Hole</th>
                <th style={{ padding: '8px', textAlign: 'center', color: '#888' }}>Par</th>
                {activeTeams.map(t => (
                  <th key={t} style={{ padding: '8px', textAlign: 'center', color: teamColors[t] }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holeNumbers.map(holeNum => (
                <tr key={holeNum} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{holeNum}</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: '#666' }}>{pars[holeNum - 1]}</td>
                  {activeTeams.map(t => {
                    const hp = aggregateHolePoints(t, holeNum);
                    const net = teamAggregateNet(t, holeNum);
                    return (
                      <td key={t} style={{ padding: '8px', textAlign: 'center', color: hp > 0 ? teamColors[t] : '#555', fontWeight: hp > 0 ? 'bold' : 'normal' }}>
                        {hp < 0 ? '-' : formatHalf(hp)}
                        {net > 0 && <span style={{ fontSize: '9px', color: '#555', display: 'block' }}>({net})</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowSummary(false)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>← Back to Scorecard</button>
          {onNewMatch && (
            <button onClick={onNewMatch} style={{ flex: 1, padding: '15px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🆕 New Round</button>
          )}
        </div>
      </div>
    );
  }

  // ============================ SCORECARD ============================
  return (
    <div style={{ background: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: 'sans-serif', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Standings header */}
      <div style={{ flexShrink: 0, background: '#1e1e1e', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', marginBottom: '15px', borderBottom: `2px solid ${ACCENT}` }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '2px' }}>👥 2-BALL AGGREGATE</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
          {activeTeams.map(tName => (
            <div key={tName} style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>{tName.replace('Team ', '')}</div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: teamColors[tName] || ACCENT }}>{formatHalf(standings[tName] || 0)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexGrow: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: '#252525' }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 110, backgroundColor: '#252525', padding: '12px', minWidth: '100px', textAlign: 'left', borderRight: `3px solid ${ACCENT}` }}>PLAYER</th>
              {frontHoles.map((hNum) => (
                <th key={`f-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '9px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && <th style={{ padding: '8px', minWidth: '45px', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}`, backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>OUT</th>}
              {backHoles.map((hNum) => (
                <th key={`b-${hNum}`} style={{ padding: '8px', minWidth: '45px', borderLeft: '1px solid #333', backgroundColor: hNum % 2 === 0 ? '#252525' : '#2a2a2a', position: 'sticky', top: 0, zIndex: 90 }}>
                  {hNum}<br /><span style={{ fontSize: '9px', color: '#666' }}>P{pars[hNum - 1]}</span>
                </th>
              ))}
              {is18 && <th style={{ padding: '8px', minWidth: '45px', borderLeft: `3px solid ${ACCENT}`, backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90, color: '#888' }}>IN</th>}
              <th style={{ padding: '8px', minWidth: '50px', borderLeft: '1px solid #333', backgroundColor: '#252525', position: 'sticky', top: 0, zIndex: 90 }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {activeTeams.map(teamName => {
              const teamPlayers = getTeamPlayers(teamName);
              return (
                <React.Fragment key={teamName}>
                  {/* Team header row */}
                  <tr style={{ backgroundColor: (teamColors[teamName] || ACCENT) + '22' }}>
                    <td colSpan={1 + frontHoles.length + backHoles.length + (is18 ? 3 : 1)}
                      style={{ padding: '6px 12px', fontWeight: 'bold', color: teamColors[teamName] || ACCENT, position: 'sticky', left: 0, fontSize: '12px', letterSpacing: '1px' }}>
                      {teamName} — {formatHalf(standings[teamName] || 0)} pts
                    </td>
                  </tr>
                  {teamPlayers.map((player, tIdx) => {
                    const playerScores = scores[player.id] || {};
                    const playerHcp = player.handicap ?? player.hcp ?? 0;
                    const globalIdx = players.findIndex(p => p.id === player.id);

                    let outStrokes = 0, inStrokes = 0;
                    frontHoles.forEach(h => { if (playerScores[h]) outStrokes += playerScores[h]; });
                    backHoles.forEach(h => { if (playerScores[h]) inStrokes += playerScores[h]; });

                    const handleScoreChange = (holeNum, val) => {
                      saveScore(player.id, holeNum, val);
                      if (val.length === 1) {
                        const nextInput = document.getElementById(`score-${holeNum}-${globalIdx + 1}`);
                        if (nextInput) setTimeout(() => nextInput.focus(), 10);
                      }
                    };

                    const renderCell = (holeNum) => {
                      const i = holeNum - 1;
                      const hp = aggregateHolePoints(teamName, holeNum);
                      const wonHole = hp >= 2;
                      const tiedHole = hp === 1;
                      const hasOneStroke = useHandicaps && playerHcp >= hcds[i];
                      const hasTwoStrokes = useHandicaps && playerHcp >= (hcds[i] + 18);
                      let cellBg = holeNum % 2 === 0 ? '#1a1a1a' : '#1e1e1e';
                      if (wonHole) cellBg = (teamColors[teamName] || ACCENT) + '33';
                      else if (tiedHole) cellBg = (teamColors[teamName] || ACCENT) + '18';
                      return (
                        <td key={holeNum} style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: cellBg, position: 'relative', minWidth: '55px' }}>
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
                    };

                    return (
                      <tr key={player.id} style={{ borderBottom: tIdx === teamPlayers.length - 1 ? '2px solid #333' : '1px solid #2a2a2a' }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1a1a1a', padding: '12px', fontWeight: 'bold', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>
                          {player.player_name || player.name}
                          <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>HCP: {playerHcp}</div>
                        </td>
                        {frontHoles.map(renderCell)}
                        {is18 && <td style={{ padding: '8px', textAlign: 'center', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}`, backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{outStrokes || '-'}</td>}
                        {backHoles.map(renderCell)}
                        {is18 && <td style={{ padding: '8px', textAlign: 'center', borderLeft: `3px solid ${ACCENT}`, backgroundColor: '#1a1a1a', fontWeight: 'bold', color: '#aaa', fontSize: '14px' }}>{inStrokes || '-'}</td>}
                        <td style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #2a2a2a', backgroundColor: '#1e1e1e', fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{(outStrokes + inStrokes) || '-'}</td>
                      </tr>
                    );
                  })}
                  {/* Team aggregate net row */}
                  <tr style={{ backgroundColor: '#161616' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#161616', padding: '6px 12px', fontSize: '10px', color: '#888', borderRight: '3px solid #333', whiteSpace: 'nowrap' }}>AGG NET</td>
                    {frontHoles.map(holeNum => {
                      const net = teamAggregateNet(teamName, holeNum);
                      return <td key={`agg-f-${holeNum}`} style={{ padding: '4px', textAlign: 'center', fontSize: '11px', color: teamColors[teamName] || ACCENT, fontWeight: 'bold', backgroundColor: '#161616' }}>{net > 0 ? net : '-'}</td>;
                    })}
                    {is18 && <td style={{ backgroundColor: '#161616', borderLeft: `3px solid ${ACCENT}`, borderRight: `3px solid ${ACCENT}` }}></td>}
                    {backHoles.map(holeNum => {
                      const net = teamAggregateNet(teamName, holeNum);
                      return <td key={`agg-b-${holeNum}`} style={{ padding: '4px', textAlign: 'center', fontSize: '11px', color: teamColors[teamName] || ACCENT, fontWeight: 'bold', backgroundColor: '#161616' }}>{net > 0 ? net : '-'}</td>;
                    })}
                    {is18 && <td style={{ backgroundColor: '#161616', borderLeft: `3px solid ${ACCENT}` }}></td>}
                    <td style={{ padding: '6px', textAlign: 'center', fontSize: '12px', color: teamColors[teamName] || ACCENT, fontWeight: 'bold', backgroundColor: '#161616' }}>{teamNetTotal(teamName) || '-'}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(transparent, #121212 30%)', zIndex: 200 }}>
        <button onClick={() => setShowSummary(true)} style={{ padding: '15px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 -2px 10px rgba(0,0,0,0.5)' }}>🏁 Finish Round</button>
      </div>
      <div style={{ height: '70px', flexShrink: 0 }} />
    </div>
  );
}
