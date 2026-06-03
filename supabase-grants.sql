-- Grants for Supabase Data API update
-- As of May 30, explicit grants are required for the public schema.

-- Grant access to matches table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO service_role;

-- Grant access to teams table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO service_role;

-- Grant access to players table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO service_role;

-- Grant access to scores table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO service_role;
