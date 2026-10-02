#!/usr/bin/env bash
# Reads a Gemini review on stdin and prints its verdict as one word:
#
#   approve         "approve" or "approve with nits"
#   needs-changes   the reviewer asked for changes
#   unclear         no verdict line, or one that says neither
#
# Only the Verdict line is read, so a finding that happens to contain the words "needs changes"
# does not decide anything. "unclear" is for the caller to treat as not approved: a review that
# cannot be read is not a review that passed.
set -euo pipefail

line="$(grep -i -m1 'verdict' || true)"
line="$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')"

case "$line" in
  *"needs changes"*|*"needs-changes"*|*"request changes"*|*"changes requested"*) echo needs-changes ;;
  *approve*) echo approve ;;
  *) echo unclear ;;
esac
