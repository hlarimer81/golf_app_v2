//==================================================================================================
// A believable scorecard for an AI golfer (see testers/README.md).
//
// The AI golfers play real rounds on the live app, and those rounds are banked into their
// handicap history. For that history to mean anything the scores have to look like a golfer's:
// the right total for the handicap, harder holes costing more, a blow-up here and a birdie there.
// A language model asked to "make up a round" produces cards that are too tidy, so the card comes
// from here and the golfer just enters it.
//
// PLAYING TO A HANDICAP. A handicap index is built from the best 8 of the last 20 rounds, so a
// golfer's typical round is a few strokes WORSE than their handicap. If these cards averaged the
// handicap exactly, every new index would come out a little lower than the last and the golfers
// would talk themselves down to scratch. So a typical round here lands TYPICAL_OVER strokes above
// the course handicap, and is bounded so one freak card cannot swing an index.
//
// Deterministic: the same seed gives the same card, so a round that looks wrong can be reproduced.
//
//   node testers/scorecard.js --handicap 14 --pars 4,4,3,5,... [--si 7,11,17,...] --seed 2026-10-02-hazard
//==================================================================================================

export const TYPICAL_OVER = 3;      // strokes above the course handicap on an ordinary day
const SPREAD = 3;                   // standard deviation of a round, in strokes
const BEST_DAY = -3;                // never better than this many strokes under the handicap
const WORST_DAY = 9;                // never worse than this many over it
const MAX_OVER_PAR_ON_A_HOLE = 4;

// Small, fast, seedable generator. Math.random cannot be seeded.
export function seededRandom(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)) {
        h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Roughly normal, from three uniform draws. Good enough for golf.
function roughlyNormal(random) {
    return (random() + random() + random() - 1.5) * 2;
}

// How many strokes over par the round as a whole comes to. courseHandicap is the 18-hole figure
// the app shows at setup; a 9-hole round gets half of everything.
export function strokesOverPar(courseHandicap, holes, random) {
    const share = holes / 18;
    const day = Math.max(BEST_DAY, Math.min(WORST_DAY, TYPICAL_OVER + roughlyNormal(random) * SPREAD));
    return Math.round((courseHandicap + day) * share);
}

// pars and strokeIndex are per hole, in playing order. strokeIndex is optional (1 = hardest).
export function generateCard({ pars, strokeIndex, courseHandicap, seed }) {
    const random = seededRandom(seed);
    const holes = pars.length;
    const over = Array(holes).fill(0);
    let remaining = strokesOverPar(courseHandicap, holes, random);

    // Harder holes take more of the damage: weight 2 for the hardest down to 1 for the easiest.
    const weight = pars.map((_, i) => {
        const si = strokeIndex?.[i];
        return Number.isFinite(si) ? 2 - (Math.min(Math.max(si, 1), 18) - 1) / 17 : 1.5;
    });

    const pick = (allowed) => {
        const total = allowed.reduce((sum, i) => sum + weight[i], 0);
        let roll = random() * total;
        for (const i of allowed) {
            roll -= weight[i];
            if (roll <= 0) return i;
        }
        return allowed[allowed.length - 1];
    };
    const all = pars.map((_, i) => i);

    // A few birdies, more for a better golfer. Each one is paid for with a stroke elsewhere, so
    // the round total is unchanged.
    const birdies = Math.max(0, Math.round((random() * 3 - courseHandicap / 8) * (holes / 18)));
    for (let b = 0; b < birdies; b++) {
        const candidates = all.filter(i => over[i] === 0);
        if (!candidates.length) break;
        over[candidates[Math.floor(random() * candidates.length)]] = -1;
        remaining += 1;
    }

    // A better-than-scratch day: take strokes off instead of adding them.
    while (remaining < 0) {
        const candidates = all.filter(i => over[i] === 0);
        if (!candidates.length) break;
        over[candidates[Math.floor(random() * candidates.length)]] = -1;
        remaining += 1;
    }

    while (remaining > 0) {
        const candidates = all.filter(i => over[i] >= 0 && over[i] < MAX_OVER_PAR_ON_A_HOLE);
        if (!candidates.length) break;
        over[pick(candidates)] += 1;
        remaining -= 1;
    }

    return pars.map((par, i) => par + over[i]);
}

// ---- command line ------------------------------------------------------------------------------
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
    const list = (s) => String(s).split(',').map(n => Number(n.trim()));

    if (!args.pars || args.handicap === undefined || !args.seed) {
        console.error('usage: node testers/scorecard.js --handicap <course handicap> --pars 4,4,3,... [--si 7,11,...] --seed <text>');
        process.exit(1);
    }
    const pars = list(args.pars);
    const card = generateCard({
        pars,
        strokeIndex: args.si ? list(args.si) : undefined,
        courseHandicap: Number(args.handicap),
        seed: args.seed,
    });
    const total = card.reduce((a, b) => a + b, 0);
    const par = pars.reduce((a, b) => a + b, 0);
    console.log(JSON.stringify({ strokes: card, total, par, overPar: total - par }));
}
