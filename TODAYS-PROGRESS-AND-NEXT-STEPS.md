# Golf App Progress - August 8, 2026 (Updated)

## Latest Session (Aug 8) - score_play split, and what it unblocks ✅

No code changed. This session established where this app stands relative to `score_play`, and the
answer reshapes the auth plan below.

### 1. ✅ score_play has hard-forked this app — split accepted

`~/Documents/Personal_Software/score_play` contains `web/`, which arrived as a git subtree of this
repo, byte-identical to `860fffb` (Jul 17). Ryan Bryngelson then ported it to a redesigned schema
between Jul 31 and Aug 4 — auth, a new data layer, and the C scoring engine compiled to WASM.

**Decision: this repo continues standalone. score_play is a separate project.** No merge, no sync
convention.

Divergence at the split: 39 files touched, +3,376 / −2,798, ~36% of the tree byte-identical. Their
additions are almost entirely the data layer (`src/lib/`, `src/auth/`, `src/engine/`). The five
bespoke game grids (Nassau, Skins, Wolf, Wolf Vegas, Stableford) and the legacy JS scoring engine
(`settlement.js`, `nassauEngine.js`, `lib/golf.js`) are still this repo's code, unchanged.

### 2. ✅ The databases are fully separate

| | Supabase project |
|---|---|
| **this app** | `lvwdffsibhqzgbqixfdi` — legacy flat schema (`matches` / `players` / `scores` / `golf_courses` / `tee_boxes`) |
| score_play prod | `jnflakqaptrgnfbqslld` |
| score_play dev | `mxhutmpewzfxpkbyneqi` |

Their schema is singular snake_case (`event` / `play_group` / `participant` / `score` / `golfer` /
`course` / `tee`). **Schema changes here cannot affect them.**

Consequence accepted: this app and the Tab5 / e-paper displays can no longer be used in the same
round. The displays speak the new schema only.

### 3. ⚠️ One live coupling survives — firmware OTA is hosted here

`score_play/tools/release/merge.py` defaults its firmware download base URL to
**this project's public `firmware` storage bucket**, and every product build (`p4/`, `epd/`, `gps/`,
`c6/`) invokes it with no override. Devices fetch the manifest from score_play's prod project, then
download the `.bin` from here.

**Do not delete, pause, or lock down this Supabase project** — every deployed unit would lose OTA.
Schema changes are harmless; project lifecycle is not. Fix is Ryan's: repoint `DEFAULT_BASE_URL` and
re-publish. Needs an email.

### 4. 🐛 Green GPS wizard has NEVER saved — silent RLS refusal, fixed

Chased the on-course green test. It didn't save, and neither has any other: **no wizard-written
green exists in the database.** Only Veenker has green data (18 holes), and none of it carries the
`added_by: 'user'` / `added_at` stamp `AddGreenData.jsx` always writes — it is all converted
polygon data from the earlier f/c/b migration.

**Root cause: `golf_courses` has RLS enabled but no anon UPDATE policy.** Confirmed by no-op PATCH
probes with the anon key:

| Table | no-op anon UPDATE | |
|---|---|---|
| `golf_courses` | 0 rows, HTTP 200 | **blocked** |
| `courses` (legacy) | 1 row | allowed |
| `matches` | 1 row | allowed |

An UPDATE refused by a policy's `USING` clause **matches zero rows and does not raise.**
`AddGreenData.jsx` checked only `updateError`, which stayed null, so the wizard showed a success
screen having written nothing.

**The July 14 refetch fix is what exposed this.** Before it, the in-place `courseData.greens`
mutation made the green appear to persist for the session; after it, the refetch pulls back
unchanged data and the green vanishes immediately.

**THE REAL ROOT CAUSE, found while creating a test course:** `sql/enable-rls-golf-tables.sql`
granted every write policy on `golf_courses` and `tee_boxes` **`TO authenticated`**. This app has no
authentication — `supabaseClient.js` uses the anon key and there is not one `supabase.auth.*` call
in `src/`. So every request the app has ever made arrives as `anon`, and **not one of those eight
policies has ever matched a single call.** Confirmed by reading `pg_policies` directly.

Two shipped features were broken the whole time, with different symptoms, because INSERT and UPDATE
fail differently under RLS:

| Feature | Operation | Symptom |
|---|---|---|
| Add Green GPS Data | `UPDATE golf_courses` | **silent** — 0 rows, HTTP 200, no error, false success |
| Manual Course Entry | `INSERT golf_courses` / `tee_boxes` | **loud** — raises `42501` |

**Fixed and verified against the live database (Aug 8):**
- `sql/add-golf-courses-update-policy.sql` — **applied.**
- `sql/fix-anon-write-policies-courses.sql` — **applied.** Grants anon INSERT + UPDATE on both
  tables; deliberately withholds DELETE (the app never deletes a course, and the anon key ships in
  the client bundle).
- `src/components/AddGreenData.jsx` — `.select('id')` on the update, and a thrown error when zero
  rows come back. A 2xx with no rows is a failure, not a success.

Verified from the **anon** role, not as `postgres` (which bypasses RLS and would pass vacuously):
app's exact `fetchGolfCourses()` query returns the course usable · anon INSERT into `golf_courses`
PASS · anon INSERT into `tee_boxes` PASS · anon DELETE still blocked PASS. Probe rows removed.

Earlier round-trip proof of the green path on Deer Run, mirroring `saveGreenData()` exactly:
read → append → update with `.select('id')` → **1 row** → independent read-back found the green →
restored to null. No probe data remains anywhere.

**Test course created for on-course GPS testing:** `ZZ TEST - GPS Wizard (delete me)`, 18 holes,
par 72, one "Test" tee set, `greens = NULL` so every hole offers the Add Green button. `ZZ` prefix
sorts it to the bottom of the picker. Created by `sql/create-test-gps-course.sql`, which carries its
own cleanup `DELETE` (commented) at the foot. **Note `golf_courses` has no lat/lon columns** —
`location` is a display label only, all geography lives in `greens`, so the course becomes "at your
location" the moment you capture a green there.

**Tooling:** psql now available at `/opt/homebrew/opt/libpq/bin/psql` (keg-only libpq). Session
pooler on port 5432 — NOT the transaction pooler on 6543, which does not handle `DO` blocks.
Password lives in `.env.local` (gitignored by `*.local`), deliberately separate from `.env`, whose
`VITE_`-prefixed vars get baked into the client bundle.

**Still open — same class, elsewhere.** Three of the six write sites in `src/` discard their result
entirely (`usePresses.js:23,31` use `.then(() => {})`, `useWolfVegasState.js:58` checks only
`error`). Worth the same treatment.

### 5. 🐛 `usePresses.js` writes to a column that does not exist

`matches` has `press_mode`, `wager`, `wolf_partners`, `wolf_vegas`, `wv_hammers` — but **no
`presses` column.** Both call sites write `{ presses: next }` and swallow the resulting `42703`
with `.then(() => {})`. Consistent with the known "Nassau presses need DB persistence" backlog item
below, but the code currently pretends to save. Not fixed — needs the schema decision first.

### 6. ✅ HANDICAP SYSTEM — built, backfilled, wired (commit `c5f8a86`)

**The constraint that shaped it:** `delete_old_matches()` drops scores, players, teams and matches
older than 30 days. Computing handicaps *on read* from round history would make every index shift
silently as rounds aged out — no error, no trace, and money is played off these numbers.

**So the durable unit is `round_differential`** — one row per player per round, banked at
completion, carrying **no foreign key to `matches`**. CASCADE would destroy the history; SET NULL
would erase provenance and break the key preventing double-banking. The round is disposable; the
differential is the record.

That answers "on completion or on a schedule?" — **on completion**, because that is when the round
is guaranteed to still exist. A sweep is the backstop, not the primary path.

**The math:** net-double-bogey capping, `(113/slope) × (AGS − rating)`, average of the lowest N of
the last 20 per the WHS reduction table, 3-round minimum. Capping uses the handicap the player
actually played off that day, not their current index — sidestepping the chicken-and-egg where an
index needs an adjusted score needs a course handicap needs an index.

**~90% of rounds have no rating or slope**, so that is the normal case, not a footnote. They fall
back to slope 113 / rating = par (strokes over par) and are flagged `method='estimated'`.

**Validation — computed vs hand-entered handicaps the system never saw:**

| Player | Computed | Hand-entered | Rounds |
|---|---|---|---|
| H Larimer | 22.6 | 20 | 20 |
| Ryan B | 9.1 | 11 | 20 |
| Nick G | 7.0 | 10 | 20 |
| Roger E | 15.2 | 16 | 18 |
| M Boeve | 20.5 | 22 | 14 |
| Matt H | 8.3 | 10 | 10 |
| Barry C | 17.9 | 19 | 7 |
| Karl M | 13.0 | 18 | 4 |
| Mindy B | 21.0 | 20 | 3 |

**Wiring:** Finish Round now writes `status='completed'` and banks differentials in all 11 grids —
it previously called `setShowSummary(true)` and nothing else, which is why all 282 matches sat at
`status='setup'`. Round setup defaults each player's handicap to their computed course handicap for
the selected tee, falls back to the roster number below 3 rounds, and captions where the number came
from and whether it has been overridden. The dropdown stays editable.

**Aliases applied** (`sql/handicap-aliases-proposed.sql`): 9 merges, 31 rows reassigned, **17
phantom golfers down to 12.** Evidence was non-overlapping date ranges — every short name ran
Apr 10–May 02, every long name started May 08+, i.e. the roster naming convention changed in early
May. Simulated and rolled back before applying. Note Ryan B and Nick G did **not** change: their
duplicate rounds are older than their most recent 20, and WHS only looks at the last 20.

**Bad data marked, not discarded** — a refused row leaves no trace of why and cannot be revisited.
3 excluded: two Lake Creek rounds producing a −11.0 index (9-hole course whose par array is the nine
duplicated to 18) and one belonging to `BVRMC Scramble`, a team entry sitting in `players` as a
person.

### 7. 🔐 Supabase makes every function anon-executable by default

Granting `golf_sweep_unbanked()` to `service_role` only did **not** restrict it — it still ran as
anon. `REVOKE ... FROM PUBLIC` changed nothing either. The ACL showed why: `anon=X/postgres`, an
explicit grant, because Supabase ships
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role`.

**Every function you create here is executable by anon the moment it exists, so a SECURITY DEFINER
function is public by default and the usual REVOKE-FROM-PUBLIC idiom is a no-op.** It must be
revoked from `anon, authenticated` **by name**. Found by testing, not by reading.

Applies to any function added from here on — carry it into the auth/RLS work.

### 8. 🔓 The `players` constraint is gone — auth plan needs revisiting

The auth design below was built around *"`players` stays untouched, it's shared with the other app."*
**That is no longer true.** Nothing else reads `players`: score_play's web app queries
`golfer`/`participant`, and `golf_sync.c` — the only firmware client that ever spoke this schema —
was deleted outright.

The parallel `users` table was a compatibility concession to a constraint that no longer exists. See
Next Steps.

---

## Previous Session (July 14) - Realtime Sync + GPS Modal + Repo Cleanup ✅

### 1. ✅ Fixed "Add Green GPS Data" button (was silently no-op)
**Problem:** Tapping the button did nothing on-course during testing.

**Root cause:** `courseData` memo in `App.jsx` returned `pars`/`handicaps`/`greens` but never included `id` or `name`. `GolfGPSWidget`'s modal gate `if (showAddGreen && courseData?.id)` was always false, so the click set state but rendered nothing.

**Fix:** Added `id` and `name` to the `courseData` memo. One-line change.

**Commit:** `554e08a`

### 2. ✅ Wired proper refetch after adding green data
**Problem:** After a successful save, the widget was mutating `courseData.greens` in place and bumping a local `refreshKey`. Worked within the widget's own session, but on any parent re-render the fresh green would vanish until the whole app was reloaded.

**Fix:**
- Pass `fetchGolfCourses` from `App.jsx` down as `onCourseRefresh` prop
- `handleAddGreenComplete` awaits the parent refetch before closing the modal
- Dropped the mutation hack and `refreshKey` workaround (−11 lines net)

**Commit:** `e1ce75b`

### 3. ✅ Fixed cross-device realtime score sync
**Problem:** Multiple players in separate groups all committing scores to the same match, but other players' updates weren't showing up on the web app.

**Root cause:** Client subscription code was already wired in every grid, but the `scores` table had `REPLICA IDENTITY DEFAULT`. On UPDATE/DELETE, Postgres logical decoding only ships the primary key + changed columns — the row-level filter `match_id=eq.<X>` couldn't match because `match_id` wasn't in the payload. First entry of a score (INSERT) worked; every edit/clear afterwards was silently dropped by the server.

**Fix (SQL, applied directly):**
```sql
ALTER TABLE public.scores REPLICA IDENTITY FULL;
```

Immediate effect — no app changes, no deploy. Tested on-course and confirmed working.

### 4. ✅ Consolidated 9 grids onto the `useScores` hook
**Problem:** Aggregate, Chairman, FourBall, Nassau, NinePoint, Singles, Vegas, Wolf, and WolfVegas each had their own copy-pasted fetch/subscribe/optimistic-save block. Three of them (`WolfGrid`, `VegasGrid`, `NassauGrid`) shared the literal channel name `'realtime-scores'`, which is subscription-collision territory.

**Fix:** All 9 now use `useScores(matchId)` — the same hook Skins and Stableford already use. Channel is keyed by `matchId`, so no collisions.

**Net −415 lines** (28 added, 443 removed).

**Commit:** `3033137`

### 5. ✅ Reorganized root folder
**Problem:** ~65 loose SQL migrations, one-off JS scripts, and session-report docs at the repo root.

**Structure:**
- `sql/` — one-shot migrations & diagnostic queries (24 files)
- `scripts/` — one-off Node data checks, migrations, API tests (22 files)
- `docs/` — active reference (game mode standards, API refs, troubleshooting, security, schema guide, codebase review)
- `docs/archive/` — one-time session reports and superseded notes (13 files)

Removed empty stray `golf_app_v2/` directory. Verified no code references were broken.

**Commit:** `2423ca5`

**Root now contains just:** `docs/`, `scripts/`, `sql/`, `src/`, `supabase/`, `public/`, config files, `README.md`, this progress doc.

---

## Previous Session (July 13 Evening) - Green GPS Feature Implementation ✅

### 9. ✅ Manual Green GPS Entry Feature - COMPLETE & DEPLOYED
**Problem:** No GPS yardage data available for greens. OSM data too sparse to be useful.

**Solution Implemented:**
- **Database Migration:** Migrated greens from complex polygons to simple front/center/back GPS points
- **New Component:** `AddGreenData.jsx` - 3-step wizard for users to contribute green data during rounds
- **Updated GPS Widget:** Shows "Add Green GPS Data" button when hole has no data
- **OSM Integration Enhanced:** Extracts front/center/back from polygons when available
- **Backward Compatible:** Supports old polygon format, old f/m/b array format, and new format

**Features:**
- Real-time GPS accuracy indicator (requires <15m for capture)
- Walk to front/center/back of green and capture coordinates
- Data instantly shared with all players
- Crowdsourced database grows organically
- Option to update existing green data

**Deployment Status:**
- ✅ Database migrated via Supabase CLI
- ✅ Edge function deployed with enhanced OSM integration
- ✅ Frontend built and auto-deployed via Vercel
- ✅ All changes committed and pushed to GitHub

**New Data Format:**
```json
{
  "hole": 1,
  "front": {"lat": 36.568, "lon": -121.950},
  "center": {"lat": 36.569, "lon": -121.951},
  "back": {"lat": 36.570, "lon": -121.952}
}
```

**Paid API Research:**
- Researched 18Birdies, SwingU, GolfLogix for comprehensive GPS data
- Est. cost: $500-2,000/month for 40,000+ courses
- Decision: Monitor crowdsourced adoption for 3 months, then decide

**Documentation Created:**
- `GREEN_GPS_IMPLEMENTATION_SUMMARY.md` - Complete feature overview
- `OSM_INTEGRATION_STATUS.md` - OSM audit (5 major courses tested, 0 had green data)
- `GREEN_DATA_OPTIONS.md` - Analysis of all data sources
- `PAID_GPS_API_RESEARCH.md` - Vendor research with contact info
- `DEPLOYMENT_COMPLETE.md` - Deployment checklist and status

**Files Modified:**
- `src/GolfGPSWidget.jsx` - Added manual entry button and new format support
- `supabase/functions/request-course/index.ts` - Enhanced OSM integration
- `src/components/AddGreenData.jsx` - NEW: Manual entry UI
- `migrate-to-fmb-greens.sql` - NEW: Database migration script

---

## Previous Session Accomplishments

### 1. ✅ Removed Bad Course Data
**Problem:** Several courses had invalid data (all par 4s, incomplete tee boxes).

**Courses Removed:**
- AGCC
- Deer Run
- Homewood
- Lake Creek Golf Course
- The Tournament Club of Iowa (both entries)
- Wapsipinicon Country Club
- Fort Dodge Country Club
- Spring Valley

**Fix:** Deleted from new course data table via SQL.

### 2. ✅ Fixed Course Data Validation
**Problem:** Edge function was creating courses even when Golf API returned no tee box data.

**Solution Implemented:**
- Added validation in `request-course/index.ts`
- If no valid tee boxes, DELETE the course
- Return `incompleteData: true` response
- Offer manual entry instead of creating bad data

**Code Changes:**
```typescript
// Check if we have valid tee data - if not, don't create bad data
if (allTees.length === 0) {
  // Delete the course we just created since we can't populate it properly
  await supabase.from('golf_courses').delete().eq('id', newCourse.id)
  return new Response(JSON.stringify({
    success: false,
    incompleteData: true,
    message: `Found "${course.course_name}" but it has no tee box data. Would you like to add it manually?`
  }), ...)
}
```

### 3. ✅ Fixed Vegas Leaderboard
**Problem:** Vegas team scores weren't displaying in the leaderboard.

**Root Cause:** VegasGrid was using `p.team` directly instead of team helper functions.

**Solution:**
- Imported `getPlayerTeam()` and `activeTeams()` from `lib/teams.js`
- Updated all team access to use helpers
- Added "🎰 Vegas Leaderboard" header above scorecard
- Running team scores now display correctly

### 4. ✅ Fixed Duplicate Manual Entry Prompt
**Problem:** RequestCourseForm was asking "Would you like to add it manually?" twice.

**Solution:** Use `data.message` directly without appending duplicate text.

### 5. ✅ Removed Yardage from Manual Entry
**Problem:** Manual course entry asked for yardage per hole, which we don't use.

**Solution:**
- Removed yardage input from ManualCourseEntry form
- Set yardage to `null` in database
- Only collect par and stroke_index

### 6. ✅ Removed Stacked Games and Quota Features
**Problem:** Unused features cluttering the UI and codebase.

**Changes Made:**
- Removed `useQuota` state from App.jsx
- Removed "Stacked Games/Quota" dropdown UI
- Removed `use_quota` from match creation and loading
- Removed `useQuota` prop from all 11 Grid components via sed script
- Updated GAME_MODE_STANDARDS.md to remove quota references

### 7. ✅ Completed Game Mode Audit - ALL 11 GAMES
**Massive accomplishment:** Reviewed all 11 game modes for leaderboards and summaries.

**Games Reviewed:**
1. ✅ Stableford - Complete
2. ✅ Vegas - Fixed and complete
3. ✅ Skins - Complete
4. ✅ Nine Point - Complete
5. ✅ Chairman - Complete
6. ✅ Four-ball - Already complete (user correctly identified)
7. ✅ Singles - Added leaderboard
8. ✅ Wolf - Has custom summary screen
9. ✅ Nassau - Added Front/Back/Overall scoring
10. ✅ Wolf Vegas - Has custom summary screen
11. ✅ Aggregate - Has custom summary screen

**Summary Screen Patterns:**
- **8 games use MatchSummary.jsx:** Stableford, Vegas, Skins, Nine Point, Chairman, Four-ball, Singles, Nassau
- **3 games use custom summaries:** Wolf, Wolf Vegas, Aggregate (built directly into Grid components)

### 8. ✅ Created Game Mode Documentation
**Created GAME_MODE_STANDARDS.md:**
- Complete standards for implementing game modes
- Team helper usage patterns
- Leaderboard display standards
- Summary screen standards
- Configuration matrix for all 11 games
- Testing checklist
- Common mistakes to avoid

**Created GAME_MODE_AUDIT.md:**
- Audit report showing status of all 11 games
- Detailed findings for each game
- Summary of what was fixed

## Files Modified Today

### Backend
- `supabase/functions/request-course/index.ts` - Added validation to prevent bad course data

### Frontend Components
- `src/App.jsx` - Removed quota/stacked games features
- `src/VegasGrid.jsx` - Fixed team helpers, added leaderboard
- `src/SinglesGrid.jsx` - Added leaderboard with medals
- `src/MatchSummary.jsx` - Added Nassau scoring logic
- `src/components/RequestCourseForm.jsx` - Fixed duplicate message
- `src/components/ManualCourseEntry.jsx` - Removed yardage field
- All 11 Grid components - Removed useQuota prop

### Grid Components Updated
- AggregateGrid.jsx
- ChairmanGrid.jsx
- FourBallGrid.jsx
- NassauGrid.jsx
- NinePointGrid.jsx
- SinglesGrid.jsx
- SkinsGrid.jsx
- StablefordGrid.jsx
- VegasGrid.jsx
- WolfGrid.jsx
- WolfVegasGrid.jsx

### Documentation Created
- `GAME_MODE_STANDARDS.md` - Comprehensive game mode development guide
- `GAME_MODE_AUDIT.md` - Audit results for all 11 games

## Git Commits Today
1. Auto-select newly created courses
2. Add manual course entry form
3. Add state filtering and manual entry option for courses
4. Fix successCount scope error
5. Fix syntax error in request-course edge function

## Database Changes

### Courses Deleted (Bad Data)
```sql
DELETE FROM golf_courses WHERE id IN (
  '...AGCC...',
  '...Deer Run...',
  -- etc.
);
```

### Edge Function Deployed
```bash
npx supabase functions deploy request-course
```

## Key Learnings

### Team Data Access Pattern
Player data from database can have team stored in different shapes:
- `player.teams.team_name`
- `player.team`
- `player.team_name`

**Solution:** ALWAYS use helper functions from `lib/teams.js`:
```javascript
import { getPlayerTeam, activeTeams, getTeamPlayers } from './lib/teams';

const teamName = getPlayerTeam(player);  // NOT player.team
const teams = activeTeams(players);
const teamPlayers = getTeamPlayers(players, teamName);
```

### Wolf Game Limitation
Wolf partner choices are NOT persisted to database, only scores are. This means we cannot recalculate exact Wolf points in the summary screen. Added warning message to user about this limitation.

### Nassau Complexity
Nassau has Front/Back/Overall scoring PLUS presses and wagers. Implemented basic F/B/O scoring in summary. Full press/wager calculation would require additional database persistence.

### Custom Summary Screens
Some games (Wolf, Wolf Vegas, Aggregate) have complex scoring that benefits from custom summary screens built directly into the Grid component rather than using the shared MatchSummary.jsx.

## Current System State

### Working Features ✅
✅ All 11 game modes have in-game leaderboards  
✅ All 11 game modes have end-of-round summary screens  
✅ Course data validation prevents bad data  
✅ Manual entry as fallback when API fails  
✅ Team helper functions standardized across all games  
✅ Vegas scoring fixed and working correctly  
✅ Stacked games/quota features removed  
✅ Comprehensive documentation for game mode development  
✅ **Manual green GPS entry with crowdsourcing**  
✅ **GPS widget shows front/middle/back distances**  
✅ **OSM integration with enhanced logging**  

### Game Mode Scoring Summary

| Game | Type | Scoring Method |
|------|------|----------------|
| Stableford | Singles/Teams | Points based on score vs par |
| Vegas | Teams (2v2) | Two-digit scores, birdie flip |
| Skins | Singles/Teams | Lowest score wins skin |
| Nine Point | Singles (3p) | 9 points distributed per hole |
| Chairman | Teams | Defend the chair, accumulate points |
| Four-ball | Teams | Match play, best ball |
| Singles | Singles | Stroke play, net/gross |
| Wolf | Singles (4p) | Rotating wolf, partner selection |
| Nassau | Singles/Teams | Front/Back/Overall wagers |
| Wolf Vegas | Teams (4p) | Wolf + Vegas hybrid |
| Aggregate | Teams (2p) | Sum of partners' nets |

## Next Steps

### 🧪 Immediate - On-Course Testing
1. ✅ **COMPLETED:** Review all game modes for leaderboards/summaries
2. ✅ **COMPLETED:** Green GPS manual entry feature
3. ✅ **COMPLETED (July 14):** Test green GPS feature — bug found & fixed, needs re-test on course
4. ✅ **COMPLETED (July 14):** Cross-device realtime score sync working
5. **Re-test green GPS on course** - Verify the modal now opens and full 3-step wizard flows.
   **Unblocked (Aug 8):** the missing UPDATE policy is applied and the write path is verified
   end to end against the live database. The wizard will now either save or throw a real error;
   it can no longer fail quietly. This is the one item that needs a real round to close.
6. **Test game modes in production** - Play rounds with each game to verify scoring
7. **Monitor green data adoption** - Track how many users contribute GPS data

### 🎯 Next Major Feature - User Authentication & Profiles
**Goal:** Enable calculated handicaps and a "recent partners" list for repeat players, without adding friction to casual/guest rounds.

**Design status:** Model agreed, no scaffolding yet.

#### Auth model
- Supabase Auth via magic link. Session persists (long-lived refresh token), so mid-round re-auth is rare; when it does happen, app-switching to email is acceptable friction.
- **Match creator must be signed in.** The match belongs to their account.
- **Guest mode is always the escape hatch** — non-creator players can be added as guests without an account.

#### Data model — two parallel populations
> ⚠️ **REVISIT BEFORE BUILDING (Aug 8).** This design assumed `players` was shared with another app
> and had to stay untouched. It isn't, and it doesn't — see Latest Session §4. The parallel `users`
> table was a workaround for a constraint that no longer exists. Reshaping `players` directly is now
> on the table and is probably the simpler model.

- ~~**`players` table stays untouched.** Continues to serve as the guest list and remains shared with the other app that depends on it.~~ **Obsolete — nothing else reads `players`.**
- **New `users` table** for accounts. Populated at signup, forms the global directory.
- Match roster mixes both: some slots reference a `players` row (guest), some reference a `users` row (account holder).
- Handicap history and "recent partners" are computed only off the `users` side. Guests are scored but nothing accumulates for them.

**Alternative now open:** one `players` table with a nullable `account_id` — non-null means an
account holder whose stats accumulate, null means a guest. Collapses two populations into one and
deletes the claim-flow problem, since promoting a guest becomes setting a column rather than
migrating rows. This is close to the model score_play landed on independently (their "first-class
golfer / saved roster person / guest" tiers), which is some evidence it holds up.

#### Account-only features
- **Calculated handicap** from round history stored against `user_id`.
- **Recent partners list** — populated by shared matches between accounts, powers a fast-add dropdown at match creation.
- **Global directory search** by email/name to add other users to a match.

#### Deliberate tradeoffs
- **No claim flow at launch.** If Alice plays with Bob-as-guest 10 times before Bob signs up, that history is invisible to both once he has an account. Accepted in exchange for keeping setup fast.
- **Schema leaves the door open for a later claim flow.** Likely a `player_email_hints(player_id, email)` sidecar table so `players` itself stays untouched — an account holder can attach an email to a guest name, enabling a future "invite / claim your rounds" flow.

#### Open questions (park until implementation)
- ~~**How the other app uses `players`**~~ — **ANSWERED Aug 8: it doesn't.** No external reader of
  this schema exists. Any schema decision here is now unilateral.
- **RLS strategy.** Whole app currently runs on the anon key with no row-level rules. Introducing auth without RLS = fake security; introducing RLS breaks every existing anon query. Big scope, needs its own plan. **This is the real blocker** — the largest remaining piece of the auth work.
- **Global directory disambiguation** — "which John Smith?" UX, and the email-privacy question when searching by email.
- **Entirely-guest matches (creator excepted)** — should fall out naturally as "contribute nothing to handicap/recents," but worth sanity-checking during implementation.

**Free reading:** `score_play/doc/db_design.md` works this exact problem end to end — player identity
tiers, RLS policy design, and a list of gotchas found by attacking their own schema (silent blocked
writes, `FOR ALL` policies applying to SELECT, per-row vs per-query predicate cost). Not a schema to
adopt, but the reasoning transfers and it is already on disk.

### 🧮 Handicaps — deliberately deferred, with reasons

Assessed with evidence on 2026-08-08 and **judged not worth doing yet.** Recorded so they are not
rediscovered as gaps.

- **9-hole rounds don't count.** 29 qualifying player-rounds across 21 players — ~1.4 each, too thin
  to move anyone's index, and WHS 9-hole pairing (two nines combined into one differential) is real
  work. The one argument for it: 13 players sit at 1–2 banked rounds, just under the 3-round
  minimum, so a few would gain an index at all. Revisit if nines become common.
- **The scheduled backstop isn't scheduled.** `golf_sweep_unbanked()` exists, is correctly locked to
  `service_role`, and can be run by hand through psql. pg_cron is **not** installed; a Supabase
  scheduled edge function is the likely route.
- ⚠️ **THE DEPENDENCY THAT MATTERS: never schedule `delete_old_matches()` without scheduling the
  sweep first.** A round nobody pressed Finish on is unbanked, and the delete would take it with no
  trace. Both are dormant today, which is consistent. Turning on one without the other is the
  failure mode.
- ~~**The two-Matts ambiguity**~~ — **RESOLVED 2026-08-08 by Harold.** `Matt` (5 rounds) excluded as
  unattributable; `Matt F` merged into `Matt Flum`; `Matt H` and `Matt Adams` stand alone. Excluded
  rather than deleted — the scores are real, they just cannot be pinned to a person, and the call
  reverses with an UPDATE.
- **Remaining alias calls, still open:** the roster duplicates, chiefly `Jordan B` (hcp 15) vs
  `Jordan Burgie` (hcp 7) — 8 strokes apart, so one of those numbers is wrong regardless of the
  merge — plus `Hampton`/`Justin Hampton`, `Iiams`/`Chris Iiams`, `Hunzy`/`Andy Hunziker`,
  `Pyle`/`Ben Pyle`. Commented out in `sql/handicap-aliases-proposed.sql` rather than guessed at.

### Medium Priority (After User Auth)
4. **Add course editing** - Allow users to edit existing course/tee box data
5. **Course search/filter** - When course list gets long, add search box
6. **Improve manual entry UX** - Better preset options, validation

### Low Priority
7. **Nassau presses** - Add press/wager tracking to database
8. **Wolf persistence** - Save partner choices to database for accurate summary
9. **Course usage stats** - Show which courses are used most often
10. **Multi-tee entry** - Add multiple tee boxes at once in manual entry
11. **Paid GPS API decision** - After 3 months, evaluate 18Birdies partnership

## Testing Checklist

### Course Creation ✅
- [x] API course request with valid data
- [x] API course request with incomplete data (triggers manual entry)
- [x] Manual course entry (full workflow)
- [x] Course auto-selection after creation
- [ ] Test state filtering (ensure out-of-state courses rejected)

### Green GPS Feature 🧪
- [ ] Open GPS widget during a round
- [ ] Test "Add Green GPS Data" button appears on unmapped holes
- [ ] Complete 3-step wizard (front, center, back)
- [ ] Verify GPS accuracy indicator works (<15m required)
- [ ] Confirm data saves to database
- [ ] Verify green data shows for subsequent rounds
- [ ] Test "Update Green GPS Data" on holes with existing data

### Game Modes 🎮
- [ ] Test each of 11 game modes
- [ ] Verify leaderboard displays during play
- [ ] Verify summary screen at end of round
- [ ] Test with 2, 3, and 4 players (as applicable)
- [ ] Test net vs gross scoring for each game
- [ ] Test GPS widget during actual play

## User Workflow Summary

### Game Mode Selection
1. Choose game type from dropdown
2. Select singles or team play (if applicable)
3. Select net or gross scoring (if applicable)
4. Leaderboard displays during play
5. Summary screen shows at end of round

### Course Data Quality
1. API fetches course data
2. Validation checks for complete tee boxes
3. **If valid:** Course created and selected
4. **If invalid:** Course deleted, manual entry offered
5. **Manual entry:** User provides par/stroke index only (no yardage needed)

---

## Git Commits Today (Evening Session)

**Commit:** `c0a0640` - "Add manual green GPS entry feature"
- Migrated greens to front/center/back format
- Created AddGreenData component
- Updated GolfGPSWidget with manual entry
- Enhanced OSM integration
- Complete documentation suite

**Deployed:**
- Database: ✅ Migrated via Supabase CLI
- Edge Function: ✅ Deployed to Supabase
- Frontend: ✅ Auto-deployed via Vercel

---

**Status:** Standalone. score_play split accepted; this app owns its schema outright.
Green GPS working end to end. Handicap system live, backfilled and wired.
**Next Focus:** Play a round to exercise Finish Round → banking on real data; then revisit the auth
data model now that the `players` constraint is lifted, with RLS as the main scope.
**Major Milestone:** System is feature-complete for core gameplay + GPS.

**Watch item:** score_play's firmware OTA downloads from this project's storage bucket. Don't retire
the project. See Latest Session §3.

**Last Updated:** August 8, 2026 - score_play split established; auth plan unblocked
