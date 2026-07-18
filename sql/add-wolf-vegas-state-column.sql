-- =============================================================================================
-- Adds the matches.wolf_vegas JSONB column that persists a Wolf Vegas round's live state so it
-- survives a refresh or a second device joining the round.
--
-- Schema shape (all optional; only non-default entries need be stored):
--   {
--     "decisions":    { "<holeNumber>": <partnerPlayerId> | "lone" | "blind" },
--     "hammers":      { "<holeNumber>": <hammerCount> },   -- each hammer doubles (0->x1, 1->x2...)
--     "grossBirdies": bool                                  -- false (default) = net birdies flip
--   }
--
-- Run once against the Supabase project. A null value means "fresh round, nothing decided yet."
-- =============================================================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS wolf_vegas JSONB;

COMMENT ON COLUMN matches.wolf_vegas IS
  'Wolf Vegas live round state: per-hole wolf decisions, per-hole hammer counts, and the '
  'gross/net birdie-flip option (see src/useWolfVegasState.js and src/WolfVegasGrid.jsx).';
