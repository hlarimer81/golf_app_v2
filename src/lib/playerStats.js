//==================================================================================================
// Player statistics, derived from banked round_differential rows.
//
// Everything here is a pure function over an array of round_differential rows. No React, no
// network. That is deliberate: this file reproduces the handicap math that lives in SQL, and the
// only cheap way to keep the two honest is to be able to run it on its own against real rows.
//
// round_differential is the right source. It survives delete_old_matches(), which destroys
// matches, scores and players after 30 days - so anything computed from matches would silently
// lose a player's history a month after they played it. See sql/handicap-system.sql.
//
// WHAT IS NOT HERE: the current index. Read that from handicap_summary, which is the server's
// answer. indexHistory() below recomputes indexes to draw a trend line, and a trend that ends on
// a different number than the headline would be a bug the user can see. The page shows the
// server's value as the headline and uses this only for the shape of the line behind it.
//==================================================================================================

//--------------------------------------------------------------------------------------------------
// WHS 2020: average the lowest N of the most recent 20 differentials, with a table of reductions
// for players who have fewer than 20. Mirrors golf_handicap_index() in sql/handicap-nine-hole.sql.
//
// Below three rounds there is no index. Null is the correct answer and must not be softened into a
// zero, which would hand a 20-handicap a scratch card.
//--------------------------------------------------------------------------------------------------
const WHS_TABLE = {
    3: [1, -2.0], 4: [1, -1.0], 5: [1, 0.0], 6: [2, -1.0], 7: [2, 0.0], 8: [2, 0.0],
    9: [3, 0.0], 10: [3, 0.0], 11: [3, 0.0], 12: [4, 0.0], 13: [4, 0.0], 14: [4, 0.0],
    15: [5, 0.0], 16: [5, 0.0], 17: [6, 0.0], 18: [6, 0.0], 19: [7, 0.0], 20: [8, 0.0],
};

const byDateAsc = (a, b) =>
    a.played_on.localeCompare(b.played_on) || String(a.id).localeCompare(String(b.id));

//--------------------------------------------------------------------------------------------------
// Two nines make one 18-hole differential, paired oldest-first; a trailing unpaired nine is not a
// round yet and waits for a partner. Differentials are strokes, so two halves add.
//--------------------------------------------------------------------------------------------------
function combineRounds(rounds) {
    const live = rounds.filter(r => !r.excluded);
    const nines = live.filter(r => r.holes === 9).sort(byDateAsc);

    const paired = [];
    for (let i = 0; i + 1 < nines.length; i += 2) {
        const [a, b] = [nines[i], nines[i + 1]];
        paired.push({
            differential: Number(a.differential) + Number(b.differential),
            played_on: a.played_on > b.played_on ? a.played_on : b.played_on,
            method: a.method === 'estimated' || b.method === 'estimated' ? 'estimated' : 'whs',
        });
    }

    return live
        .filter(r => r.holes === 18)
        .map(r => ({ differential: Number(r.differential), played_on: r.played_on, method: r.method }))
        .concat(paired);
}

export function indexFromRounds(rounds) {
    const combined = combineRounds(rounds);
    const recent = combined
        .slice()
        .sort((a, b) => b.played_on.localeCompare(a.played_on))
        .slice(0, 20);

    const n = recent.length;
    if (n < 3) return { index: null, used: 0, available: n, estimated: 0 };

    const [take, adjust] = WHS_TABLE[n];
    const lowest = recent.slice().sort((a, b) => a.differential - b.differential).slice(0, take);
    const avg = lowest.reduce((s, r) => s + r.differential, 0) / lowest.length;

    return {
        index: Math.round((avg + adjust) * 10) / 10,
        used: take,
        available: n,
        estimated: recent.filter(r => r.method === 'estimated').length,
    };
}

//--------------------------------------------------------------------------------------------------
// The index as it stood after each round, for the trend line.
//
// Replayed rather than stored, because no index history is kept anywhere - round_differential
// records the rounds, not what the index was at the time. Rounds before the third produce no
// point at all, so a new player's line starts where their index does.
//--------------------------------------------------------------------------------------------------
export function indexHistory(rounds) {
    const ordered = rounds.filter(r => !r.excluded).sort(byDateAsc);
    const points = [];

    for (let i = 1; i <= ordered.length; i++) {
        const { index } = indexFromRounds(ordered.slice(0, i));
        if (index != null) points.push({ played_on: ordered[i - 1].played_on, index });
    }
    return points;
}

//--------------------------------------------------------------------------------------------------
// A nine's differential is measured over nine holes, so it is worth half an 18-hole one. Doubling
// puts both on the same scale for display - the same thing the pairing above does arithmetically.
// Gross scores get no such treatment: a 38 for nine holes and a 90 for eighteen are not two
// measurements of the same thing, so nines are simply left out of the gross columns.
//--------------------------------------------------------------------------------------------------
const per18 = r => (r.holes === 9 ? Number(r.differential) * 2 : Number(r.differential));

export function courseHistory(rounds) {
    const live = rounds.filter(r => !r.excluded);
    const groups = new Map();

    for (const r of live) {
        const key = r.course_name || 'Unknown course';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    return [...groups.entries()]
        .map(([course, rs]) => {
            const full = rs.filter(r => r.holes === 18);
            return {
                course,
                rounds: rs.length,
                nines: rs.filter(r => r.holes === 9).length,
                bestGross: full.length ? Math.min(...full.map(r => r.gross)) : null,
                bestDiff: Math.min(...rs.map(per18)),
                avgDiff: rs.reduce((s, r) => s + per18(r), 0) / rs.length,
                lastPlayed: rs.map(r => r.played_on).sort().pop(),
                rated: rs.some(r => r.method === 'whs'),
            };
        })
        .sort((a, b) => b.rounds - a.rounds || b.lastPlayed.localeCompare(a.lastPlayed));
}

//--------------------------------------------------------------------------------------------------
// Headline numbers. Gross figures come from 18-hole rounds only, for the reason above; when a
// player has none, they are null rather than a number built from a different unit.
//--------------------------------------------------------------------------------------------------
export function scoringSummary(rounds) {
    const live = rounds.filter(r => !r.excluded);
    const full = live.filter(r => r.holes === 18);
    const dates = live.map(r => r.played_on).sort();

    return {
        totalRounds: live.length,
        excludedRounds: rounds.length - live.length,
        nines: live.filter(r => r.holes === 9).length,
        courses: new Set(live.map(r => r.course_name)).size,
        firstPlayed: dates[0] ?? null,
        lastPlayed: dates[dates.length - 1] ?? null,
        avgGross: full.length ? full.reduce((s, r) => s + r.gross, 0) / full.length : null,
        bestGross: full.length ? Math.min(...full.map(r => r.gross)) : null,
        bestDiff: live.length ? Math.min(...live.map(per18)) : null,
        avgDiff: live.length ? live.reduce((s, r) => s + per18(r), 0) / live.length : null,
        ratedRounds: live.filter(r => r.method === 'whs').length,
    };
}

//--------------------------------------------------------------------------------------------------
// Trend line geometry. Returns SVG-ready coordinates so the page can draw a sparkline inline
// rather than pulling in a charting library for one polyline.
//
// A lower index is a better golfer, so y is inverted: the line goes UP as the player improves,
// which is the direction people expect a "getting better" line to go.
//--------------------------------------------------------------------------------------------------
export function sparkline(points, width = 260, height = 48, pad = 4) {
    if (points.length < 2) return null;

    const values = points.map(p => p.index);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const stepX = (width - pad * 2) / (points.length - 1);

    const coords = points.map((p, i) => ({
        x: pad + i * stepX,
        y: pad + ((p.index - lo) / span) * (height - pad * 2),
        ...p,
    }));

    return {
        coords,
        polyline: coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '),
        low: lo,
        high: hi,
        first: points[0],
        last: points[points.length - 1],
        change: Math.round((points[points.length - 1].index - points[0].index) * 10) / 10,
    };
}
