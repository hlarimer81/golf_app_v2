-- Populate green polygon for AGCC Blues Hole 1 from OpenStreetMap.
-- Source: OSM way 908857735 (golf=green) © OpenStreetMap contributors, licensed under ODbL.
-- Polygon has 26 points (closed ring). Centroid: 42.073959, -93.650755.
-- Run add-green-polygon-column.sql first to create the columns referenced below.

INSERT INTO green_images (
  course_name,
  hole_number,
  image_path,
  compass_direction,
  grid_size_yards,
  notes,
  green_polygon,
  green_center_lat,
  green_center_lon,
  osm_way_id,
  osm_source
)
VALUES (
  'AGCC Blues',
  1,
  'agcc-blues/hole-1.png',
  'N',
  5,
  'Putt break chart. Front of green at bottom. Compass shows North pointing up. 5-yard grid overlay.',
  '[[42.07405, -93.6506889], [42.0740532, -93.6507624], [42.0740519, -93.6508119], [42.0740467, -93.6508535], [42.0740349, -93.6508862], [42.0740211, -93.6509083], [42.0739994, -93.6509305], [42.0739757, -93.6509411], [42.0739495, -93.650942], [42.0739225, -93.6509278], [42.0738969, -93.6508995], [42.0738575, -93.6508473], [42.0738332, -93.6507969], [42.0738253, -93.6507677], [42.073824, -93.6507349], [42.0738319, -93.6506995], [42.073847, -93.6506686], [42.0738759, -93.6506279], [42.0739199, -93.650596], [42.0739521, -93.6505863], [42.0739849, -93.6505854], [42.0740106, -93.6505925], [42.0740243, -93.6506057], [42.0740381, -93.6506323], [42.0740454, -93.6506571], [42.07405, -93.6506889]]'::jsonb,
  42.0739585,
  -93.6507553,
  908857735,
  'openstreetmap'
)
ON CONFLICT (course_name, hole_number) DO UPDATE
SET green_polygon    = EXCLUDED.green_polygon,
    green_center_lat = EXCLUDED.green_center_lat,
    green_center_lon = EXCLUDED.green_center_lon,
    osm_way_id       = EXCLUDED.osm_way_id,
    osm_source       = EXCLUDED.osm_source;
