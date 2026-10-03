//==================================================================================================
// What the AI golfers play tonight (see testers/README.md).
//
// The workflow picks the scenario, not the golfer. Left to choose, a model drifts to the same few
// games and "we tested everything" never becomes true. This list is the coverage: every game,
// each played the ways that matter, and every setup option used at least once. One scenario a
// night walks the whole list in about a month and then starts again.
//
// Four golfers play as a foursome, which is how the app is mostly used and what the 2v2 and
// rotating games need. A scenario that names `players` is played by those golfers only: 9-Point
// takes exactly three, and two Nassaus stay head to head. Every other scenario is all four.
//
// A scenario is a description for the golfer to follow on the setup screen, not a script: finding
// the controls is part of the test.
//
//   node testers/scenarios.js [--day <n>] [--id <scenario id>]
//==================================================================================================

// Saved players in the live app, created there by H. Rake and Mulligan joined on 2026-10-03,
// starting at handicaps of 15 and 10.
export const GOLFERS = ['Hazard', 'Rough', 'Rake', 'Mulligan'];

// Something a real golfer does mid-round that a straight run-through never exercises.
export const BEHAVIOURS = [
    { id: 'straight', text: 'Play straight through.' },
    { id: 'fix-a-score', text: 'After hole 3, go back and change one score you already entered on hole 1, as if you had miscounted. Check every total and standing that depends on it updates.' },
    { id: 'clear-a-score', text: 'On one hole, enter a score, then clear the cell so it is empty, check the standings no longer count it, and then enter the real score.' },
    { id: 'reload', text: 'About halfway through, reload the page. Find your way back into the round the way a golfer would and check every score you entered is still there.' },
    { id: 'rejoin-by-code', text: 'About halfway through, go back to the home screen and rejoin your round with its match code. Check every score is still there.' },
    { id: 'after-the-round', text: 'After finishing, open Players & Handicaps and the player page of each golfer who played. Check the round you just played is there and the numbers on it are right.' },
];

export const SCENARIOS = [
    { id: 'stableford-18-net', game: 'stableford', holes: 18, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'singles-18-gross', game: 'singles', holes: 18, scoring: 'gross' },
    { id: 'skins-18-net-carry-wager', game: 'skins', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, carryover: true, wager: 'Set a wager of $2 a skin and check the Money screen at the end.' },
    { id: 'nassau-18-net-wager-press', game: 'nassau', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, teams: 'Two sides: Hazard and Mulligan against Rough and Rake.', wager: 'Set a $5 Nassau wager.', presses: 'Whichever side is 2 down on the front nine presses once.' },
    { id: 'chairman-18-net', game: 'chairman', holes: 18, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'fourball-18-net', game: 'fourball', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, teams: 'Hazard and Mulligan are Team A; Rough and Rake are Team B.' },
    { id: 'stableford-9-net', game: 'stableford', holes: 9, scoring: 'net', allowance: 100, playOffLow: true },
    { id: 'skins-18-gross-no-carry', game: 'skins', holes: 18, scoring: 'gross', carryover: false },
    { id: 'singles-9-back-nine', game: 'singles', holes: 9, startHole: 10, scoring: 'net', allowance: 100, playOffLow: false },
    { id: 'nassau-18-gross', game: 'nassau', holes: 18, scoring: 'gross', players: ['Hazard', 'Rough'] },
    { id: 'chairman-9-gross', game: 'chairman', holes: 9, scoring: 'gross' },
    { id: 'fourball-18-net-90', game: 'fourball', holes: 18, scoring: 'net', allowance: 90, playOffLow: false, teams: 'Hazard and Mulligan are Team A; Rough and Rake are Team B.' },
    { id: 'stableford-18-net-80', game: 'stableford', holes: 18, scoring: 'net', allowance: 80, playOffLow: true },
    { id: 'skins-9-net-carry-wager', game: 'skins', holes: 9, scoring: 'net', allowance: 100, playOffLow: true, carryover: true, wager: 'Set a wager of $1 a skin and check the Money screen at the end.' },
    { id: 'singles-18-net-full-handicap', game: 'singles', holes: 18, scoring: 'net', allowance: 100, playOffLow: false },
    { id: 'fourball-9-gross', game: 'fourball', holes: 9, scoring: 'gross', teams: 'Hazard and Mulligan are Team A; Rough and Rake are Team B.' },
    { id: 'stableford-18-team', game: 'stableford', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, playMode: 'team', teams: 'Two teams of two: Hazard and Rake, Rough and Mulligan.' },
    { id: 'nassau-18-net-90-two-presses', game: 'nassau', holes: 18, scoring: 'net', allowance: 90, playOffLow: true, players: ['Rake', 'Mulligan'], wager: 'Set a $10 Nassau wager.', presses: 'Press once on the front nine and once on the back nine, whenever someone is 2 down.' },
    { id: 'chairman-18-net-70', game: 'chairman', holes: 18, scoring: 'net', allowance: 70, playOffLow: false },
    { id: 'skins-18-net-50', game: 'skins', holes: 18, scoring: 'net', allowance: 50, playOffLow: true, carryover: true },

    // The games that need three or four players. None of these had been played by a tester
    // before 2026-10-03.
    { id: 'ninepoint-18-net', game: 'ninepoint', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, players: ['Hazard', 'Rough', 'Mulligan'] },
    { id: 'vegas-18-net', game: 'vegas', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, teams: 'Two sides: Hazard and Mulligan against Rough and Rake.' },
    { id: 'wolf-18-net', game: 'wolf', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, choices: 'On each hole the Wolf takes as partner the golfer with the lowest handicap other than himself. On holes 6, 12 and 18 the Wolf goes alone instead.' },
    { id: 'aggregate-18-net', game: 'aggregate', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, teams: 'Two sides: Hazard and Mulligan against Rough and Rake.' },
    { id: 'wolfvegas-18-net', game: 'wolfvegas', holes: 18, scoring: 'net', allowance: 100, playOffLow: true, choices: 'On each hole the Wolf takes as partner the golfer with the lowest handicap other than himself. On holes 5 and 14 the Wolf goes Lone. Do not use Blind or the hammer.' },
    { id: 'ninepoint-9-gross', game: 'ninepoint', holes: 9, scoring: 'gross', players: ['Rough', 'Rake', 'Mulligan'] },
    { id: 'vegas-18-gross', game: 'vegas', holes: 18, scoring: 'gross', teams: 'Two sides: Hazard and Rake against Rough and Mulligan.' },
    { id: 'wolf-18-gross', game: 'wolf', holes: 18, scoring: 'gross', choices: 'The Wolf goes alone on every third hole (3, 6, 9 and so on). On every other hole the Wolf takes as partner the golfer who had the lowest score on the hole before.' },
    { id: 'aggregate-9-gross', game: 'aggregate', holes: 9, scoring: 'gross', teams: 'Two sides: Hazard and Rake against Rough and Mulligan.' },
];

const wrap = (i, length) => ((i % length) + length) % length;

// Scenario and behaviour for a given night. Each lap through the scenarios shifts the behaviours
// along by one, so a scenario meets a different behaviour every lap until it has met them all.
// A scenario as the golfers are given it: who plays, tonight's behaviour, and who writes it up.
function dealt(index, day) {
    const scenario = SCENARIOS[index];
    const players = scenario.players ?? GOLFERS;
    const lap = Math.floor(Math.floor(day) / SCENARIOS.length);
    return {
        ...scenario,
        players,
        behaviour: BEHAVIOURS[wrap(index + lap, BEHAVIOURS.length)],
        // Who "writes up" the round: one of the golfers playing it. Changes night to night, so
        // every name appears on issues.
        reporter: players[wrap(Math.floor(day), players.length)],
        day: Math.floor(day),
    };
}

export function pickScenario(day) {
    return dealt(wrap(Math.floor(day), SCENARIOS.length), day);
}

// The id is typed by hand into the Run workflow box, often on a phone, which capitalises the first
// letter and leaves a space behind. Neither should cost a run.
export function scenarioById(id, day = 0) {
    const wanted = String(id ?? '').trim().toLowerCase();
    const index = SCENARIOS.findIndex(s => s.id === wanted);
    if (index < 0) return null;
    return dealt(index, day);
}

export const daysSinceEpoch = (date = new Date()) => Math.floor(date.getTime() / 86_400_000);

// ---- command line ------------------------------------------------------------------------------
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
    const day = args.day !== undefined && args.day !== '' ? Number(args.day) : daysSinceEpoch();

    const scenario = args.id?.trim() ? scenarioById(args.id, day) : pickScenario(day);
    if (!scenario) {
        console.error(`no scenario called "${args.id}". Known: ${SCENARIOS.map(s => s.id).join(', ')}`);
        process.exit(1);
    }
    console.log(JSON.stringify(scenario, null, 2));
}
