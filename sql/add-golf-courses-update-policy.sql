-- =============================================================================================
-- Grants the anon role UPDATE on golf_courses, so the "Add Green GPS Data" wizard can persist.
--
-- WHY: golf_courses has RLS enabled with SELECT and INSERT policies but no UPDATE policy. A
-- PATCH from the app therefore matched zero rows and returned HTTP 200 -- an UPDATE refused by a
-- policy's USING clause does NOT raise, it simply affects nothing. src/components/AddGreenData.jsx
-- checked only the error, so the wizard reported success and saved nothing. Every green captured
-- on-course through that wizard was silently discarded.
--
-- Confirmed 2026-08-08 by no-op PATCH probes with the anon key:
--   golf_courses  -> 0 rows, HTTP 200   (blocked)
--   courses       -> 1 row              (allowed - has "courses anon update")
--   matches       -> 1 row              (allowed)
--
-- This mirrors the policy the legacy `courses` table already carries. The on-device course rename
-- in the other project relied on that one; this is the same grant for the table this app uses.
--
-- SCOPE, stated plainly: `using (true)` lets anyone holding the anon key rewrite any course. That
-- is the posture the whole app already runs on -- no auth, anon key, no row-level rules -- so this
-- adds surface without changing the model. It is superseded the moment the auth/RLS work in
-- TODAYS-PROGRESS-AND-NEXT-STEPS.md lands, and should be revisited there rather than left forever.
--
-- Idempotent. Run once against the Supabase project (SQL editor, or supabase db push).
-- =============================================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'golf_courses'
      AND policyname = 'golf_courses anon update'
  ) THEN
    CREATE POLICY "golf_courses anon update" ON public.golf_courses
      FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verify: expect one row with cmd = UPDATE.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'golf_courses'
ORDER BY policyname;
