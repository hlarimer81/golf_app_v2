#!/usr/bin/env bash
# Says why a claude-code-action step failed.
#
# The action's own log ends at "result is_error:true" and leaves out the message that came back.
# On Oct 3 three golfer rounds failed in under a second with nothing to say that the API key had
# hit its limit; it took a person and the Anthropic Console to find out. The message is in the
# transcript the action saves, so this prints it: one line, as an error annotation and in the run
# summary, where it can be read from a phone.
#
# Only the final result message is printed, never the transcript. The repository is public.
#
#   claude-failure-reason.sh [transcript]     default: $RUNNER_TEMP/claude-execution-output.json
set -uo pipefail

FILE="${1:-}"
[ -n "$FILE" ] || FILE="${RUNNER_TEMP:-/tmp}/claude-execution-output.json"

if [ ! -s "$FILE" ]; then
  reason="the model step left no transcript, so it failed before the first call (setup, or the action itself)"
else
  # The transcript is a JSON array of messages; slurp and flatten so one message per line works too.
  reason=$(jq -rs '
    flatten
    | (map(select(type == "object" and .type == "result")) | last) as $r
    | if $r == null then "the transcript has no result message: the run was cut off (timeout or cancelled)"
      else
        ([$r.result, (($r.errors // []) | map(tostring) | join("; "))]
          | map(select(. != null and . != "")) | first // "no message was given") as $text
        | "\($text) [\($r.subtype // "?"), \($r.num_turns // "?") turns, $\($r.total_cost_usd // 0)]"
      end
  ' "$FILE" 2>/dev/null) || reason="the transcript could not be read as JSON"
fi

# One line, and short: this goes into an annotation on a public repository.
reason=$(printf '%s' "$reason" | tr '\r\n' '  ' | cut -c1-600)

echo "::error title=Why the model stopped::$reason"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Why the model stopped"
    echo
    echo "$reason"
    echo
    echo "If this is a usage or credit limit, every agent workflow fails the same way until it is lifted: check Billing and Limits in the Anthropic Console."
    echo
  } >> "$GITHUB_STEP_SUMMARY"
fi
