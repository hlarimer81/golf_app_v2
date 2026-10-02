//==================================================================================================
// What the AI golfers play tonight (see testers/README.md).
//
// The workflow picks the scenario, not the golfer. Left to choose, a model drifts to the same few
// games and "we tested everything" never becomes true. This list is the coverage: every game two
// players can play, each played the ways that matter, and every setup option used at least once.
// One scenario a night walks the whole list in a few weeks and then starts again.
//
// Two golfers (Hazard and Rough) can play six of the eleven games. 9-Point needs three players;
// Vegas, Wolf, Wolf Vegas and 2-Ball Aggregate need four or five. Add them here when there are
// more golfers.
//
// A scenario is a description for the golfer to follow on the setup screen, not a script: finding
// the controls is part of the test.
//
//   node testers/scenarios.js [--day <n>] [--id <scenario id>]
//==================================================================================================

export const GOLFERS = ['Hazard', 'Rough'];

// Something a real golfer does mid-round that a straight run-through never exercises.
export const BEHAVIOURS = [
    { id: 'straight', text: 'Play straight through.' },
    { id: 'fix-a-score', text: 'After hole 3, go back and change one score you already entered on hole 1, as if you had miscounted. Check every total and standing that depends on it updates.' },
    { id: 'clear-a-score', text: 'On one hole, enter a score, then clear the cell so it is empty, check the standings no longer count it, and then enter the real score.' },
    { id: 'reload', text: 'About halfway through, reload the page. Find your way back into the round the way a golfer would and check every score you entered is still there.' },
    { id: 'rejoin-by-code', text: 'About halfway through, go back to the home screen and rejoin your round with its match code. Check every score is still there.' },
    { id: 'after-the-round', text: 'After finishing, open Players & Handicaps and each of your two player pages. Check the round you just played is there and the numbers on it are right.' },
];

export const SCENARIOS = [
    { id: 'stableford-18-net', game: 'stableford', holes: 18, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'singles-18-gross', game: 'singles', holes: 18, scoring: 'gross' },
    { id: 'skins-18-net-carry-wager', game: 'skins', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, carryover: true, wager: 'Set a wager of $2 a skin and check the Money screen at the end.' },
    { id: 'nassau-18-net-wager-press', game: 'nassau', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, wager: 'Set a $5 Nassau wager.', presses: 'Whoever is 2 down on the front nine presses once.' },
    { id: 'chairman-18-net', game: 'chairman', holes: 18, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'fourball-18-net', game: 'fourball', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, teams: 'Hazard is Team A, Rough is Team B.' },
    { id: 'stableford-9-net', game: 'stableford', holes: 9, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'skins-18-gross-no-carry', game: 'skins', holes: 18, scoring: 'gross', carryover: false },
    { id: 'singles-9-back-nine', game: 'singles', holes: 9, startHole: 10, scoring: 'net', allowance: 100, playOffLow: false },
    { id: 'nassau-18-gross', game: 'nassau', holes: 18, scoring: 'gross' },
    { id: 'chairman-9-gross', game: 'chairman', holes: 9, scoring: 'gross' },
    { id: 'fourball-18-net-90', game: 'fourball', holes: 18, scoring: 'net', allowance: 90, playOffLow: false, teams: 'Hazard is Team A, Rough is Team B.' },
    { id: 'stableford-18-net-80', game: 'stableford', holes: 18, scoring: 'net', allowance: 80, playOffLow: true },
    { id: 'skins-9-net-carry-wager', game: 'skins', holes: 9, scoring: 'net', allowance: 100, playOffLow: true, carryover: true, wager: 'Set a wager of $1 a skin and check the Money screen at the end.' },
    { id: 'singles-18-net-full-handicap', game: 'singles', holes: 18, scoring: 'net', allowance: 100, playOffLow: false },
    { id: 'fourball-9-gross', game: 'fourball', holes: 9, scoring: 'gross', teams: 'Hazard is Team A, Rough is Team B.' },
    { id: 'stableford-18-team', game: 'stableford', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, playMode: 'team', teams: 'Put Hazard and Rough on different teams.' },
    { id: 'nassau-18-net-90-two-presses', game: 'nassau', holes: 18, scoring: 'net', allowance: 90, playOffLow: true, wager: 'Set a $10 Nassau wager.', presses: 'Press once on the front nine and once on the back nine, whenever someone is 2 down.' },
    { id: 'chairman-18-net-70', game: 'chairman', holes: 18, scoring: 'net', allowance: 70, playOffLow: false },
    { id: 'skins-18-net-50', game: 'skins', holes: 18, scoring: 'net', allowance: 50, playOffLow: true, carryover: true },
];

const wrap = (i, length) => ((i % length) + length) % length;

// Scenario and behaviour for a given night. Each lap through the scenarios shifts the behaviours
// along by one, so a scenario meets a different behaviour every lap until it has met them all.
export function pickScenario(day) {
    const n = wrap(Math.floor(day), SCENARIOS.length);
    const lap = Math.floor(Math.floor(day) / SCENARIOS.length);
    return {
        ...SCENARIOS[n],
        behaviour: BEHAVIOURS[wrap(n + lap, BEHAVIOURS.length)],
        // Who "writes up" the round. Alternates, so both names appear on issues.
        reporter: GOLFERS[wrap(Math.floor(day), GOLFERS.length)],
        day: Math.floor(day),
    };
}

export function scenarioById(id, day = 0) {
    const index = SCENARIOS.findIndex(s => s.id === id);
    if (index < 0) return null;
    return { ...pickScenario(day), ...SCENARIOS[index] };
}

export const daysSinceEpoch = (date = new Date()) => Math.floor(date.getTime() / 86_400_000);

// ---- command line ------------------------------------------------------------------------------
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
    const day = args.day !== undefined && args.day !== '' ? Number(args.day) : daysSinceEpoch();

    const scenario = args.id ? scenarioById(args.id, day) : pickScenario(day);
    if (!scenario) {
        console.error(`no scenario called "${args.id}". Known: ${SCENARIOS.map(s => s.id).join(', ')}`);
        process.exit(1);
    }
    console.log(JSON.stringify(scenario, null, 2));
}
