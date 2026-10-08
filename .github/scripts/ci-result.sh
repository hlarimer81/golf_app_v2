#!/usr/bin/env bash
# What CI made of one commit, as a few lines of text for the Gemini review to read.
#
# On Oct 8 the review held a pull request with two findings that both said "this test will
# fail", while CI had already run that test on the same commit and passed it. The reviewer has no
# tools and was guessing at something the workflow next door knew. This waits for the
# build-and-test check on the commit and prints its result, step by step.
#
#   ci-result.sh <commit-sha> [tries]     tries are 15 seconds apart; default 48 (12 minutes)
#
# Needs gh, GH_TOKEN and GITHUB_REPOSITORY. Always exits 0: when CI has not answered in time it
# says exactly that, and the review goes ahead without the result rather than not at all.
set -uo pipefail

SHA="${1:?usage: ci-result.sh <commit-sha> [tries]}"
TRIES="${2:-48}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"

ID=- STATUS=none CONCLUSION=-
for attempt in $(seq 1 "$TRIES"); do
  # The newest run of the check, in case it was re-run.
  FOUND=$(gh api "repos/$REPO/commits/$SHA/check-runs?check_name=build-and-test" \
    --jq '.check_runs | sort_by(.started_at) | last // {} | "\(.id // "-") \(.status // "none") \(.conclusion // "-")"' 2>/dev/null) \
    || FOUND="- unreachable -"
  read -r ID STATUS CONCLUSION <<<"$FOUND"
  [ "$STATUS" = "completed" ] && break
  [ "$attempt" -lt "$TRIES" ] && sleep 15
done

if [ "$STATUS" != "completed" ]; then
  echo "CI has not finished on this commit, so its result is not known."
  exit 0
fi

echo "CI finished on this exact commit. Result: $CONCLUSION."
# A check run made by Actions has the same id as its job, which is where the steps are. Step
# names come from the workflow file, so they are cut down to plain characters before a model
# reads them.
gh api "repos/$REPO/actions/jobs/$ID" \
  --jq '.steps[] | select(.name | test("^(Set up job|Complete job|Post |Run actions/)") | not)
        | "- \(.name | gsub("[^A-Za-z0-9 ._-]"; "") | .[0:60]): \(.conclusion // "not finished")"' 2>/dev/null \
  || true
