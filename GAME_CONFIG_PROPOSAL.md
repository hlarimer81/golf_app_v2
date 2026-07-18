# Shared Game Definitions — Design Proposal

_Goal: add a new golf game (or edit an existing one) by dropping/editing **one file in a
shared folder**, and have both `my-golf-app` and `~/score_play/web` pick it up — the setup
options, the leaderboard, and the summary all following the config._

Both apps are the same stack (React 19 + Vite 8 + Supabase, ESM), and `score_play` already
ships a `shared/` folder, so this is very achievable.

---

## 1. Where the shared folder lives

The two repos are siblings under `~`. Three viable ways to share one source of truth; I
recommend **B** (git submodule) because it version-pins cleanly and `score_play` already
uses submodules.

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. npm workspace / local package** | `packages/golf-games` published or `file:` linked into both apps | Real versioning, clean imports | Requires monorepo or a publish/link step |
| **B. Git submodule** ⭐ | One repo `golf-games`, added as a submodule at `my-golf-app/games` and `score_play/games` | Version-pinned per app, both apps already sibling repos, score_play uses submodules already | `git submodule update` discipline |
| **C. Symlink during dev** | `ln -s ~/golf-games ./games` | Zero tooling | Not portable, breaks CI/build |

Layout inside the shared repo:

```
golf-games/
  index.js                 # exports the registry (imports every game)
  schema.js                # the GameDefinition contract + a validate() helper
  lib/
    golf.js                # pure scoring math (the src/lib/golf.js we just wrote)
    teams.js
    settlement.js          # the wager engine (already shared logic, JS-ported)
  games/
    stableford.js
    skins.js
    nassau.js
    ...one file per game
```

> Key rule: **the shared folder is pure data + pure functions only — no JSX, no React,
> no Supabase.** Each app keeps its own rendering. That's what lets a phone-tablet UI
> (`score_play`) and a web UI (`my-golf-app`) both consume the same definitions.

---

## 2. The `GameDefinition` contract (one file per game)

Each game file `export default`s a plain object. The apps read it; they never hard-code the
game again. Proposed shape:

```js
// golf-games/games/skins.js
import { netScore } from '../lib/golf.js';
import { settleSkins } from '../lib/settlement.js';

/** @type {import('../schema.js').GameDefinition} */
export default {
  id: 'skins',
  label: 'Skins',
  banner: '#FFD700',
  minPlayers: 2,
  maxPlayers: 8,
  requires18: false,
  teamBased: false,

  description:
    'Individual competition. Lowest score wins the hole. Ties can carry over.',

  // ---- SETUP: which options appear on the "new match" form ----
  // Rendered by each app's form engine from this declarative list.
  options: [
    { key: 'useHandicaps', type: 'boolean', label: 'Net (Handicaps)', default: false },
    { key: 'useCarryover', type: 'boolean', label: 'Carryover ties', default: true },
    { key: 'wager.per_skin', type: 'money', label: '$ per skin', default: 0 },
  ],

  // ---- SCORING: pure, per-hole + roll-up. No UI. ----
  // ctx = { pars, hcds, useHandicaps, options }
  scoreHole(playerScoresById, holeIndex, players, ctx) {
    // returns { winnerId | null, status: 'won'|'push'|'incomplete' }
  },

  // ---- STANDINGS: what the leaderboard shows ----
  // returns an ordered array of { id, name, primary, secondary?, highlight? }
  standings(scores, players, ctx) { /* ... */ },

  // ---- LEADERBOARD DISPLAY HINTS (declarative, app renders it) ----
  leaderboard: {
    kind: 'players',        // 'players' | 'teams'
    primaryLabel: 'Skins',  // big number heading
    accent: '#FFD700',
    highlightLeader: true,
  },

  // ---- SUMMARY DISPLAY HINTS ----
  summary: {
    columns: [
      { key: 'skins', label: 'Skins' },
      { key: 'gross', label: 'Gross' },
    ],
    showMoney: true,        // pull settlement() into the summary
  },

  // ---- MONEY: reuse the shared settlement engine ----
  settle(scores, players, wager, ctx) {
    return settleSkins({ /* ...derived from scores... */ });
  },
};
```

`schema.js` documents the contract and offers a runtime check so a malformed game fails
loudly at startup rather than rendering blank:

```js
// golf-games/schema.js
export const OPTION_TYPES = ['boolean', 'money', 'number', 'select'];

/** @typedef {Object} GameDefinition ... */

export function validateGame(g) {
  const errs = [];
  if (!g.id) errs.push('missing id');
  if (!g.label) errs.push('missing label');
  if (typeof g.standings !== 'function') errs.push('standings() required');
  g.options?.forEach((o, i) => {
    if (!OPTION_TYPES.includes(o.type)) errs.push(`option[${i}] bad type ${o.type}`);
  });
  if (errs.length) throw new Error(`Game "${g.id || '?'}": ${errs.join(', ')}`);
  return g;
}
```

And `index.js` collects them:

```js
// golf-games/index.js
import { validateGame } from './schema.js';
import stableford from './games/stableford.js';
import skins from './games/skins.js';
// ...

export const GAMES = [stableford, skins /* ... */].map(validateGame);
export const GAMES_BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));
```

---

## 3. How each app consumes it

**Setup form** becomes a loop, not a hard-coded list:

```jsx
import { GAMES, GAMES_BY_ID } from '../games';

<select value={gameType} onChange={...}>
  {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
</select>

{gameType && GAMES_BY_ID[gameType].options.map(opt => (
  <OptionField key={opt.key} spec={opt} value={...} onChange={...} />
))}
```

**Leaderboard + grid**: one generic `<ScoreGrid game={def} .../>` reads
`def.standings()` and `def.leaderboard` to render the sticky header, and calls
`def.scoreHole()` for cell coloring/badges. Game-specific quirks live in the config, not
in 11 components.

**Summary**: one generic `<MatchSummary game={def} .../>` renders `def.summary.columns`
and, if `def.summary.showMoney`, calls `def.settle()` → the existing MoneyModal.

Net effect: **adding "Wolf Hammer" = create `games/wolfHammer.js`.** Both apps show it in
the dropdown, render its options, leaderboard, and summary — zero component edits.

---

## 4. Migration path (incremental, low-risk)

1. Create the `golf-games` repo; move the already-pure modules in first
   (`lib/golf.js`, `lib/teams.js`, `settlement.js` — these have no UI, so they port as-is).
2. Add `schema.js` + `index.js` and author `games/stableford.js` and `games/skins.js`
   (the two we just refactored — their logic is already extracted).
3. Add as a submodule to both apps; point the new `useScores`-based Stableford/Skins grids
   at the shared definitions.
4. Build the generic `OptionField`, `ScoreGrid`, and `MatchSummary` renderers in each app.
5. Port remaining games one file at a time; delete the old per-game components as each lands.

---

## 5. Open questions for you

- **Sharing mechanism:** submodule (B) vs local npm package (A)? B is fastest given your
  current setup; A is nicer long-term if you ever add CI.
- **How dynamic must options be?** The declarative `options[]` covers boolean/money/number/
  select. Any game need conditional options (e.g. "show press stake only if Nassau")? If so
  I'll add a `visibleIf` predicate to the option spec.
- **Does `score_play`'s tablet UI need the same option types**, or a reduced set (hardware
  buttons)? If reduced, the config can carry a `platforms: ['web','tablet']` hint per option.
