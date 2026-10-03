#!/usr/bin/env bash
# Which fix is waiting to be played again?
#
# A golfer's issue names the scenario it was found on. When that issue is closed as fixed, nothing
# played the scenario again unless a person started a run by hand, so a fix went to production
# unchecked on the live app. This finds the oldest such issue and prints its scenario, with every
# other fixed issue found on the same scenario:
#
#   { "scenario": "nassau-18-gross", "issues": [ { "number": 12, "title": "...", "body": "..." } ] }
#
# or {} when nothing is waiting. An issue is waiting when it is labelled from-tester, was closed as
# completed, and is not yet labelled retested. The golfers' workflow adds that label once the
# round has been played.
#
# Only issues by trusted authors count, the same rule as everywhere else: the body is shown to a
# model. A scenario that no longer exists in testers/scenarios.js is skipped, not an error.
set -euo pipefail

TRUSTED=$(grep -Ev '^[[:space:]]*(#|$)' .github/trusted-authors | jq -R 'ascii_downcase' | jq -sc .)
KNOWN=$(node --input-type=module -e "import { SCENARIOS } from './testers/scenarios.js'; console.log(JSON.stringify(SCENARIOS.map(s => s.id)))")

gh issue list --state closed --label from-tester --limit 100 \
  --json number,title,body,author,labels,stateReason,closedAt \
  | jq --argjson trusted "$TRUSTED" --argjson known "$KNOWN" '
      [ .[]
        | select((.author.login // "" | ascii_downcase) as $a | ($trusted | index($a)) != null)
        | select(.stateReason == "COMPLETED")
        | select([.labels[].name] | index("retested") | not)
        | . + { scenario: ((.body // "") | capture("playing scenario `(?<id>[a-z0-9-]+)`") | .id) }
        | select(.scenario as $s | ($known | index($s)) != null)
      ] | sort_by(.closedAt) as $waiting
      | if ($waiting | length) == 0 then {}
        else $waiting[0].scenario as $s
          | { scenario: $s,
              issues: [ $waiting[] | select(.scenario == $s) | { number, title, body: (.body[0:1500]) } ] }
        end'
