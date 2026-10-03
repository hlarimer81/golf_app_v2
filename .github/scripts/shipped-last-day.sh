#!/usr/bin/env bash
# How many issues were labelled ready-for-dev in the last 24 hours?
#
# The coordinator's cap used to be "two per run", which was the same as two a day while it ran
# once a day. It now also runs whenever an issue is opened, so a per-run cap would let through
# two changes every time someone filed something. The cap is on the day instead, and this is the
# count it is measured against.
#
# Counted from the repository's issue events, so it is the same number whichever run asks, and
# it includes a label put on by hand: the cap is on how much unreviewed work starts in a day, not
# on who started it. An issue labelled twice (taken off and put back to retry) counts once.
#
# Prints one number. Fails, and so ships nothing, if the events cannot be read.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
SINCE=$(( $(date -u +%s) - 86400 ))

# Events come newest first. 500 is far more than a day's worth here.
for page in 1 2 3 4 5; do
  gh api "repos/$REPO/issues/events?per_page=100&page=$page"
done | jq -s --argjson since "$SINCE" '
  [ .[][]
    | select(.event == "labeled" and .label.name == "ready-for-dev")
    | select((.created_at | fromdateiso8601) >= $since)
    | .issue.number ] | unique | length'
