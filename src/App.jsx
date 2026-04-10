import React, { useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import StablefordGrid from './StablefordGrid';
import FourBallGrid from './FourBallGrid';
import { GOLF_COURSES, PENINSULA_NINES, combinePeninsulaNines } from './courses';

function App() {
  const [matchId, setMatchId] = useState(null);
  const [matchName, setMatchName] = useState('');
  const [useHandicaps, setUseHandicaps] = useState(false);
  const [useQuota, setUseQuota] = useState(false);
  const [gameType, setGameType] = useState('stableford'); // 'stableford' | 'fourball'
  const [loading, setLoading] = useState(false);
  const [showScorer, setShowScorer] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("Ames Golf & CC");

  // Peninsula nine selection
  const [peninsulaFront, setPeninsulaFront] = useState("Marsh");
  const [peninsulaBack, setPeninsulaBack] = useState("Lakes");

  const [players, setPlayers] = useState([
    { name: 'Ryan', team: 'Team A', group: 'Group 1', hcp: 10 },
    { name: 'Harold', team: 'Team A', group: 'Group 1', hcp: 20 },
    { name: 'Matt', team: 'Team B', group: 'Group 1', hcp: 10 },
    { name: 'Boeve', team: 'Team B', group: 'Group 1', hcp: 22 },
    { name: 'Cafferty', team: 'Team C', group: 'Group 2', hcp: 10 },
    { name: 'Barry', team: 'Team C', group: 'Group 2', hcp: 19 },
    { name: 'Roger', team: 'Team D', group: 'Group 2', hcp: 15 },
    { name: 'Karl', team: 'Team D', group: 'Group 2', hcp: 18 },
  ]);

  const handlePlayerChange = (index, field, value) => {
    const updatedPlayers = [...players];
    updatedPlayers[index][field] = field === 'hcp' ? (parseInt(value, 10) || 0) : value;
    setPlayers(updatedPlayers);
  };

  // Build the course data (handles Peninsula combination)
  const courseData = useMemo(() => {
    if (selectedCourse === 'Peninsula Golf Club') {
      return combinePeninsulaNines(peninsulaFront, peninsulaBack);
    }
    return GOLF_COURSES[selectedCourse];
  }, [selectedCourse, peninsulaFront, peninsulaBack]);

  // All course options (including Peninsula as a special entry)
  const courseOptions = [
    ...Object.keys(GOLF_COURSES),
    'Peninsula Golf Club'
  ];

  const createMatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .insert([{ match_name: matchName, use_handicaps: useHandicaps }])
      .select();

    if (error) alert(error.message);
    else setMatchId(data[0].id);
    setLoading(false);
  };

  const savePlayers = async () => {
    setLoading(true);
    try {
      // 1. Filter out players with no name
      const activePlayers = players.filter(p => p.name.trim() !== '');
      if (activePlayers.length === 0) {
        alert("Please enter at least one player name.");
        setLoading(false);
        return;
      }

      // 4-Ball requires at least 1 player on A and B (C vs D is optional)
      if (gameType === 'fourball') {
        const hasA = activePlayers.some(p => p.team === 'Team A');
        const hasB = activePlayers.some(p => p.team === 'Team B');
        if (!hasA || !hasB) {
          alert("4-Ball requires at least one player on Team A and one on Team B for the first match.");
          setLoading(false);
          return;
        }
      }

      // 2. Create the 4 teams
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert(['Team A', 'Team B', 'Team C', 'Team D'].map(name => ({
          match_id: matchId,
          team_name: name
        })))
        .select();

      if (teamError) throw teamError;

      // 3. Prepare only active players
      const playersToInsert = activePlayers.map(p => ({
        match_id: matchId,
        player_name: p.name,
        team_id: teamData.find(t => t.team_name === p.team).id,
        physical_group: p.group,
        handicap: useHandicaps ? p.hcp : 0
      }));

      const { data: savedPlayers, error: pError } = await supabase
        .from('players')
        .insert(playersToInsert)
        .select(`
          *,
          teams (
            team_name
          )
        `);

      if (pError) throw pError;

      setFinalPlayers(savedPlayers);
      setShowScorer(true);
    } catch (error) {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  // --- Show the correct scorer based on game type ---
  if (showScorer) {
    if (gameType === 'fourball') {
      return (
        <FourBallGrid
          matchId={matchId}
          players={finalPlayers}
          useHandicaps={useHandicaps}
          useQuota={useQuota}
          courseData={courseData}
        />
      );
    }
    return (
      <StablefordGrid
        matchId={matchId}
        players={finalPlayers}
        useHandicaps={useHandicaps}
        useQuota={useQuota}
        courseData={courseData}
      />
    );
  }

  // --- Game type descriptions ---
  const gameDescriptions = {
    stableford: 'Points-based scoring. Each player earns points per hole. Teams accumulate total points.',
    fourball: 'Match play. Each player plays their own ball; the best score on each team counts. Team A vs Team B.',
  };

  const peninsulaNineNames = Object.keys(PENINSULA_NINES);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '700px', margin: 'auto' }}>
      <h1>⛳️ Golf Tracker</h1>

      {!matchId ? (
        <form onSubmit={createMatch} style={{ background: '#f4f4f4', padding: '20px', borderRadius: '10px' }}>
          <h3>1. Match Setup</h3>

          <input
            type="text" placeholder="Match Name (e.g. Pinehurst Trip)"
            value={matchName} onChange={e => setMatchName(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', boxSizing: 'border-box' }} required
          />

          {/* --- Game Type Selector --- */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Select Game Type
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { value: 'stableford', label: '🏆 Stableford' },
                { value: 'fourball', label: '⚔️ 4-Ball' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGameType(value)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: gameType === value ? '2px solid #007bff' : '2px solid #ccc',
                    backgroundColor: gameType === value ? '#e8f0fe' : '#fff',
                    color: gameType === value ? '#007bff' : '#555',
                    fontWeight: gameType === value ? 'bold' : 'normal',
                    cursor: 'pointer',
                    fontSize: '15px',
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', marginBottom: 0 }}>
              {gameDescriptions[gameType]}
            </p>
          </div>

          {/* --- Course Selector --- */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>Select Course</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            >
              {courseOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* --- Peninsula Nine Selection --- */}
          {selectedCourse === 'Peninsula Golf Club' && (
            <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '8px', padding: '12px', marginBottom: '15px' }}>
              <div style={{ fontSize: '13px', color: '#1565c0', fontWeight: 'bold', marginBottom: '10px' }}>
                🏝️ Peninsula: Select 2 of 3 Nines
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Front 9</label>
                  <select
                    value={peninsulaFront}
                    onChange={(e) => {
                      setPeninsulaFront(e.target.value);
                      // If same as back, swap
                      if (e.target.value === peninsulaBack) {
                        setPeninsulaBack(peninsulaFront);
                      }
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
                  >
                    {peninsulaNineNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Back 9</label>
                  <select
                    value={peninsulaBack}
                    onChange={(e) => {
                      setPeninsulaBack(e.target.value);
                      // If same as front, swap
                      if (e.target.value === peninsulaFront) {
                        setPeninsulaFront(peninsulaBack);
                      }
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
                  >
                    {peninsulaNineNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                Playing: <strong>{peninsulaFront}</strong> → <strong>{peninsulaBack}</strong>
              </div>
            </div>
          )}

          {/* --- Handicap Toggle --- */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
            <input type="checkbox" checked={useHandicaps} onChange={e => setUseHandicaps(e.target.checked)} />
            Enable Net Scoring (Handicaps)
          </label>

          {/* --- Quota Toggle --- */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '5px' }}>
            <input type="checkbox" checked={useQuota} onChange={e => setUseQuota(e.target.checked)} />
            Enable Quota Game (Goal = 36 − Handicap)
          </label>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            {loading ? 'Creating...' : 'Create Match'}
          </button>
        </form>
      ) : (
        <div>
          <h3>2. Assign Players</h3>

          {/* 4-Ball hint */}
          {gameType === 'fourball' && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#856404' }}>
              ⚔️ <strong>4-Ball Round Robin:</strong> All teams play against each other (6 matchups with 4 teams). Best ball per team counts on each hole. Points: Win=1, Halve=0.5.
            </div>
          )}

          <div style={{ display: 'flex', gap: '5px', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px', color: '#666' }}>
            <div style={{ flex: 2 }}>Name</div>
            <div style={{ flex: 1 }}>Team</div>
            <div style={{ flex: 1 }}>Group</div>
            <div style={{ width: '60px' }}>HCP</div>
          </div>
          {players.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <input
                placeholder="Player Name" value={p.name}
                onChange={e => handlePlayerChange(i, 'name', e.target.value)}
                style={{ flex: 2, padding: '8px' }}
              />
              <select value={p.team} onChange={e => handlePlayerChange(i, 'team', e.target.value)} style={{ flex: 1 }}>
                {['Team A', 'Team B', 'Team C', 'Team D'].map(t => (
                  <option key={t} value={t}>{t.replace('Team ', '')}</option>
                ))}
              </select>
              <select value={p.group} onChange={e => handlePlayerChange(i, 'group', e.target.value)} style={{ flex: 1 }}>
                <option value="Group 1">G1</option>
                <option value="Group 2">G2</option>
              </select>
              <select
                value={p.hcp}
                disabled={!useHandicaps}
                onChange={e => handlePlayerChange(i, 'hcp', e.target.value)}
                style={{
                  width: '65px',
                  padding: '8px',
                  opacity: useHandicaps ? 1 : 0.3,
                  fontSize: '14px'
                }}
              >
                {[...Array(26)].map((_, num) => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
          ))}
          <button onClick={savePlayers} disabled={loading} style={{ width: '100%', padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '18px', fontWeight: 'bold' }}>
            {loading ? 'Saving...' : 'Start Scorer'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
