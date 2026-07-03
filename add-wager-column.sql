-- =============================================================================================
-- Adds the matches.wager JSONB column used by the Wager / Money Settlement engine.
--
-- Schema shape (every field optional; only non-zero entries need be stored):
--   {
--     "per_point":      float,   -- $ per scoring point (Vegas / Stableford / Wolf / ...)
--     "per_skin":       float,   -- $ per skin (Skins, per-skin mode)
--     "skins_ante":     float,   -- $ per player ante (Skins, pot mode)
--     "skins_pot":      bool,    -- true = pot mode, false (default) = per-skin
--     "nassau_front":   float,   -- $ stake on the Front-9 match
--     "nassau_back":    float,   -- $ stake on the Back-9 match
--     "nassau_overall": float,   -- $ stake on the 18-hole Overall match
--     "nassau_press":   float    -- $ per press (0 = inherit parent's stake)
--   }
--
-- Run once against the Supabase project. null wager means "no bet, money UI hidden."
-- =============================================================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS wager JSONB;

COMMENT ON COLUMN matches.wager IS
  'Per-round wager configuration for the Money settlement engine (see src/settlement.js).';

-- Manual Nassau presses: array of 0-based hole indices AFTER which a press was added.
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS presses JSONB;

COMMENT ON COLUMN matches.presses IS
  'Manual Nassau presses: JSON array of 0-based "after-hole" indices (see src/nassauEngine.js).';

