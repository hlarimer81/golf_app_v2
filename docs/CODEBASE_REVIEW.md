# my-golf-app — Codebase Review & Efficiency Recommendations

_Reviewed: full `src/` tree (24 files, ~8,000 LOC), config, and root scripts._

This is a solid, working real-time golf scoring app (React 19 + Vite + Supabase).
The logic is correct and the architecture is understandable, but it has grown by
copy-paste: **11 game "Grid" components each re-implement the same scoring math,
data-fetching, realtime subscription, and table rendering.** That is where almost
all the efficiency wins live.

---

## 1. The single biggest issue: massive duplication across Grid components

Every `*Grid.jsx` (Stableford, Skins, Chairman, FourBall, NinePoint, Singles,
Nassau, Vegas, Wolf, WolfVegas, Aggregate) independently re-declares near-identical
copies of the same functions. Confirmed by search:

| Function | # of copies |
|---|---|
| `saveScore` | 11 |
| `getNetScore` / `calculateNetStrokes` | ~11 |
| `calculatePoints` (Stableford) | 7 |
| `getPlayerPointsUpToHole` | 6 |
| `getTeamPlayers` / team resolution | 6 |
| `fetchScores` + realtime `useEffect` | 11 |

Each copy is 10–40 lines. Conservatively this is **1,500–2,500 lines of duplicated
code**. Any bug fix (e.g. the net-stroke handicap rule) must currently be applied in
up to 11 places — a real maintenance and correctness hazard.

### Recommended extraction

Create a `src/lib/` (pure logic) and `src/hooks/` (React) layer:

```
src/
  lib/
    golf.js          // pure scoring math — no React, unit-testable
    teams.js         // getPlayerTeam, activeTeams, team colors
  hooks/
    useScores.js     // fetch + realtime + saveScore for a matchId
    useHoleLayout.js // holeNumbers / frontHoles / backHoles / is18
  components/
    ScoreGrid.jsx    // the shared dark table shell + <GolfScoreTile> cells
```

**`src/lib/golf.js`** — one home for the math that's copied everywhere:

```js
export const PAR_FALLBACK = Array(18).fill(4);
export const HCP_FALLBACK = Array(18).fill(10);

export function netScore(strokes, holeIndex, playerHcp, hcds, useHandicaps) {
  if (!strokes) return null;
  let net = parseInt(strokes, 10);
  if (useHandicaps) {
    const diff = hcds[holeIndex];
    const hcp = parseInt(playerHcp, 10) || 0;
    if (hcp >= diff) net -= 1;
    if (hcp >= diff + 18) net -= 1;
  }
  return net;
}

export function stablefordPoints(strokes, holeIndex, playerHcp, pars, hcds, useHandicaps) {
  const net = netScore(strokes, holeIndex, playerHcp, hcds, useHandicaps);
  if (net === null) return 0;
  const diff = net - pars[holeIndex];
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

export function holeLayout(holesCount = 18, startHole = 1) {
  const holeNumbers = Array.from({ length: holesCount }, (_, i) => startHole + i);
  const is18 = holesCount === 18;
  return {
    holeNumbers,
    is18,
    frontHoles: is18 ? holeNumbers.slice(0, 9) : holeNumbers,
    backHoles: is18 ? holeNumbers.slice(9) : [],
  };
}
```

**`src/hooks/useScores.js`** — replaces the 11 identical fetch/realtime/save blocks:

```js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useScores(matchId) {
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const fetchScores = async () => {
      const { data } = await supabase.from('scores').select('*').eq('match_id', matchId);
      if (cancelled) return;
      const map = {};
      data?.forEach(s => {
        (map[s.player_id] ??= {})[s.hole_number] = s.strokes;
      });
      setScores(map);
    };
    fetchScores();
    const channel = supabase.channel(`scores-${matchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `match_id=eq.${matchId}` },
        fetchScores)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [matchId]);

  const saveScore = useCallback(async (playerId, holeNum, strokes) => {
    const val = strokes === '' ? null : parseInt(strokes, 10);
    setScores(prev => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), [holeNum]: val } }));
    if (val === null) {
      await supabase.from('scores').delete()
        .eq('match_id', matchId).eq('player_id', playerId).eq('hole_number', holeNum);
    } else {
      await supabase.from('scores').upsert(
        { match_id: matchId, player_id: playerId, hole_number: holeNum, strokes: val },
        { onConflict: 'match_id,player_id,hole_number' });
    }
  }, [matchId]);

  return { scores, saveScore };
}
```

> Note: each grid currently names its realtime channel differently
> (`realtime-scores`, `realtime-skins`, …). Keying by `matchId` as above is safer —
> if two grids ever mount with the same static channel name they can collide.

Adopting just these three files would let each Grid drop ~100+ lines and guarantees
the scoring rules stay consistent across every game.

---

## 2. Break up `App.jsx` (1,129 lines)

`App.jsx` is a single component holding ~25 `useState` hooks and three separate
full-screen "pages" (setup form, join form, scorer view). Recommended:

- Extract **`SetupForm.jsx`**, **`JoinForm.jsx`**, **`RecentMatchesModal.jsx`**, and
  **`ScorerView.jsx`** (the banner + `<ScorerComponent>` block).
- Replace the long `if/else` game-type chain (lines 387–421) with a lookup map:

  ```js
  // src/lib/gameRegistry.js
  export const GAMES = {
    stableford: { component: StablefordGrid, banner: '#4CAF50', label: 'Stableford' },
    skins:      { component: SkinsGrid,      banner: '#FFD700', label: 'Skins' },
    // ...
  };
  ```

  This map can also drive the `<select>` options, the `gameDescriptions` object, and
  the "Recent Rounds" label map (lines 484–496, 680) — all three currently list the
  same game types separately and must be kept in sync by hand.

- The giant `onNewMatch` reset callback (lines 463–478) sets ~13 states back to
  defaults; consider collecting match-setup state into a single `useReducer` or one
  `matchConfig` object so "reset" is a one-liner.

- Consider a light router (or even conditional render via a `screen` state enum)
  instead of three independent `if (showX) return (...)` early-returns.

---

## 3. Consolidate inline styles

Every grid repeats the same dark-theme table styling inline (sticky headers, cell
colors, the fixed "Finish Round" button, the leaderboard card). This bloats each
file by ~150 lines and makes theme changes an 11-file edit.

Options (pick one):
- Move shared chrome into a **`ScoreGrid` wrapper component** + a small style module
  (`src/styles/grid.js` exporting plain objects), or
- Add CSS classes in `index.css` and reference them by `className`.

At minimum, factor the repeated **leaderboard card**, **scrollable table shell**, and
**fixed finish button** into shared components — they are byte-for-byte identical
across Stableford/Skins/etc.

---

## 4. Duplicated scoring logic in `MatchSummary.jsx`

`MatchSummary` (558 lines) re-implements `getNetScore`, `calculatePoints`,
`getBestNet`, `getHoleResult`, nine-point distribution, chairman calc, etc. — all of
which also exist inside the individual grids. Once `src/lib/golf.js` exists, both the
grids and the summary should import from it so a single game's rules can't diverge
between "live" and "summary" views.

---

## 5. Performance / React correctness

These are lower-severity but worth doing while refactoring:

- **Memoize derived calculations.** Grids call `calculateSkins()`,
  `calculateStandings()`, `settleSkins()`, etc. directly in render on every keystroke.
  Wrap them in `useMemo(() => ..., [scores, players, wager])`. With realtime updates
  these recompute for the whole field on each stroke entry.
- **`getHoleSkinResult` in `SkinsGrid`** is called once per header cell *and* once per
  body cell — up to ~2×18×players times per render. Compute a `holeResults` array once
  (memoized) and index into it.
- **`activeTeams`/`teamColors`** are rebuilt every render in several grids; memoize.
- The DOM-focus trick (`document.getElementById('score-...')` + `setTimeout`) works
  but is fragile; a `ref` array or `useRef` map is more idiomatic and avoids relying
  on `globalIdx+1` string IDs.
- Replace `alert(...)` for validation/errors with inline UI messaging — `alert` blocks
  the thread and is easy to miss on mobile (this is a mobile-first app).

---

## 6. Repo hygiene / organization

- **`src/` is flat** — 24 files at one level. Group into `components/`, `grids/`,
  `hooks/`, `lib/`, `styles/`. Much easier to navigate.
- **Root is cluttered with one-off scripts** (`add_courses.js`, `check_players.js`,
  `update_players.js`, `dump_schema.js`, `fetch-green-polygons.js`, `test-chairman.js`,
  many `*.sql`). Move these into a `scripts/` and `sql/` folder so the project root
  only shows app/build config.
- **`.env` is present but not committed** (verified: git doesn't track it, and it's in
  `.gitignore`) — good. Keep it that way.
- `dist/` exists in the working tree; ensure it's gitignored (build artifact).
- Add a couple of **unit tests** for `src/lib/golf.js` and `settlement.js`
  (`reduceTransactions`, stableford points, net strokes). These are pure functions and
  are exactly the code you least want to break silently across 11 grids. No test
  runner is currently configured — Vitest fits Vite naturally.

---

## 7. Things that are already good (keep)

- `settlement.js`, `nassauEngine.js`, `useWager.js`, `usePresses.js` are already
  well-factored, documented pure modules — this is the pattern to extend to scoring.
- `GolfScoreTile.jsx` is a clean, reusable presentational component.
- `useWager`/`usePresses` correctly use a `cancelled` flag to avoid setState after
  unmount — apply the same pattern in the new `useScores` hook.

---

## Suggested order of work (incremental, low-risk)

1. Add `src/lib/golf.js` and refactor **one** grid (e.g. Stableford) to use it +
   `useScores`. Verify behavior is identical.
2. Roll the same hook/lib into the remaining grids one at a time.
3. Point `MatchSummary` at `src/lib/golf.js`.
4. Extract shared UI (leaderboard card, table shell, finish button, `ScoreGrid`).
5. Break `App.jsx` into `SetupForm`/`JoinForm`/`ScorerView` + `gameRegistry`.
6. Reorganize folders (`components/grids/hooks/lib`) and move root scripts to
   `scripts/`+`sql/`.
7. Add Vitest tests for `golf.js` and `settlement.js`.

Estimated net effect: roughly **-2,000 lines**, single source of truth for scoring,
and far cheaper future changes — with no change to app behavior.
