-- Add play_mode column to matches table so joiners see the same team/singles config as the creator
ALTER TABLE matches ADD COLUMN IF NOT EXISTS play_mode text;
