# Golf App Game Mode Standards

This document defines the standard architecture and patterns for implementing game modes in the golf scoring app. Follow this guide when creating new game modes or updating existing ones to ensure consistency.

---

## Game Mode Checklist

When creating or updating a game mode, verify each of these requirements:

### 1. **Game Configuration**
- [ ] Supports Singles Play (individual competition)
- [ ] Supports Team Play (teams competing)
- [ ] Supports Net Scoring (with handicaps)
- [ ] Supports Gross Scoring (without handicaps)

### 2. **Data Access Patterns**
- [ ] Import team helpers: `import { getPlayerTeam, activeTeams, getTeamPlayers } from './lib/teams'`
- [ ] Use `getPlayerTeam(player)` instead of `player.team` directly
- [ ] Use `activeTeams(players)` to get list of team names
- [ ] Use standard handicap access: `player.handicap ?? player.hcp ?? 0`

### 3. **Leaderboard Display (Above Scorecard)**
- [ ] Has clear header with emoji and game name (e.g., "🎰 Vegas Leaderboard")
- [ ] Shows running scores/standings for teams OR individuals
- [ ] Updates in real-time as scores change
- [ ] Uses consistent styling (flexbox layout, team colors)
- [ ] Located between top of screen and scorecard table

### 4. **Scorecard Table**
- [ ] Sticky header with hole numbers and pars
- [ ] OUT/IN columns for 18-hole rounds
- [ ] TOT column for total strokes
- [ ] Game-specific scoring columns (if needed)
- [ ] Uses GolfScoreTile component for score input
- [ ] Shows handicap strokes indicators (dots) when applicable
- [ ] Per-hole winning indicators (if applicable)

### 5. **Summary Screen (MatchSummary.jsx)**
- [ ] Team standings section (if team play)
- [ ] Individual leaderboard section
- [ ] Game-specific scoring logic included
- [ ] Proper sorting (by relevant metric)
- [ ] Excludes irrelevant columns (e.g., no points column for Vegas)
- [ ] Shows correct labels for game type

### 6. **Scoring Logic**
- [ ] Scoring calculation function is clearly named
- [ ] Handles incomplete data (missing scores, partial rounds)
- [ ] Uses net strokes when handicaps enabled
- [ ] Consistent calculation in both Grid and Summary components

---

## Standard File Structure

Each game mode should follow this structure:

```
src/
├── [GameName]Grid.jsx        # Main scorecard component
├── MatchSummary.jsx          # Summary screen (shared, with game-specific logic)
└── lib/
    └── teams.js              # Shared team helper functions
```

---

## Component Architecture

### Grid Component (e.g., VegasGrid.jsx)

**Required Props:**
```javascript
{
  matchId,           // UUID of the match
  matchName,         // Display name
  matchCode,         // Join code
  players,           // Array of player objects
  useHandicaps,      // Boolean - net vs gross
  courseData,        // { pars: [], handicaps: [] }
  onNewMatch,        // Callback for new match
  holesCount,        // 9 or 18
  startHole          // Starting hole number
}
```

**Required State:**
```javascript
const [scores, setScores] = useState({});     // Player scores
const [showSummary, setShowSummary] = useState(false);
```

**Required Functions:**
```javascript
// Calculate net strokes (with handicap adjustments)
const calculateNetStrokes = (strokes, holeIndex, playerHandicap) => { ... }

// Fetch and sync scores from Supabase
useEffect(() => { ... }, [matchId])

// Save score to database
const saveScore = async (playerId, holeNum, strokes) => { ... }

// Game-specific scoring logic
const calculate[GameName]Points = (holeIndex) => { ... }
```

---

## UI Layout Standards

### 1. Leaderboard Section (Above Scorecard)

**Structure:**
```jsx
<div style={{ 
  flexShrink: 0, 
  background: '#1e1e1e', 
  padding: '15px', 
  borderRadius: '12px',
  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
  marginBottom: '15px',
  borderBottom: '2px solid [GAME_COLOR]'
}}>
  {/* Header */}
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    borderBottom: '1px solid #333',
    paddingBottom: '8px'
  }}>
    <span style={{ 
      fontSize: '11px',
      color: '#888',
      fontWeight: 'bold',
      textTransform: 'uppercase'
    }}>
      [EMOJI] [Game Name] Leaderboard
    </span>
  </div>
  
  {/* Scores Display */}
  <div style={{ 
    display: 'flex',
    justifyContent: 'space-around',
    gap: '10px',
    textAlign: 'center'
  }}>
    {/* Team/Player scores mapped here */}
  </div>
</div>
```

**Game Colors:**
- Stableford: `#4CAF50` (green)
- Vegas: `#E91E63` (pink/red)
- Chairman: `#9C27B0` (purple)
- Four-ball: `#4CAF50` (green)
- Nine Point: `#00BCD4` (cyan)
- Singles: `#2196F3` (blue)

### 2. Score Display Format

**For Teams:**
```jsx
<div key={teamName} style={{ flex: 1, minWidth: '80px' }}>
  <div style={{ 
    fontSize: '10px',
    color: '#888',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }}>
    {teamName.replace('Team ', '')}
  </div>
  <div style={{ 
    fontSize: '24px',
    fontWeight: '900',
    color: '[GAME_COLOR]'
  }}>
    {teamTotal}
  </div>
</div>
```

**For Individuals:**
```jsx
<div key={playerId} style={{ flex: 1, minWidth: '80px' }}>
  <div style={{ 
    fontSize: '10px',
    color: '#888',
    fontWeight: 'bold'
  }}>
    {playerName}
  </div>
  <div style={{ 
    fontSize: '24px',
    fontWeight: '900',
    color: '[GAME_COLOR]'
  }}>
    {playerScore}
  </div>
</div>
```

---

## Summary Screen Standards (MatchSummary.jsx)

### Game-Specific Logic Sections

**1. Add Scoring Calculation:**
```javascript
// Calculate [GameName] points
const calculate[GameName] = () => {
  // Game-specific logic here
  return teamTotals; // or playerTotals
};

const [gameName]Totals = gameType === '[gamename]' ? calculate[GameName]() : {};
```

**2. Update Team Standings Sort:**
```javascript
const sortedTeams = gameType === 'fourball'
  ? [...activeTeams].sort((a, b) => fourBallStandings[b].points - fourBallStandings[a].points)
  : gameType === 'chairman'
    ? [...activeTeamsList].sort((a, b) => chairmanTeamPoints[b] - chairmanTeamPoints[a])
    : gameType === '[gamename]'
      ? [...activeTeamsList].sort((a, b) => [gamename]TeamTotals[b] - [gamename]TeamTotals[a])
      : // ... other games
```

**3. Update Team Standings Display:**
```javascript
const stats = gameType === 'fourball'
  ? fourBallStandings[teamName]
  : gameType === 'chairman'
    ? { points: chairmanTeamPoints[teamName] }
    : gameType === '[gamename]'
      ? { points: [gamename]TeamTotals[teamName] }
      : stablefordTeamTotals[teamName];
```

**4. Add to Header Conditions:**
```javascript
{gameType === 'fourball' || gameType === 'chairman' || gameType === '[gamename]' ? 'Individual Scores' : 'Individual Leaderboard'}
```

**5. Add to Column Exclusions:**
```javascript
{gameType !== 'fourball' && gameType !== 'chairman' && gameType !== '[gamename]' && (
  <th>Points</th>
)}
```

---

## Common Patterns Reference

### Team Helper Usage

**Get player's team:**
```javascript
const teamName = getPlayerTeam(player);
```

**Get all active teams:**
```javascript
const teams = activeTeams(players);
```

**Get players on a team:**
```javascript
const teamPlayers = getTeamPlayers(players, teamName);
```

### Net Score Calculation

**Standard pattern:**
```javascript
const getNetScore = (strokes, holeIndex, playerHandicap) => {
  if (!strokes || strokes === 0) return null;
  let net = parseInt(strokes);
  if (useHandicaps) {
    const diff = hcds[holeIndex];
    const hcp = parseInt(playerHandicap) || 0;
    if (hcp >= diff) net -= 1;           // One stroke
    if (hcp >= diff + 18) net -= 1;      // Two strokes
  }
  return net;
};
```

### Real-time Score Syncing

**Standard pattern:**
```javascript
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

  const channel = supabase.channel('realtime-scores')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'scores', 
      filter: `match_id=eq.${matchId}` 
    }, fetchScores)
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [matchId]);
```

---

## Game Mode Configuration Matrix

| Game Mode    | Singles | Teams | Net | Gross | Notes |
|-------------|---------|-------|-----|-------|-------|
| Stableford  | ✅      | ✅    | ✅  | ✅    | Point-based scoring |
| Vegas       | ❌      | ✅    | ✅  | ❌    | 2v2 only |
| Four-ball   | ❌      | ✅    | ✅  | ❌    | Best ball match play |
| Singles     | ✅      | ❌    | ✅  | ✅    | Stroke play |
| Skins       | ✅      | ✅    | ✅  | ✅    | Lowest score wins skin |
| Nine Point  | ✅      | ❌    | ✅  | ✅    | 3-player only, 9pts/hole |
| Chairman    | ❌      | ✅    | ✅  | ❌    | Defend the chair |

---

## Testing Checklist

Before considering a game mode complete:

- [ ] Test with 2, 3, and 4 players (as applicable)
- [ ] Test singles mode (if supported)
- [ ] Test team mode (if supported)
- [ ] Test with handicaps enabled (net scoring)
- [ ] Test with handicaps disabled (gross scoring)
- [ ] Test with quota enabled (if supported)
- [ ] Verify leaderboard shows correct running totals
- [ ] Verify summary screen shows correct final scores
- [ ] Verify team colors are consistent throughout
- [ ] Test on 9-hole and 18-hole rounds
- [ ] Test starting from hole 10 (back nine only)
- [ ] Verify real-time updates when scores change

---

## Common Mistakes to Avoid

1. ❌ **Using `player.team` directly** → ✅ Use `getPlayerTeam(player)`
2. ❌ **Forgetting to update MatchSummary.jsx** → ✅ Add game logic to summary
3. ❌ **Hardcoded 18 holes** → ✅ Use `holesCount` and `startHole` props
4. ❌ **Missing leaderboard header** → ✅ Always include emoji + name header
5. ❌ **Inconsistent team colors** → ✅ Use team color helpers
6. ❌ **Not handling incomplete data** → ✅ Check for null/missing scores
7. ❌ **Missing real-time updates** → ✅ Use Supabase realtime channels
8. ❌ **Forgetting quota exclusions** → ✅ Add `gameType !== '[name]'` checks

---

## Quick Start: Creating a New Game Mode

1. **Copy an existing Grid component** (e.g., copy `StablefordGrid.jsx` → `[NewGame]Grid.jsx`)
2. **Import team helpers** at the top
3. **Define game-specific scoring logic** (replace Stableford logic with new game)
4. **Update leaderboard section** (header emoji, team/player display, scoring)
5. **Update MatchSummary.jsx**:
   - Add scoring calculation function
   - Add to team sorting logic
   - Add to team stats logic
   - Add to conditional displays
6. **Test using the checklist above**
7. **Update this document** with new game in configuration matrix

---

## File Locations

- **Grid Components:** `/src/[GameName]Grid.jsx`
- **Summary Component:** `/src/MatchSummary.jsx`
- **Team Helpers:** `/src/lib/teams.js`
- **Shared Components:** `/src/GolfScoreTile.jsx`
- **This Guide:** `/GAME_MODE_STANDARDS.md`

---

## Questions?

When in doubt:
1. Check how Stableford handles it (most complete implementation)
2. Check team helpers in `/src/lib/teams.js`
3. Refer to this guide
4. Test with real data before committing
