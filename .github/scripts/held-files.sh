#!/usr/bin/env bash
# Which changed files mean a pull request must wait for a person instead of merging itself.
#
#   git diff --numstat --no-renames <base> | held-files.sh <patterns-file>
#
# Reads `added<TAB>deleted<TAB>path` lines on stdin. Prints one line per held file, with the
# reason, and nothing when the change may merge by itself. Always exits 0 unless misused: the
# caller decides what to do with the list.
#
# Three reasons a file is held:
#   - its path matches a line in the patterns file (.github/protected-paths)
#   - it is a test and the change removes lines from it. Adding a test, or adding to one, is what
#     agents are asked to do; taking assertions away is how a broken change gets a green check.
#   - it is eslint-suppressions.json and the change adds lines. Pruning it is the rule; adding to
#     it is silencing a new error.
set -euo pipefail

patterns_file="${1:?usage: held-files.sh <patterns-file>}"
patterns="$(grep -Ev '^[[:space:]]*(#|$)' "$patterns_file" || true)"

while IFS=$'\t' read -r added deleted path; do
  [ -n "${path:-}" ] || continue

  if [ -n "$patterns" ] && grep -Eq -f <(printf '%s\n' "$patterns") <<<"$path"; then
    echo "$path — protected path"
    continue
  fi

  # numstat prints "-" for both counts on a binary file; treat that as a removal.
  if [[ "$path" =~ \.test\.jsx?$ || "$path" =~ ^e2e/ ]]; then
    if [ "$deleted" != "0" ]; then
      echo "$path — removes lines from an existing test"
    fi
    continue
  fi

  if [ "$path" = "eslint-suppressions.json" ] && [ "$added" != "0" ]; then
    echo "$path — adds lint suppressions"
  fi
done
