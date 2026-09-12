#!/usr/bin/env bash
# Builds the staging Supabase project (4play_staging) from a production schema export, then loads
# the fake data in scripts/staging-seed.sql. Run it yourself; agents never run this.
#
#   bash scripts/staging-setup.sh <prod-schema.sql>   first time: schema, grants, realtime, cron, seed
#   bash scripts/staging-setup.sh --seed-only         later: wipe staging and reload the fake data
#
# Produce the export with:
#   pg_dump "<production session pooler>" --schema-only --schema=public --no-owner -f prod-schema.sql
#
# Reads STAGING_DB_URL from .env.local and refuses to run if it points at production.

set -euo pipefail
cd "$(dirname "$0")/.."

PROD_REF=lvwdffsibhqzgbqixfdi
PSQL=$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)

set -a; . ./.env.local; set +a
: "${STAGING_DB_URL:?STAGING_DB_URL is missing from .env.local}"
case "$STAGING_DB_URL" in
  *"$PROD_REF"*) echo "STAGING_DB_URL points at production ($PROD_REF). Refusing." >&2; exit 1 ;;
esac

run_psql() {
  # Single transaction, stop at the first error: a failed run leaves staging exactly as it was.
  "$PSQL" "$STAGING_DB_URL" -X -q -1 -v ON_ERROR_STOP=1 "$@" 2>&1 \
    | sed -E 's#postgres(ql)?://[^ ]+#<redacted>#g'
  return "${PIPESTATUS[0]}"
}

if [ "${1:-}" != "--seed-only" ]; then
  src=${1:?usage: staging-setup.sh <prod-schema.sql> | --seed-only}
  [ -f "$src" ] || { echo "No such file: $src" >&2; exit 1; }

  existing=$("$PSQL" "$STAGING_DB_URL" -X -q -A -t \
    -c "select count(*) from pg_tables where schemaname = 'public'")
  if [ "$existing" != "0" ]; then
    echo "Staging already has $existing tables in public. Use --seed-only to reload data." >&2
    exit 1
  fi

  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT

  # These three statements only Supabase's own admin role may run, and a new project already has
  # their effect, so drop them from the export.
  grep -vE '^(CREATE SCHEMA public|COMMENT ON SCHEMA public|ALTER DEFAULT PRIVILEGES)' "$src" > "$tmp"

  cat >> "$tmp" <<'SQL'

SELECT pg_catalog.set_config('search_path', 'public', false);

-- Supabase's default privileges grant everything in public to these roles the moment it is
-- created, which the export's GRANTs don't undo. Clear them and replay production's own grants,
-- so staging's permissions match production exactly, including functions revoked from anon.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;
SQL
  grep -E '^(GRANT|REVOKE) ' "$src" >> "$tmp"

  cat >> "$tmp" <<'SQL'

-- Not part of a public-schema export. The app subscribes to changes on these two tables
-- (src/hooks/useScores.js, src/useWolfVegasState.js).
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores, public.matches;

-- Same nightly backstop as production (sql/handicap-schedule.sql).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('golf-sweep-unbanked', '0 8 * * *', $$SELECT golf_sweep_unbanked()$$);

-- Marks this database as staging. staging-seed.sql refuses to run anywhere this table is absent.
CREATE SCHEMA staging_meta;
CREATE TABLE staging_meta.marker (created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO staging_meta.marker DEFAULT VALUES;
SQL

  echo "Applying schema to staging..."
  # -o discards query results (hundreds of set_config rows); errors still reach the terminal.
  run_psql -o /dev/null -f "$tmp"
  echo "Schema applied."
fi

echo "Loading fake data..."
run_psql -f scripts/staging-seed.sql

"$PSQL" "$STAGING_DB_URL" -X -q -A -t -F ' ' -c "
  select 'staging now has:',
         (select count(*) from pg_tables where schemaname = 'public') || ' tables,',
         (select count(*) from pg_policies where schemaname = 'public') || ' policies,',
         (select count(*) from public.matches) || ' matches,',
         (select count(*) from public.round_differential) || ' banked rounds'"
