import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabaseClient';
import StablefordGrid from './StablefordGrid';
import FourBallGrid from './FourBallGrid';
import SkinsGrid from './SkinsGrid';
import ChairmanGrid from './ChairmanGrid';
import NinePointGrid from './NinePointGrid';
import SinglesGrid from './SinglesGrid';
import NassauGrid from './NassauGrid';
import VegasGrid from './VegasGrid';
import WolfGrid from './WolfGrid';
import WolfVegasGrid from './WolfVegasGrid';
import AggregateGrid from './AggregateGrid';
import GolfGPSWidget from './GolfGPSWidget';
import RequestCourseForm from './components/RequestCourseForm';
import ReportCourseIssue from './components/ReportCourseIssue';
import { gameDescriptions, gameRecentLabels } from './lib/gameRegistry';

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
  const [scoringMode, setScoringMode] = useState(''); // '', 'gross', or 'net'
  const [useCarryover, setUseCarryover] = useState(true);
  const [gameType, setGameType] = useState('');
  const [playMode, setPlayMode] = useState('');
  const [holesCount, setHolesCount] = useState(18);
  const [startHole, setStartHole] = useState(1);
  const [playOffLow, setPlayOffLow] = useState(true);
  const [hcpAllowance, setHcpAllowance] = useState(100);
  const [loading, setLoading] = useState(false);
  const [showScorer, setShowScorer] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTeeBoxId, setSelectedTeeBoxId] = useState("");

  // Join match state
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Peninsula nine selection
  const [peninsulaFront, setPeninsulaFront] = useState("Marsh");
  const [peninsulaBack, setPeninsulaBack] = useState("Lakes");

  // Recent matches state
  const [recentMatches, setRecentMatches] = useState([]);
  const [showRecentMatches, setShowRecentMatches] = useState(false);

  // Course request/issue state
  const [showRequestCourse, setShowRequestCourse] = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);

  const [globalPlayers, setGlobalPlayers] = useState([]);
  const [newGlobalPlayerName, setNewGlobalPlayerName] = useState('');
  const [newGlobalPlayerHcp, setNewGlobalPlayerHcp] = useState(0);

  const [players, setPlayers] = useState([
    { name: '', team: '', hcp: 0, isGuest: false }
  ]);
  const [golfCourses, setGolfCourses] = useState([]);
  const [teeBoxes, setTeeBoxes] = useState([]);
  const [dbCourses, setDbCourses] = useState([]); // Keep for Peninsula compatibility

  useEffect(() => {
    fetchGlobalPlayers();
    fetchGolfCourses();
    fetchDbCourses(); // Keep for Peninsula
  }, []);

  const fetchGolfCourses = async () => {
    const { data, error } = await supabase
      .from('golf_courses')
      .select(`
        id,
        name,
        location,
        holes,
        greens,
        tee_boxes (
          id,
          tee_name,
          tee_color,
          rating,
          slope,
          par,
          stroke_index,
          yardage
        )
      `)
      .order('name');

    if (data && !error) {
      setGolfCourses(data);
    }
  };

  const fetchDbCourses = async () => {
    const { data, error } = await supabase.from('courses').select('*').order('name');
    if (data && !error) setDbCourses(data);
  };

  const fetchGlobalPlayers = async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .is('match_id', null)
      .order('player_name');
    if (data && !error) {
      setGlobalPlayers(data);
    }
  };

  const handleCreateGlobalPlayer = async (e) => {
    e.preventDefault();
    if (!newGlobalPlayerName.trim()) return;
    const { error } = await supabase.from('players').insert([{
      player_name: newGlobalPlayerName.trim(),
      handicap: newGlobalPlayerHcp,
      match_id: null,
      team_id: null
    }]);
    if (error) {
      alert('Error creating player: ' + error.message);
    } else {
      setNewGlobalPlayerName('');
      setNewGlobalPlayerHcp(0);
      fetchGlobalPlayers(); // Refresh the dropdown list
    }
  };

  const updatePlayer = (index, updates) => {
    let updatedPlayers = [...players];
    updatedPlayers[index] = { ...updatedPlayers[index], ...updates };
    
    // Auto-add next row if a name was just selected/typed in the last row
    if (updates.name !== undefined && updates.name.trim() !== '' && index === updatedPlayers.length - 1) {
      if (gameType !== 'ninepoint' || updatedPlayers.length < 3) {
        updatedPlayers.push({ name: '', team: '', hcp: 0, isGuest: false });
      }
    }
    
    setPlayers(updatedPlayers);
  };

  const handlePlayerChange = (index, field, value) => {
    updatePlayer(index, { [field]: field === 'hcp' ? (parseInt(value, 10) || 0) : value });
  };

  // Get available tee boxes for selected course
  const availableTeeBoxes = useMemo(() => {
    if (!selectedCourseId) return [];
    const course = golfCourses.find(c => c.id === selectedCourseId);
    return course?.tee_boxes || [];
  }, [selectedCourseId, golfCourses]);

  // Auto-select first tee box when course changes
  useEffect(() => {
    if (availableTeeBoxes.length > 0 && !selectedTeeBoxId) {
      setSelectedTeeBoxId(availableTeeBoxes[0].id);
    } else if (availableTeeBoxes.length === 0) {
      // Clear tee box if no tees available
      setSelectedTeeBoxId('');
    }
  }, [availableTeeBoxes]);

  // Build the course data (handles both new schema and Peninsula)
  const courseData = useMemo(() => {
    // Handle Peninsula (old schema)
    if (selectedCourseId === 'Peninsula Golf Club') {
      const front = dbCourses.find(c => c.name === peninsulaFront);
      const back = dbCourses.find(c => c.name === peninsulaBack);
      if (!front || !back) return { pars: Array(18).fill(4), handicaps: Array(18).fill(10) };

      const newHandicaps = [...front.stroke_index, ...back.stroke_index].map((hcp, i) => {
        return i < 9 ? (hcp * 2) - 1 : (hcp * 2);
      });
      return {
        pars: [...front.par, ...back.par],
        handicaps: newHandicaps,
        slope: front.slope && back.slope ? Math.round((front.slope + back.slope) / 2) : null,
        rating: front.rating && back.rating ? front.rating + back.rating : null,
        greens: [...(front.greens || []), ...(back.greens || [])]
      };
    }

    // New schema: course + tee box
    if (!selectedTeeBoxId) return { pars: Array(18).fill(4), handicaps: Array(18).fill(10) };

    const course = golfCourses.find(c => c.id === selectedCourseId);
    const teeBox = course?.tee_boxes.find(tb => tb.id === selectedTeeBoxId);

    if (!course || !teeBox) return { pars: Array(18).fill(4), handicaps: Array(18).fill(10) };

    return {
      pars: teeBox.par,
      handicaps: teeBox.stroke_index,
      slope: teeBox.slope,
      rating: teeBox.rating,
      greens: course.greens || [],
      yardage: teeBox.yardage || []
    };
  }, [selectedCourseId, selectedTeeBoxId, peninsulaFront, peninsulaBack, golfCourses, dbCourses]);

  // All course options (new schema + Peninsula special case)
  const courseOptions = useMemo(() => {
    const newCourses = golfCourses.map(c => ({ id: c.id, name: c.name }));
    // Add Peninsula if old 9-hole courses exist
    if (dbCourses.some(c => c.holes === 9)) {
      return [...newCourses, { id: 'Peninsula Golf Club', name: 'Peninsula Golf Club' }];
    }
    return newCourses;
  }, [golfCourses, dbCourses]);

  // Get selected course name for display
  const selectedCourseName = useMemo(() => {
    if (selectedCourseId === 'Peninsula Golf Club') return 'Peninsula Golf Club';
    const course = golfCourses.find(c => c.id === selectedCourseId);
    return course?.name || '';
  }, [selectedCourseId, golfCourses]);

  const createMatch = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation: ensure tee box is selected for non-Peninsula courses
    if (selectedCourseId !== 'Peninsula Golf Club' && !selectedTeeBoxId) {
      alert('Please select a tee box before creating the match.');
      setLoading(false);
      return;
    }

    const code = generateMatchCode();

    const { data, error } = await supabase
      .from('matches')
      .insert([{
        use_handicaps: useHandicaps,
        match_code: code,
        game_type: gameType,
        course_name: selectedCourseName,
        course_id: selectedCourseId === 'Peninsula Golf Club' ? null : (selectedCourseId || null),
        tee_box_id: selectedCourseId === 'Peninsula Golf Club' ? null : (selectedTeeBoxId || null),
        holes: holesCount,
        start_hole: startHole,
        play_off_low: playOffLow,
        handicap_allowance_pct: hcpAllowance
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
    setGameType(matchData.game_type || 'stableford');
    setSelectedCourseId(matchData.course_id || 'Peninsula Golf Club');
    setSelectedTeeBoxId(matchData.tee_box_id || '');
    setHolesCount(matchData.holes || 18);
    setStartHole(matchData.start_hole || 1);
    setPlayOffLow(matchData.play_off_low ?? true);
    setHcpAllowance(matchData.handicap_allowance_pct || 100);
    setFinalPlayers(playersData);
    setShowScorer(true);
    setLoading(false);
  };

  const savePlayers = async () => {
    setLoading(true);
    try {
      const activePlayers = players.filter(p => p.name.trim() !== '');
      if (activePlayers.length === 0) {
        alert("Please select at least one player.");
        setLoading(false);
        return;
      }

      // Auto-assign teams for Singles or Singles Play Mode
      if (gameType === 'singles' || playMode === 'singles') {
        activePlayers.forEach((p, idx) => {
          p.team = `Player ${idx + 1}`;
        });
      }

      const missingTeams = activePlayers.some(p => !p.team);
      if (missingTeams) {
        alert("Please assign a team to all selected players.");
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

      if (gameType === 'ninepoint' && activePlayers.length !== 3) {
        alert("9-Point requires exactly 3 players.");
        setLoading(false);
        return;
      }

      if (gameType === 'nassau' && holesCount !== 18) {
        alert("Nassau requires a full 18-hole round (front 9, back 9, and overall).");
        setLoading(false);
        return;
      }

      const distinctTeams = [...new Set(activePlayers.map(p => p.team))];
      const teamMapping = {};

      for (const t of distinctTeams) {
        const teamPlayers = activePlayers.filter(p => p.team === t);
        const teamName = teamPlayers.map(p => {
          const parts = p.name.trim().split(/\s+/);
          if (parts.length === 1) {
            return parts[0][0].toUpperCase();
          } else {
            return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
          }
        }).join('-');
        
        teamMapping[t] = teamName;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert(distinctTeams.map(t => ({
          match_id: matchId,
          team_name: teamMapping[t]
        })))
        .select();

      if (teamError) throw teamError;

      const playersToInsert = activePlayers.map(p => ({
        match_id: matchId,
        player_name: p.name,
        team_id: teamData.find(t => t.team_name === teamMapping[p.team]).id,
        physical_group: null,
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
    // Dynamically calculate Effective Handicap (Pops) based on WHS formula
    const getEffectiveHandicaps = () => {
      if (!useHandicaps) return finalPlayers.map(p => ({ ...p, handicap: 0 }));
      
      const slope = courseData?.slope;
      const rating = courseData?.rating;
      const pars = courseData?.pars || Array(18).fill(4);
      const parTotal = pars.slice(0, holesCount).reduce((a, b) => a + b, 0);

      const getCourseHcp = (rawHcp) => {
        if (!slope || !rating || slope <= 0 || rating <= 0) return rawHcp;
        const ch = (rawHcp * slope / 113.0) + (rating - parTotal);
        return Math.max(0, Math.round(ch));
      };

      const getAllowanceAdj = (cHcp) => {
        if (cHcp <= 0) return 0;
        return Math.round(cHcp * (hcpAllowance / 100));
      };

      let pData = finalPlayers.map(p => {
        const raw = p.handicap || 0;
        const c = getCourseHcp(raw);
        const a = getAllowanceAdj(c);
        return { ...p, _allowanceHcp: a };
      });

      if (playOffLow && pData.length > 0) {
        const minHcp = Math.min(...pData.map(p => p._allowanceHcp));
        pData = pData.map(p => ({
          ...p,
          effectiveHcp: Math.max(0, p._allowanceHcp - minHcp)
        }));
      } else {
        pData = pData.map(p => ({ ...p, effectiveHcp: p._allowanceHcp }));
      }

      return pData.map(p => ({
         ...p,
         handicap: p.effectiveHcp // Override the raw DB handicap before passing to grids
      }));
    };

    const playersWithPops = getEffectiveHandicaps();

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
    } else if (gameType === 'ninepoint') {
      ScorerComponent = NinePointGrid;
      bannerColor = '#00BCD4';
    } else if (gameType === 'singles') {
      ScorerComponent = SinglesGrid;
      bannerColor = '#9C27B0';
    } else if (gameType === 'nassau') {
      ScorerComponent = NassauGrid;
      bannerColor = '#0D47A1';
    } else if (gameType === 'vegas') {
      ScorerComponent = VegasGrid;
      bannerColor = '#E91E63';
    } else if (gameType === 'wolf') {
      ScorerComponent = WolfGrid;
      bannerColor = '#607D8B';
    } else if (gameType === 'wolfvegas') {
      ScorerComponent = WolfVegasGrid;
      bannerColor = '#AB47BC';
    } else if (gameType === 'aggregate') {
      ScorerComponent = AggregateGrid;
      bannerColor = '#26A69A';
    } else {
      ScorerComponent = StablefordGrid;
    }
    
    return (
      <div>
        {/* Match code banner */}
        <div style={{ 
          background: '#1e1e1e', 
          padding: '8px 15px',
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingLeft: 'max(15px, env(safe-area-inset-left))',
          paddingRight: 'max(15px, env(safe-area-inset-right))',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: `2px solid ${bannerColor}`
        }}>
          <span style={{ color: '#888', fontSize: '12px' }}>{selectedCourseName}</span>
          <GolfGPSWidget courseData={courseData} matchId={matchId} players={playersWithPops} courseName={selectedCourseName} />
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
          players={playersWithPops}
          useHandicaps={useHandicaps}
          useCarryover={useCarryover}
          courseData={courseData}
          holesCount={holesCount}
          startHole={startHole}
          initialIsTeamPlay={playMode === 'team'}
          onNewMatch={() => {
            setMatchId(null);
            setMatchCode(null);
            setMatchName('');
            setShowScorer(false);
            setFinalPlayers([]);
            setSelectedCourseId('');
            setSelectedTeeBoxId('');
            setUseHandicaps(false);
            setGameType('');
            setPlayMode('');
            setHolesCount('');
            setStartHole('');
            setPlayOffLow(true);
            setHcpAllowance('');
          }}
        />
      </div>
    );
  }

  const peninsulaNineNames = dbCourses.filter(c => c.holes === 9).map(c => c.name);

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
    setGameType(match.game_type || 'stableford');
    setSelectedCourseId(match.course_id || 'Peninsula Golf Club');
    setSelectedTeeBoxId(match.tee_box_id || '');
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
          <img src="/logo.png" alt="4Play Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '15px', marginBottom: '10px' }} />
          <h1 style={{ margin: 0, fontSize: '28px', color: '#1b365d', fontWeight: 'bold' }}>Join Round</h1>
        </div>
        <form onSubmit={joinMatch} style={{ background: '#f4f4f4', padding: '30px', borderRadius: '10px' }}>
          <p style={{ color: '#666', marginBottom: '20px' }}>Enter the 6-character round code</p>
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
            {loading ? 'Joining...' : 'Join Round'}
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
    <div style={{ padding: '10px', fontFamily: 'sans-serif', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Request Course Modal */}
      {showRequestCourse && (
        <RequestCourseForm
          onClose={() => setShowRequestCourse(false)}
          onSuccess={async (newCourseId) => {
            await fetchGolfCourses(); // Refresh course list
            if (newCourseId) {
              // Auto-select the newly created course
              setTimeout(() => {
                setSelectedCourseId(newCourseId);
              }, 100); // Small delay to ensure state is updated
            }
          }}
        />
      )}

      {/* Report Issue Modal */}
      {showReportIssue && selectedCourseId && (
        <ReportCourseIssue
          courseId={selectedCourseId}
          courseName={selectedCourseName}
          teeBoxId={selectedTeeBoxId}
          onClose={() => setShowReportIssue(false)}
        />
      )}

      {matchId && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px' }}>
          <img src="/logo.png" alt="4Play Logo" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '12px' }} />
        </div>
      )}

      {!matchId ? (
        <>
          {/* Recent Matches Overlay */}
          {showRecentMatches && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowRecentMatches(false); }}
            >
              <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexShrink: 0 }}>
                  <h4 style={{ margin: 0, color: '#333' }}>📋 Recent Rounds (Last 30 Days)</h4>
                  <button 
                    onClick={() => setShowRecentMatches(false)}
                    style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#666', padding: '5px' }}
                  >
                    ✕
                  </button>
                </div>
                {recentMatches.length === 0 ? (
                  <p style={{ color: '#666', textAlign: 'center', margin: '20px 0' }}>No rounds found in the last 30 days</p>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {recentMatches.map(match => (
                      <div 
                        key={match.id}
                        onClick={() => loadMatch(match)}
                        style={{ 
                          background: '#f8f9fa', 
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
                        onMouseOut={e => e.currentTarget.style.background = '#f8f9fa'}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#333' }}>{match.course_name || 'No course'}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {gameRecentLabels[match.game_type] || match.game_type || 'Unknown'}
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
            </div>
          )}

          <form onSubmit={createMatch} style={{ background: '#f4f4f4', padding: '20px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <img src="/logo.png" alt="4Play Logo" style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '15px' }} />
            </div>

            {/* --- Course Selector --- */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setSelectedTeeBoxId(''); // Reset tee box when course changes
                  }}
                  style={{ flex: 1, padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                  required
                >
                  <option value="" disabled>Select Course</option>
                  {courseOptions.map(course => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowRequestCourse(true)}
                  style={{
                    padding: '12px 15px',
                    background: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: 'bold'
                  }}
                  title="Request a course"
                >
                  +
                </button>
              </div>
              {selectedCourseId && selectedCourseId !== 'Peninsula Golf Club' && (
                <button
                  type="button"
                  onClick={() => setShowReportIssue(true)}
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#dc3545',
                    border: '1px solid #dc3545',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%'
                  }}
                >
                  🐛 Report Issue with This Course
                </button>
              )}
            </div>

            {/* --- Tee Box Selector --- */}
            {selectedCourseId && selectedCourseId !== 'Peninsula Golf Club' && availableTeeBoxes.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <select
                  value={selectedTeeBoxId}
                  onChange={(e) => setSelectedTeeBoxId(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                  required
                >
                  <option value="" disabled>Select Tees</option>
                  {availableTeeBoxes.map(tee => (
                    <option key={tee.id} value={tee.id}>
                      {tee.tee_name} {tee.rating && tee.slope ? `(${tee.rating}/${tee.slope})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* --- Holes, Start Hole Selector --- */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Holes</label>
                <select
                  value={holesCount}
                  onChange={e => setHolesCount(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                  required
                >
                  <option value={9}>9</option>
                  <option value={18}>18</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>Starting Hole</label>
                <select
                  value={startHole}
                  onChange={e => setStartHole(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                  required
                >
                  <option value={1}>1</option>
                  <option value={10}>10</option>
                </select>
              </div>
            </div>

            {/* --- Peninsula Nine Selection --- */}
            {selectedCourseId === 'Peninsula Golf Club' && (
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

            {/* --- Game Type Selector --- */}
            <div style={{ marginBottom: '15px' }}>
              <select
                value={gameType}
                onChange={(e) => {
                  const gt = e.target.value;
                  setGameType(gt);
                  // Auto-set play mode based on game type
                  if (['fourball', 'vegas', 'aggregate'].includes(gt)) {
                    setPlayMode('team');
                  } else if (['ninepoint', 'singles', 'wolf', 'wolfvegas'].includes(gt)) {
                    setPlayMode('singles');
                  }
                }}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                required
              >
                <option value="" disabled>Select Game Type</option>
                <option value="stableford">Stableford</option>
                <option value="fourball">4-Ball</option>
                <option value="skins">Skins</option>
                <option value="chairman">Chairman</option>
                <option value="ninepoint">9-Point</option>
                <option value="singles">Singles</option>
                <option value="nassau" disabled={holesCount !== 18}>Nassau {holesCount !== 18 ? '(18 holes only)' : ''}</option>
                <option value="vegas">Vegas</option>
                <option value="wolf">Wolf</option>
                <option value="wolfvegas">Wolf Vegas</option>
                <option value="aggregate">2-Ball Aggregate</option>
              </select>
              {gameType && (
                <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', marginBottom: 0 }}>
                  {gameDescriptions[gameType]}
                </p>
              )}
              {gameType === 'nassau' && holesCount !== 18 && (
                <p style={{ fontSize: '12px', color: '#c0392b', marginTop: '6px', marginBottom: 0, fontWeight: 'bold' }}>
                  ⚠️ Nassau requires 18 holes (front 9, back 9, overall). Switch Holes to 18.
                </p>
              )}
            </div>

            {/* --- Play Mode Selector --- */}
            <div style={{ marginBottom: '15px' }}>
              <select
                value={playMode}
                onChange={e => setPlayMode(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                required
                disabled={['fourball', 'vegas', 'aggregate', 'ninepoint', 'singles', 'wolf', 'wolfvegas'].includes(gameType)}
              >
                <option value="" disabled>Play Mode</option>
                {!['ninepoint', 'singles', 'wolf', 'wolfvegas'].includes(gameType) && (
                  <option value="team">Team Play</option>
                )}
                {!['fourball', 'vegas', 'aggregate'].includes(gameType) && (
                  <option value="singles">Singles</option>
                )}
              </select>
            </div>

            {/* --- Scoring Mode & HCP% Selectors --- */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <select
                  value={scoringMode}
                  onChange={e => {
                    const v = e.target.value;
                    setScoringMode(v);
                    setUseHandicaps(v === 'net');
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                >
                  <option value="">Scoring Mode</option>
                  <option value="gross">Gross</option>
                  <option value="net">Net (Handicaps)</option>
                </select>
              </div>
              {useHandicaps && (
                <div style={{ flex: 1 }}>
                  <select
                    value={hcpAllowance}
                    onChange={e => setHcpAllowance(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
                    required
                  >
                    <option value="" disabled>HCP%</option>
                    <option value={100}>100%</option>
                    <option value={90}>90%</option>
                    <option value={80}>80%</option>
                    <option value={70}>70%</option>
                    <option value={60}>60%</option>
                    <option value={50}>50%</option>
                  </select>
                </div>
              )}
            </div>

            {useHandicaps && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px', fontSize: '13px' }}>
                <input type="checkbox" checked={playOffLow} onChange={e => setPlayOffLow(e.target.checked)} />
                Play Off Low (subtract lowest handicap from all players)
              </label>
            )}


            {/* --- Carryover Skins Toggle (only for skins game) --- */}
            {gameType === 'skins' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '5px' }}>
                <input type="checkbox" checked={useCarryover} onChange={e => setUseCarryover(e.target.checked)} />
                Carryover Skins (ties carry to next hole)
              </label>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
              {loading ? 'Starting...' : 'Start Round'}
            </button>
          </form>

          {/* Create or Join buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
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
              Join Round
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
              Previous Rounds
            </button>
          </div>
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
            <div style={{ flex: 2 }}>Player</div>
            {gameType !== 'singles' && playMode !== 'singles' && <div style={{ flex: 1 }}>Team</div>}
            <div style={{ width: '60px' }}>HCP</div>
            <div style={{ width: '30px' }}></div>
          </div>
          {players.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              {p.isGuest ? (
                <div style={{ flex: 2, display: 'flex', gap: '5px' }}>
                  <input 
                    autoFocus
                    placeholder="Guest Name"
                    value={p.name}
                    onChange={e => updatePlayer(i, { name: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => updatePlayer(i, { isGuest: false, name: '' })}
                    style={{ padding: '8px', background: '#e9ecef', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                    title="Cancel guest"
                  >
                    ↺
                  </button>
                </div>
              ) : (
                <select
                  value={p.name}
                  onChange={e => {
                    const selectedName = e.target.value;
                    if (selectedName === '__GUEST__') {
                      updatePlayer(i, { isGuest: true, name: '', hcp: 0 });
                    } else {
                      const globalP = globalPlayers.find(gp => gp.player_name === selectedName);
                      updatePlayer(i, { 
                        name: selectedName, 
                        hcp: globalP ? globalP.handicap : p.hcp 
                      });
                    }
                  }}
                  style={{ flex: 2, padding: '8px' }}
                >
                  <option value="">-- Select Player --</option>
                  {globalPlayers
                    .filter(gp => !players.some((pl, pi) => pi !== i && pl.name === gp.player_name))
                    .map(gp => (
                      <option key={gp.id} value={gp.player_name}>{gp.player_name}</option>
                    ))}
                  <option value="__GUEST__">+ Add Guest Player</option>
                </select>
              )}
              {gameType !== 'singles' && playMode !== 'singles' && (
                <select value={p.team} onChange={e => handlePlayerChange(i, 'team', e.target.value)} style={{ flex: 1 }}>
                  <option value="">-- Team --</option>
                  {['Team A', 'Team B', 'Team C', 'Team D'].map(t => (
                    <option key={t} value={t}>{t.replace('Team ', '')}</option>
                  ))}
                </select>
              )}
              <select
                value={p.hcp}
                onChange={e => handlePlayerChange(i, 'hcp', e.target.value)}
                style={{
                  width: '65px',
                  padding: '8px',
                  fontSize: '14px'
                }}
              >
                {[...Array(40)].map((_, num) => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
              <button 
                type="button" 
                onClick={() => {
                  const newPlayers = [...players];
                  newPlayers.splice(i, 1);
                  setPlayers(newPlayers);
                }}
                style={{ width: '30px', padding: '8px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                X
              </button>
            </div>
          ))}


          {/* New Global Player Form */}
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ddd' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#333' }}>Save New Player to Database</h4>
            <div style={{ display: 'flex', gap: '5px' }}>
              <input 
                type="text" 
                placeholder="Name" 
                value={newGlobalPlayerName}
                onChange={e => setNewGlobalPlayerName(e.target.value)}
                style={{ flex: 2, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <select 
                value={newGlobalPlayerHcp} 
                onChange={e => setNewGlobalPlayerHcp(parseInt(e.target.value) || 0)}
                style={{ width: '65px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                {[...Array(40)].map((_, i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <button 
                type="button" 
                onClick={handleCreateGlobalPlayer}
                disabled={!newGlobalPlayerName.trim()}
                style={{ padding: '8px 12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>

          <button onClick={savePlayers} disabled={loading} style={{ width: '100%', padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>
            {loading ? 'Starting...' : 'Start Round'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
