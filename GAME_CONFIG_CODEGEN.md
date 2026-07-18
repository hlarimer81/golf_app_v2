# Consuming the Config → Generating Games → Automating with GitHub Actions

Yes. There are **two distinct ways** a config-driven system can "create the games," and they
automate very differently. Pick based on how much you want to generate vs. render.

| Approach | What "creates the game" | When it runs | Best when |
|---|---|---|---|
| **A. Runtime interpretation** ⭐ | Apps read the JSON/JS config and *render* generically at runtime. Nothing is "generated." | Every app load | Games fit a common shape (leaderboard + per-hole scoring + summary) |
| **B. Build-time code generation** | A generator tool reads config and *writes source files* (components, types, DB migrations, docs). | In CI on config change | You want real per-game files/types, or outputs beyond JS (SQL, docs, native) |

Most of what you want is **A** (already the plan). **B** shines for the "boilerplate that
isn't JS" — DB columns, TypeScript types, docs, and a validation gate. A GitHub Action can
run either or both.

---

## Approach A — Runtime interpretation (the default engine)

The generic renderers I proposed *are* the "tool that consumes config and creates games."
No files generated; the app just interprets the definition:

- `<GameSetupForm game={def} />` builds the setup screen from `def.options[]`
- `<ScoreGrid game={def} />` renders the leaderboard + grid from `def.leaderboard` + `def.scoreHole()`
- `<MatchSummary game={def} />` renders `def.summary.columns` + `def.settle()`

Adding a game = add `games/foo.js`, both apps show it. **This needs no CI to "create"
anything** — but CI is still valuable to *validate* configs (see automation below).

---

## Approach B — A code generator (`build-games`)

A small Node script in the shared repo reads every `games/*.js` and emits artifacts. This is
the "tool that creates games" in the literal sense. Example generator responsibilities:

```
golf-games/
  tools/
    generate.mjs          # the codegen tool
  games/*.js              # source of truth (input)
  generated/              # output (committed OR built in CI)
    games.manifest.json   # flat list for quick loading / non-JS consumers
    games.d.ts            # TypeScript types for every game id + option keys
    migrations/           # SQL: e.g. ensure matches.game_type CHECK includes all ids
    GAMES.md              # human-readable catalog (auto docs)
```

Sketch of the generator:

```js
// golf-games/tools/generate.mjs
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { validateGame } from '../schema.js';

const files = (await readdir(new URL('../games/', import.meta.url)))
  .filter(f => f.endsWith('.js'));

const games = [];
for (const f of files) {
  const mod = await import(new URL(`../games/${f}`, import.meta.url));
  games.push(validateGame(mod.default));   // fail the build on bad config
}

await mkdir(new URL('../generated/', import.meta.url), { recursive: true });

// 1) flat manifest (used by tablet/native or fast startup)
await writeFile(
  new URL('../generated/games.manifest.json', import.meta.url),
  JSON.stringify(games.map(g => ({
    id: g.id, label: g.label, banner: g.banner,
    minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
    requires18: !!g.requires18, options: g.options,
  })), null, 2)
);

// 2) TS types so both apps get autocomplete + compile-time safety
const ids = games.map(g => `'${g.id}'`).join(' | ');
await writeFile(
  new URL('../generated/games.d.ts', import.meta.url),
  `export type GameId = ${ids};\n`
);

// 3) SQL guard so the DB constraint always matches the code
const list = games.map(g => `'${g.id}'`).join(', ');
await writeFile(
  new URL('../generated/migrations/game_type_check.sql', import.meta.url),
  `ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_game_type_chk;\n` +
  `ALTER TABLE matches ADD CONSTRAINT matches_game_type_chk CHECK (game_type IN (${list}));\n`
);

// 4) docs
await writeFile(
  new URL('../generated/GAMES.md', import.meta.url),
  `# Game Catalog\n\n` + games.map(g => `## ${g.label} (\`${g.id}\`)\n${g.description}\n`).join('\n')
);

console.log(`Generated artifacts for ${games.length} games.`);
```

Run locally: `node tools/generate.mjs`.

---

## Automating with GitHub Actions

Three useful workflows, all in the **`golf-games`** repo (the master):

### 1. Validate every config on PR (the safety gate)

```yaml
# .github/workflows/validate.yml
name: Validate games
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node tools/validate.mjs   # runs validateGame() on every games/*.js
```

`tools/validate.mjs` just imports each game through `validateGame()` and exits non-zero on
error — so a malformed game **can't be merged**.

### 2. Regenerate artifacts and commit them on merge to main

```yaml
# .github/workflows/generate.yml
name: Generate artifacts
on:
  push:
    branches: [main]
    paths: ['games/**', 'tools/generate.mjs', 'schema.js']
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node tools/generate.mjs
      - name: Commit generated files
        run: |
          git config user.name  "games-bot"
          git config user.email "bot@users.noreply.github.com"
          git add generated/
          git diff --cached --quiet || git commit -m "chore: regenerate game artifacts"
          git push
```

Now `generated/` (manifest, types, SQL, docs) is always in sync with the config — no manual
step. Consumers can import `generated/games.manifest.json` directly.

### 3. Auto-bump the submodule in the consuming apps (optional)

When `golf-games` main changes, open a PR in each app that bumps the submodule pointer:

```yaml
# .github/workflows/notify-apps.yml (in golf-games)
name: Bump downstream apps
on:
  push: { branches: [main] }
jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch to my-golf-app
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.APPS_DISPATCH_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/hlarimer81/golf_app_v2/dispatches \
            -d '{"event_type":"games-updated"}'
      # repeat for rabryn/score_play if they add a matching listener
```

Then each app has a `repository_dispatch: [games-updated]` workflow that runs
`git submodule update --remote`, commits, and opens a PR. You review + merge — so updates
are automatic to *propose*, manual to *accept* (keeps your version-pin safety).

> Cross-owner note: dispatching into `rabryn/score_play` needs a token they grant you, or
> they simply run the bump workflow on their side. Your own `my-golf-app` is fully automatable.

---

## Recommendation

- **Start with Approach A** (runtime interpretation) + **Workflow 1** (validation gate). This
  gives you "add a config file → both apps have the game," with CI preventing bad configs.
- **Add Approach B's generator + Workflow 2** once you want the non-JS outputs (DB constraint,
  TS types, auto docs). It's purely additive.
- **Add Workflow 3** last, when manual submodule bumps get tedious.

This keeps humans authoring *only* the declarative config; the tool + Actions handle
validation, generation, and propagation.

---

Want me to scaffold the `golf-games` repo now — `schema.js`, `index.js`, `tools/validate.mjs`,
`tools/generate.mjs`, the two ported game definitions, and the `.github/workflows/` files —
so it's ready to `git init` and push?
