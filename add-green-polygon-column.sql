-- Add green polygon storage to existing green_images table.
-- `green_polygon` holds the GPS polygon as JSON: [[lat, lon], [lat, lon], ...] (closed ring).
-- `green_center_lat` / `green_center_lon` are the centroid (handy for quick distance-to-green lookups).
-- `osm_way_id` is the OpenStreetMap way ID we sourced the polygon from (for provenance / updates).

ALTER TABLE green_images
  ADD COLUMN IF NOT EXISTS green_polygon JSONB,
  ADD COLUMN IF NOT EXISTS green_center_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS green_center_lon NUMERIC,
  ADD COLUMN IF NOT EXISTS osm_way_id BIGINT,
  ADD COLUMN IF NOT EXISTS osm_source TEXT DEFAULT 'openstreetmap';
