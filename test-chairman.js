function getNetScore(strokes) {
  if (!strokes) return null;
  return strokes;
}

const players = [
  { id: '1', team: 'Team A' },
  { id: '2', team: 'Team A' },
  { id: '3', team: 'Team B' },
  { id: '4', team: 'Team B' }
];

const scores = {
  '1': { 1: 3, 2: 4 }, // A1
  '2': { 1: 4, 2: 2 }, // A2
  '3': { 1: 4, 2: 4 }, // B1
  '4': { 1: 4, 2: 4 }  // B2
};

const activeTeams = ['Team A', 'Team B'];

const getTeamBestNet = (teamName, holeNum) => {
  const teamPlayers = players.filter(p => p.team === teamName);
  const nets = teamPlayers
    .map(p => getNetScore((scores[p.id] || {})[holeNum]))
    .filter(n => n !== null);
  if (nets.length === 0) return null;
  return Math.min(...nets);
};

const calculateChairman = () => {
  const chairmanPoints = {};
  activeTeams.forEach(t => { chairmanPoints[t] = 0; });
  
  let currentChairman = null;
  const holeResults = [];
  
  for (let holeIndex = 0; holeIndex < 2; holeIndex++) {
    const holeNum = holeIndex + 1;
    const holeScores = [];
    
    activeTeams.forEach(team => {
      const bestNet = getTeamBestNet(team, holeNum);
      if (bestNet !== null) {
        holeScores.push({ team, net: bestNet });
      }
    });
    
    if (holeScores.length !== activeTeams.length) continue;
    
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

console.log(calculateChairman());