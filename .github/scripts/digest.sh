#!/usr/bin/env bash
# What is waiting on a person, as one markdown note.
#
# The agents act through AGENT_TOKEN, which is H's own account, and GitHub never notifies anyone
# of their own activity. So an issue labelled needs-human, or a pull request held because it
# touches a protected file, told nobody: it waited until H happened to look. The digest workflow
# posts this note once a day as github-actions, which does notify.
#
#   digest.sh <file>     writes the note to <file> and prints how many things are waiting
#
# Listed: open issues labelled needs-human, every open pull request (they merge themselves, so
# one that is still open is stuck), questions waiting for an answer (needs-info), and workflow
# runs that failed in the last 24 hours. Titles are written by whoever filed the issue, on a
# public repository, so they are cut short and stripped of anything that would mention someone
# or break the list.
set -euo pipefail

OUT="${1:?usage: digest.sh <file>}"
TMP="$(mktemp -d)"

gh issue list --state open --limit 200 --json number,title,labels,createdAt > "$TMP/issues.json"
gh pr list --state open --limit 100 --json number,title,labels,createdAt,isDraft > "$TMP/prs.json"
gh run list --limit 200 --json workflowName,conclusion,createdAt,url > "$TMP/runs.json"

jq -rn --slurpfile issues "$TMP/issues.json" --slurpfile prs "$TMP/prs.json" --slurpfile runs "$TMP/runs.json" '
  def has($l): [.labels[].name] | index($l) != null;
  def clean: gsub("[@`|<>\\[\\]\\r\\n]"; " ") | gsub(" +"; " ") | .[0:80];
  def age: ((now - (.createdAt | fromdateiso8601)) / 86400 | floor) as $d
    | if $d < 1 then "today" elif $d == 1 then "1 day" else "\($d) days" end;
  def line: "- #\(.number) \(.title | clean) — \(age)";

  ($issues[0] | map(select(has("digest") | not))) as $open
  | ($open | map(select(has("needs-human"))) | sort_by(.createdAt)) as $human
  | ($open | map(select(has("needs-info"))) | sort_by(.createdAt)) as $questions
  | ($prs[0] | map(select(.isDraft | not)) | sort_by(.createdAt)) as $stuck
  | ($runs[0] | map(select(.conclusion == "failure" and (now - (.createdAt | fromdateiso8601)) < 86400))
      | group_by(.workflowName) | map({ name: .[0].workflowName, count: length, url: (sort_by(.createdAt) | last | .url) })) as $failed
  | (($human | length) + ($questions | length) + ($stuck | length) + ($failed | length)) as $total
  | [ "**Waiting on H: \($total)**", "" ]
    + (if ($human | length) > 0 then ["**Issues that need a person**", ($human[] | line), ""] else [] end)
    + (if ($stuck | length) > 0 then
        ["**Pull requests that have not merged**",
         ($stuck[] | line + (if has("needs-human") then " — held" else " — not held, so a check is failing or still running" end)), ""]
       else [] end)
    + (if ($questions | length) > 0 then ["**Questions waiting for an answer** (reply in a comment and the coordinator reads it again)", ($questions[] | line), ""] else [] end)
    + (if ($failed | length) > 0 then
        ["**Runs that failed in the last 24 hours**",
         ($failed[] | "- \(.name | clean): \(.count) — [latest](\(.url))"), ""]
       else [] end)
    + [ "TOTAL=\($total)" ]
  | .[]
' > "$TMP/note.md"

grep -v '^TOTAL=' "$TMP/note.md" > "$OUT"
sed -n 's/^TOTAL=//p' "$TMP/note.md"
rm -rf "$TMP"
