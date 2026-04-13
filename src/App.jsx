import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabaseClient';
import StablefordGrid from './StablefordGrid';
import FourBallGrid from './FourBallGrid';
import SkinsGrid from './SkinsGrid';
import ChairmanGrid from './ChairmanGrid';
import { GOLF_COURSES, PENINSULA_NINES, combinePeninsulaNines } from './courses';

// Generate a random 6-character code
const generateMatchCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

function App() {
  const [matchId, setMatchId] = useState(null);
  const [matchCode, setMatchCode] = useState(null);
  const [matchName, setMatchName] = useState('');
  const [useHandicaps, setUseHandicaps] = useState(false);
  const [useQuota, setUseQuota] = useState(false);
  const [useCarryover, setUseCarryover] = useState(true);
  const [gameType, setGameType] = useState('stableford');
  const [loading, setLoading] = useState(false);
  const [showScorer, setShowScorer] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");

  // Join match state
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Peninsula nine selection
  const [peninsulaFront, setPeninsulaFront] = useState("Marsh");
  const [peninsulaBack, setPeninsulaBack] = useState("Lakes");

  // Recent matches state
  const [recentMatches, setRecentMatches] = useState([]);
  const [showRecentMatches, setShowRecentMatches] = useState(false);

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
    
    const code = generateMatchCode();
    
    const { data, error } = await supabase
      .from('matches')
      .insert([{ 
        match_name: matchName, 
        use_handicaps: useHandicaps,
        match_code: code,
        game_type: gameType,
        course_name: selectedCourse,
        use_quota: useQuota
      }])
      .select();

    if (error) {
      alert(error.message);
    } else {
      setMatchId(data[0].id);
      setMatchCode(code);
    }
    setLoading(false);
  };

  const joinMatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const codeUpper = joinCode.toUpperCase().trim();
    
    // Find match by code
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('match_code', codeUpper)
      .single();

    if (matchError || !matchData) {
      alert('Match not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    // Get players for this match
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        teams (
          team_name
        )
      `)
      .eq('match_id', matchData.id);

    if (playersError) {
      alert('Error loading players: ' + playersError.message);
      setLoading(false);
      return;
    }

    // Set all the match state
    setMatchId(matchData.id);
    setMatchCode(matchData.match_code);
    setMatchName(matchData.match_name);
    setUseHandicaps(matchData.use_handicaps);
    setUseQuota(matchData.use_quota || false);
    setGameType(matchData.game_type || 'stableford');
    setSelectedCourse(matchData.course_name || 'Default Course');
    setFinalPlayers(playersData);
    setShowScorer(true);
    setLoading(false);
  };

  const savePlayers = async () => {
    setLoading(true);
    try {
      const activePlayers = players.filter(p => p.name.trim() !== '');
      if (activePlayers.length === 0) {
        alert("Please enter at least one player name.");
        setLoading(false);
        return;
      }

      if (gameType === 'fourball') {
        const hasA = activePlayers.some(p => p.team === 'Team A');
        const hasB = activePlayers.some(p => p.team === 'Team B');
        if (!hasA || !hasB) {
          alert("4-Ball requires at least one player on Team A and one on Team B for the first match.");
          setLoading(false);
          return;
        }
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert(['Team A', 'Team B', 'Team C', 'Team D'].map(name => ({
          match_id: matchId,
          team_name: name
        })))
        .select();

      if (teamError) throw teamError;

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
    let ScorerComponent;
    let bannerColor = '#4CAF50';
    
    if (gameType === 'fourball') {
      ScorerComponent = FourBallGrid;
    } else if (gameType === 'skins') {
      ScorerComponent = SkinsGrid;
      bannerColor = '#FFD700';
    } else if (gameType === 'chairman') {
      ScorerComponent = ChairmanGrid;
      bannerColor = '#8B4513';
    } else {
      ScorerComponent = StablefordGrid;
    }
    
    return (
      <div>
        {/* Match code banner */}
        <div style={{ 
          background: '#1e1e1e', 
          padding: '8px 15px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: `2px solid ${bannerColor}`
        }}>
          <span style={{ color: '#888', fontSize: '12px' }}>{matchName}</span>
          <span style={{ 
            background: bannerColor, 
            color: gameType === 'skins' ? '#000' : '#fff', 
            padding: '4px 12px', 
            borderRadius: '4px', 
            fontWeight: 'bold',
            fontSize: '14px',
            letterSpacing: '2px'
          }}>
            {matchCode}
          </span>
        </div>
        <ScorerComponent
          matchId={matchId}
          matchName={matchName}
          matchCode={matchCode}
          players={finalPlayers}
          useHandicaps={useHandicaps}
          useQuota={useQuota}
          useCarryover={useCarryover}
          courseData={courseData}
          onNewMatch={() => {
            setMatchId(null);
            setMatchCode(null);
            setMatchName('');
            setShowScorer(false);
            setFinalPlayers([]);
            setSelectedCourse('');
            setUseHandicaps(false);
            setUseQuota(false);
            setGameType('stableford');
          }}
        />
      </div>
    );
  }

  const gameDescriptions = {
    stableford: 'Points-based scoring. Each player earns points per hole. Teams accumulate total points.',
    fourball: 'Match play. Each player plays their own ball; the best score on each team counts. Team A vs Team B.',
    skins: 'Individual competition. Lowest score wins the hole. Ties can carry over to the next hole.',
    chairman: 'King of the hill. Win a hole outright to become Chairman. Chairman earns 1 point for each hole won.',
  };

  const peninsulaNineNames = Object.keys(PENINSULA_NINES);

  // Fetch recent matches
  const fetchRecentMatches = async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setRecentMatches(data);
    }
    setLoading(false);
    setShowRecentMatches(true);
  };

  // Load a previous match
  const loadMatch = async (match) => {
    setLoading(true);
    
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        teams (
          team_name
        )
      `)
      .eq('match_id', match.id);

    if (playersError) {
      alert('Error loading players: ' + playersError.message);
      setLoading(false);
      return;
    }

    setMatchId(match.id);
    setMatchCode(match.match_code);
    setMatchName(match.match_name);
    setUseHandicaps(match.use_handicaps);
    setUseQuota(match.use_quota || false);
    setGameType(match.game_type || 'stableford');
    setSelectedCourse(match.course_name || '');
    setFinalPlayers(playersData);
    setShowScorer(true);
    setShowRecentMatches(false);
    setLoading(false);
  };

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // --- Join Match Form ---
  if (showJoinForm) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
        <h1>⛳️ Join Match</h1>
        <form onSubmit={joinMatch} style={{ background: '#f4f4f4', padding: '30px', borderRadius: '10px' }}>
          <p style={{ color: '#666', marginBottom: '20px' }}>Enter the 6-character match code</p>
          <input
            type="text"
            placeholder="ABC123"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            style={{ 
              width: '100%', 
              padding: '20px', 
              fontSize: '28px', 
              textAlign: 'center', 
              letterSpacing: '8px',
              fontWeight: 'bold',
              boxSizing: 'border-box',
              borderRadius: '8px',
              border: '2px solid #ccc',
              textTransform: 'uppercase'
            }}
            required
          />
          <button 
            type="submit" 
            disabled={loading || joinCode.length !== 6}
            style={{ 
              width: '100%', 
              padding: '15px', 
              marginTop: '20px', 
              backgroundColor: joinCode.length === 6 ? '#28a745' : '#ccc', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px', 
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: joinCode.length === 6 ? 'pointer' : 'not-allowed'
            }}
          >
            {loading ? 'Joining...' : 'Join Match'}
          </button>
          <button 
            type="button"
            onClick={() => setShowJoinForm(false)}
            style={{ 
              width: '100%', 
              padding: '12px', 
              marginTop: '10px', 
              backgroundColor: 'transparent', 
              color: '#666', 
              border: '1px solid #ccc', 
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '700px', margin: 'auto' }}>
      <h1>⛳️ Golf Tracker</h1>

      {!matchId ? (
        <>
          {/* Create or Join buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => setShowJoinForm(true)}
              style={{
                flex: 1,
                padding: '15px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              🔗 Join Match
            </button>
            <button
              onClick={fetchRecentMatches}
              style={{
                flex: 1,
                padding: '15px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              📋 Previous Matches
            </button>
          </div>

          {/* Recent Matches List */}
          {showRecentMatches && (
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: '#333' }}>📋 Recent Matches (Last 30 Days)</h4>
                <button 
                  onClick={() => setShowRecentMatches(false)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
                >
                  ✕
                </button>
              </div>
              {recentMatches.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center', margin: '20px 0' }}>No matches found in the last 30 days</p>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {recentMatches.map(match => (
                    <div 
                      key={match.id}
                      onClick={() => loadMatch(match)}
                      style={{ 
                        background: '#fff', 
                        padding: '12px', 
                        borderRadius: '8px', 
                        marginBottom: '8px',
                        cursor: 'pointer',
                        border: '1px solid #ddd',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = '#e8f4f8'}
                      onMouseOut={e => e.currentTarget.style.background = '#fff'}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#333' }}>{match.match_name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {match.course_name || 'No course'} • {match.game_type === 'fourball' ? '4-Ball' : 'Stableford'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          background: '#17a2b8', 
                          color: '#fff', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          fontSize: '12px',
                          fontWeight: 'bold',
                          letterSpacing: '1px'
                        }}>
                          {match.match_code}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                          {formatDate(match.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={createMatch} style={{ background: '#f4f4f4', padding: '20px', borderRadius: '10px' }}>
            <h3>1. Create New Match</h3>

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
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[
                  { value: 'stableford', label: '🏆 Stableford' },
                  { value: 'fourball', label: '⚔️ 4-Ball' },
                  { value: 'skins', label: '🎰 Skins' },
                  { value: 'chairman', label: '👑 Chairman' },
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
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                required
              >
                <option value="" disabled>Select Course</option>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
              <input type="checkbox" checked={useQuota} onChange={e => setUseQuota(e.target.checked)} />
              Enable Quota Game (Goal = 36 − Handicap)
            </label>

            {/* --- Carryover Skins Toggle (only for skins game) --- */}
            {gameType === 'skins' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '5px' }}>
                <input type="checkbox" checked={useCarryover} onChange={e => setUseCarryover(e.target.checked)} />
                Carryover Skins (ties carry to next hole)
              </label>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
              {loading ? 'Creating...' : 'Create Match'}
            </button>
          </form>
        </>
      ) : (
        <div>
          {/* Show match code prominently */}
          <div style={{ 
            background: '#d4edda', 
            border: '2px solid #28a745', 
            borderRadius: '10px', 
            padding: '20px', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#155724', marginBottom: '8px' }}>
              Share this code with your group:
            </div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: 'bold', 
              letterSpacing: '6px', 
              color: '#155724',
              fontFamily: 'monospace'
            }}>
              {matchCode}
            </div>
          </div>

          <h3>2. Assign Players</h3>

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
