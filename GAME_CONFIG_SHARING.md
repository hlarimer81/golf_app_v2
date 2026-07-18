# Sharing the Game Config — Master lives in `my-golf-app`, `score_play` consumes it

Short answer: **Yes, this is exactly what git submodules are built for.** The master copy
lives in *your* repo, and the other repo pulls it in read-only and updates on its own
schedule.

Your two repos (confirmed):

| App | Remote | Owner |
|---|---|---|
| `my-golf-app` | `git@github.com:hlarimer81/golf_app_v2.git` | **you** (master) |
| `score_play` | `https://github.com/rabryn/score_play.git` | someone else (consumer) |

Because the two apps are in **separate GitHub repos owned by different people**, you have
two good patterns. I recommend **Option 1** (dedicated shared repo) — it keeps ownership
clean and avoids `score_play` having to vendor your *entire* app.

---

## Option 1 — Dedicated `golf-games` repo (recommended)

You create a small new repo that YOU own, holding only the config + pure logic. Both apps
add it as a submodule. You are still the "master" — you're the only one who pushes to it.

```
github.com/hlarimer81/golf-games   ← you own & control this
        │
        ├── (submodule) my-golf-app/games
        └── (submodule) score_play/web/src/games
```

**Set it up once:**

```bash
# 1. Create the shared repo (locally, then push to a new GitHub repo you own)
mkdir ~/golf-games && cd ~/golf-games
git init
# ... add index.js, schema.js, lib/, games/*.js ...
git add . && git commit -m "Initial game definitions"
git remote add origin git@github.com:hlarimer81/golf-games.git
git push -u origin main

# 2. Add it to YOUR app
cd ~/my-golf-app
git submodule add git@github.com:hlarimer81/golf-games.git games
git commit -m "Add golf-games submodule"

# 3. Add it to score_play (they run this in their repo)
cd ~/score_play
git submodule add https://github.com/hlarimer81/golf-games.git web/src/games
git commit -m "Add golf-games submodule"
```

**Consuming it in code (identical import in both apps):**

```js
import { GAMES, GAMES_BY_ID } from './games';        // my-golf-app: src → ../games? adjust path
```

**Updating after you change a game:**

```bash
# You: edit + push in the shared repo
cd ~/golf-games && git commit -am "Add Wolf Hammer" && git push

# Each app pulls the new version when ready (this is the version-pin safety net)
cd ~/my-golf-app && git submodule update --remote games && git commit -am "Bump games"
cd ~/score_play  && git submodule update --remote web/src/games && git commit -am "Bump games"
```

Key point: each app **pins to a specific commit** of `golf-games`, so your changes never
silently break `score_play` — they upgrade deliberately with `--remote`.

Cloning either app later needs `git clone --recurse-submodules` (or `git submodule update
--init` after a plain clone). CI just adds that one flag.

---

## Option 2 — Submodule directly from `my-golf-app` (master = the app repo itself)

If you'd rather the config physically live *inside* `my-golf-app` (e.g. `my-golf-app/games/`)
and not spin up a new repo, `score_play` can submodule your **whole app repo** and reference
just the `games/` subfolder:

```bash
cd ~/score_play
git submodule add git@github.com:hlarimer81/golf_app_v2.git vendor/my-golf-app
# then import from vendor/my-golf-app/games/
```

- ✅ Master truly lives in `my-golf-app`; nothing new to create.
- ⚠️ `score_play` checks out your **entire** app (all of `src/`, sql, etc.) just to get
  `games/` — heavier, and couples their build to your whole repo.
- ⚠️ `score_play` is owned by `rabryn` — they must run the `submodule add` in their repo and
  need read access to `golf_app_v2` (make that repo public, or grant them read).

Workable, but Option 1 is cleaner because the shared surface is small and independently
versioned.

---

## Option 3 — Git subtree (no submodule discipline)

If the other maintainer dislikes submodules, `git subtree` copies the shared repo's files
directly into each app (no `.gitmodules`, normal clones just work), and you `git subtree pull`
to update. Trade-off: updates are a manual pull command and history is a bit noisier. Same
master-repo model as Option 1.

---

## Recommendation

1. **Create `github.com/hlarimer81/golf-games`** (you own it = you're master).
2. Seed it with the already-pure modules (`lib/golf.js`, `lib/teams.js`, `settlement.js`)
   plus `schema.js`, `index.js`, and `games/stableford.js` + `games/skins.js`.
3. Add it as a submodule in `my-golf-app` at `games/`.
4. Send `rabryn` the one-line `git submodule add ...` command for `score_play`.
5. You push game changes to `golf-games`; each app opts in with `git submodule update --remote`.

### Access note
Since the repos have different owners, make `golf-games` either **public** or grant the
`score_play` maintainer **read access** — that's all they need to consume it. They can never
push to your master unless you add them as a collaborator.

---

Want me to scaffold the `golf-games` folder contents now (schema, index, and the two ported
game definitions using the logic we already extracted), ready for you to `git init` + push?
