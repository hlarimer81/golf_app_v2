# 4Play Golf — guide for agents working in this repo

Real-time golf scoring web app: React 19 + Vite, Supabase (Postgres + Realtime), deployed to
Vercel from `main`. No auth yet — the client talks to Supabase with the anon key.

`TODAYS-PROGRESS-AND-NEXT-STEPS.md` is the running project log: current state, known bugs, and the
prioritized next steps. Read it before picking up anything non-trivial.

## Commands

```bash
npm run dev        # dev server on :5173 (needs .env — see below)
npm run build      # production build
npm run lint       # ESLint; fails only on NEW violations (see Lint)
npm run test:e2e   # Playwright smoke tests, desktop + phone viewports, Supabase mocked
```

CI (`.github/workflows/ci.yml`) runs lint, build and the smoke tests on every PR and push to `main`.

## Hard rules

These protect a live database that real players and deployed hardware depend on.

- **Never use production credentials.** Production is Supabase project `lvwdffsibhqzgbqixfdi`. Agents
  work against the staging project or mocks only. Never read, print, copy or edit `.env`,
  `.env.local`, or any secret.
- **Never run SQL against any database.** You may *write* a migration file in `sql/`; a human
  reviews and applies it. The same goes for `supabase functions deploy`.
- **Never touch the `firmware` storage bucket.** A separate project (score_play) serves device OTA
  updates from it. Never propose deleting, pausing or locking down the Supabase project.
- **Work on a branch and open a PR.** Never push to `main`. One issue per PR; keep diffs focused.
- **score_play is a separate project** that forked from this repo. Don't port code from it or
  propose merging; its schema is different.

## Conventions that exist for a reason

- **Every Supabase write must check that it actually wrote.** An UPDATE/DELETE refused by RLS
  returns HTTP 200 with zero rows and no error. Chain `.select('id')` and treat an empty result as a
  failure. Checking only `error` is the bug, not the fix.
- **New SQL functions: revoke EXECUTE from `anon, authenticated` by name.** Supabase grants it to
  anon by default, so `REVOKE ... FROM PUBLIC` does nothing and a `SECURITY DEFINER` function is
  public the moment it exists.
- **New tables and views: put explicit `GRANT`s in the same migration file.** From 2026-10-30
  Supabase no longer auto-grants new `public` tables to `anon`/`authenticated`, so a table without
  grants is unreachable from the Data API (42501). Grant only what the code does — usually
  `SELECT`/`INSERT`/`UPDATE`, rarely `DELETE` — and `ALL` to `service_role` if an edge function
  touches it. A GRANT is not a policy: keep the RLS policies too. Existing tables are unaffected.
- **Team data:** always use `getPlayerTeam`, `activeTeams`, `getTeamPlayers` from `src/lib/teams.js`.
  The team lives in different fields depending on where the row came from.
- **Scores:** use the `useScores(matchId)` hook (`src/hooks/useScores.js`) for fetch, realtime and
  save. Don't write a new subscription inside a grid.
- **Scoring math** belongs in `src/lib/golf.js` (pure functions), not copied into a grid.
- **New or changed game modes** follow `docs/GAME_MODE_STANDARDS.md` (leaderboard above the
  scorecard, summary screen, team helpers).
- **Handicaps:** `round_differential` is the durable record and deliberately has no foreign key to
  `matches`, which are disposable. 9-hole rounds store scores on holes 10–18. Don't change either
  without reading the handicap section of the progress log.
- **Styling** is inline `style={{}}` objects today. Match the surrounding code unless the PR is
  specifically a styling refactor.

## How agent work flows through this repo

- **Golfer testers file issues freely**, with no label. Filing an issue starts nothing.
- **The coordinator triages** (`.github/workflows/coordinator.yml`, daily): de-duplicates,
  prioritizes, and labels what's worth building **`ready-for-dev`**. That label is the trigger.
  It ships at most a couple of issues per run — approved work over the limit waits for the next
  one rather than queueing five unreviewed changes at production.

  | Label | Meaning |
  |---|---|
  | *(none)* | Filed but not looked at. Starts nothing. |
  | `triaged` | The coordinator has read it. |
  | `ready-for-dev` | Approved — the dev agent builds it, and the PR merges itself. |
  | `needs-info` | Too vague to build as written; a question is waiting on the issue. |
  | `needs-human` | Touches the database, migrations, secrets, auth, the firmware bucket, or maths that can't be verified with a test. Harold does these. |
  | `duplicate` | Covered by another open issue. |
- `.github/workflows/claude-dev.yml` implements the issue on a `claude/issue-<n>` branch and opens a
  PR. It never pushes to main.
- Every PR gets two automatic passes: **CI** (lint, build, smoke tests) and a **Gemini review**
  (`.github/workflows/gemini-review.yml`), which posts a verdict and findings as a comment.
- **The PR merges itself once CI passes**, and Vercel deploys `main` to production. Harold reviews
  after the fact, not before. This is a deliberate choice (2026-09-12) — the loop runs from filed
  issue to live app with no human in it.

**What that means for how you work.** CI is the only thing standing between your PR and real golfers
mid-round. The smoke tests are five shallow checks; they will not catch a wrong Nassau settlement or
a miscomputed index.

- If you change scoring, handicap, or settlement logic, **add tests that would fail without your
  change**. "It builds" is not evidence.
- Say plainly at the top of the PR body when a change touches money or handicaps, so the after-the-
  fact review starts in the right place.
- If an issue is too vague to implement, or asks for something the hard rules forbid, comment on the
  issue saying what you need and stop. Don't guess and don't work around a rule. Nobody is going to
  catch a guess before it ships.

## Staging

`4play_staging` is a separate Supabase project with production's schema, permissions, realtime
setup and nightly cron, holding only fake data from `scripts/staging-seed.sql`:

- **Courses:** Staging Pines (rated Blue/White/Red tees) and Staging Meadows (unrated, so its rounds
  bank as `estimated`, like most real rounds).
- **Roster:** 12 fictional golfers, handicaps 1–28. Ten have eight banked rounds each; Nate Newbie
  has one (below the 3-round minimum) and Gary Guest has none.
- **Round in progress:** join code `LIVE01`, nine holes scored.

Staging is disposable, and a human resets it with `bash scripts/staging-setup.sh --seed-only`. Don't
rely on data you created there surviving.

## Lint

The codebase had ~100 lint errors when CI was introduced. They are recorded in
`eslint-suppressions.json`, so `npm run lint` fails only on violations that aren't already there.

- Don't add to the suppressions file to get a PR green — fix the code.
- When you fix suppressed errors, run `npx eslint . --prune-suppressions` and commit the smaller file.

## Tests

`e2e/` holds Playwright smoke tests. They build the app pointed at a fake Supabase host
(`supabase.test`) and answer its REST calls from fixtures in `e2e/fixtures.js`. Any other
off-machine request is aborted, so a test can never reach production.

- A PR that adds or changes a user-facing flow should add or extend a smoke test for it.
- A test that needs new data: add rows to `e2e/fixtures.js`, keyed by table name.
- Tests run at desktop and phone width. The app is used one-handed on a course, so phone width is
  the one that matters.

## Where things live

- `src/App.jsx` — round setup, join, recent rounds, routing between screens
- `src/*Grid.jsx` — one component per game mode (11)
- `src/lib/` — pure logic: `golf.js`, `teams.js`, `handicap.js`, `gameRegistry.js`, `playerStats.js`
- `src/components/` — player pages, course request/entry, green GPS wizard
- `supabase/functions/request-course/` — edge function that imports courses from the Golf API
- `sql/` — one-shot migrations and diagnostics, applied by hand; not a replayable history
- `scripts/` — one-off Node data tools (use production credentials — agents don't run these)
- `docs/` — game mode standards, API reference, troubleshooting, security
