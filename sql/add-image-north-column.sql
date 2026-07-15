-- Add a per-hole image-orientation field to green_images.
--
-- `image_north_deg` is the bearing (in degrees, 0..360, measured clockwise
-- from true north) that the TOP of the green image is pointing toward in the
-- real world.
--
-- Examples:
--   image_north_deg = 0   → image is north-up (top of image = north).
--   image_north_deg = 90  → top of image points east.
--   image_north_deg = 180 → top of image points south.
--   image_north_deg = 265 → top of image points roughly west (a bit south of west);
--                            equivalently, the compass "N" arrow on the chart
--                            points LEFT in the picture.
--
-- Default is 0 (north-up) for backward compatibility.

ALTER TABLE green_images
  ADD COLUMN IF NOT EXISTS image_north_deg NUMERIC DEFAULT 0;

-- AGCC Blues hole 1: the compass shows N pointing to the LEFT in the image,
-- meaning the TOP of the image is pointing east (~265° clockwise from north).
UPDATE green_images
SET image_north_deg = 265
WHERE course_name = 'AGCC Blues' AND hole_number = 1;
