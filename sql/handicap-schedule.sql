-- =============================================================================================
-- SCHEDULE THE BACKSTOP SWEEP
--
-- golf_sweep_unbanked() catches the two ways the on-completion path fails:
--   1. a round nobody pressed Finish on - not hypothetical, all 282 historical matches were
--      never finished, because Finish Round did not persist anything until 2026-08-08;
--   2. a score corrected after the round was banked.
--
-- Banking is idempotent (ON CONFLICT DO NOTHING), so running this nightly costs nothing and can
-- never double-count.
--
-- ============================== THE DEPENDENCY THAT MATTERS ==================================
-- delete_old_matches() destroys scores, players, teams and matches older than 30 days, and it is
-- currently DORMANT - no cron entry, no caller in code. This sweep must be scheduled BEFORE that
-- one ever is. A round nobody finished is unbanked, and the delete would take it with no trace and
-- no error. Scheduling the delete first is the one ordering that silently loses handicap history.
--
-- This file schedules ONLY the sweep. It deliberately does not schedule the delete.
-- =============================================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: unschedule any previous definition before scheduling, so re-running this file
-- updates the job rather than erroring or creating a second one.
DO $$
BEGIN
    PERFORM cron.unschedule('golf-sweep-unbanked');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is fine
END $$;

-- 08:00 UTC daily - roughly 2-3am US Central, well clear of any round in progress. The sweep takes
-- a lock-free pass over matches with scores; at this data size it is milliseconds.
SELECT cron.schedule(
    'golf-sweep-unbanked',
    '0 8 * * *',
    $$SELECT golf_sweep_unbanked()$$
);

-- Verify.
SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;
