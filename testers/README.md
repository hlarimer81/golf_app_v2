# AI golfers

Hazard, Rough, Rake and Mulligan are four AI golfers who play one real round a night on the live
app, as a foursome, and file what they find. `.github/workflows/ai-golfers.yml` runs them.

- **Hazard** is AI player 1 and stands in for Harold. **Rough** is AI player 2 and stands in for
  Ryan. Both are saved players in the live app, created by Harold on 2026-10-01 with Harold's and
  Ryan's handicaps as their starting points.
- **Rake** and **Mulligan** joined on 2026-10-03 to make a foursome, starting at handicaps of 15
  and 10. Harold creates them as saved players in the live app; no agent can.
- **They are real guests.** No account, no database key: they use the website the way a friend
  would. Their rounds are banked, their handicap indexes move, and they appear in the player
  directory and Previous Rounds beside everyone else.
- **They only touch their own rounds**, play existing courses only, and never add or edit courses,
  players or green GPS data. This is an instruction in their prompt, not a lock.

## What they play

`scenarios.js` is the coverage plan. The workflow picks tonight's scenario from it; the golfers do
not choose. It covers all eleven games across 18 and 9 holes, gross and net, every handicap
allowance in use, playing off the low handicap or not, skins carryover on and off, wagers, presses,
a back-nine start and team play. A scenario is played by all four golfers unless it names its
`players`: 9-Point takes exactly three, and two Nassaus stay head to head. Where four play a
two-sided game the scenario says who is on which side, and in Wolf and Wolf Vegas it says what the
Wolf chooses on each hole. One a night goes round the list in 29 nights and then starts again, each lap pairing
every scenario with a different "behaviour" — fixing a score, clearing one, reloading mid-round,
rejoining by code, checking the player pages afterwards.

**Every round also gets a second-phone check.** One browser keeps score for the whole group, which is
how the app is mostly used, but it means nobody looks at the round from another phone. So before
finishing, the golfer opens the round in two new tabs — once from Previous Rounds, once by match
code — and compares the holes shown, every handicap, every score and the standings against the
phone that kept score. It looks and does not touch. This exists because Harold, watching the
second round, found that Previous Rounds reopened a back-nine round as 18 holes from the 1st; the
golfers could not have seen it. Two golfers on two phones, each scoring their own ball, is not
built yet.

Wolf Vegas can also be played by five; that is not covered. To add a golfer: create the saved
player in the app, add the name to `GOLFERS`, and add scenarios for what becomes playable.

## What they shoot

`scorecard.js` produces each golfer's card from the handicap the app fills in at setup. A typical
round is about three strokes worse than the handicap, because an index is the best 8 of the last
20 rounds and a golfer averages worse than their index. Without that, each new index would come
out a little lower than the last. Rounds are bounded to between 3 under and 9 over the handicap.

Nothing else steers their handicaps. The banked rounds move the index, the next round plays to the
new index, and their games drift the way a golfer's does. Both indexes should stay in a believable
band around where they started; one running away in either direction points at a problem in the
generator or in the handicap maths.

## What they file

Each round ends with a findings file. The workflow turns at most two findings into GitHub issues
labelled `from-tester`, most serious first; the rest stay in the run summary. Screenshots are in
the run's artifacts. The issues join the normal backlog and the coordinator triages them.

Bugs and friction only — not feature ideas, not taste. A clean round files nothing, and that is a
good result.

## Playing a fix again

A fix comes before the rotation. When a `from-tester` issue is closed as completed, the next round
with no scenario asked for plays the scenario that issue was found on, and the golfers look for the
bug again. The workflow then comments on the issue with what they saw — it no longer happens, it
still happens, or they could not check — and labels it `retested`, so it is played once. If it
still happens they also file it as a new finding. That night's turn in the rotation is skipped.

To skip a retest (the fix was already checked by hand), add the `retested` label yourself. The
queue is `.github/scripts/retest-queue.sh`.

## Running one by hand

Actions → **AI golfers** → Run workflow. Leave the scenario blank for a waiting retest, or else
tonight's turn; or give an id from `scenarios.js`. Untick "File issues" to play the round and only read the summary.

```bash
node testers/scenarios.js                 # tonight's scenario
node testers/scenarios.js --id nassau-18-gross
node testers/scorecard.js --handicap 14 --pars 4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5 --seed demo
```

## Turning it up or down

Start: one round a night. If rounds keep coming back clean, play more — add a second `cron` line
to the workflow. If the backlog fills faster than it empties, lower `max_issues` or drop to a few
nights a week. The coordinator still ships at most two changes a day whatever the golfers file.
