/**
 * Example: How to integrate the new golf_courses + tee_boxes schema into App.jsx
 *
 * This shows the key changes needed to support tee box selection
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';

function ExampleCourseSelection() {
  // State for courses and tee boxes
  const [golfCourses, setGolfCourses] = useState([]); // From golf_courses table
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [availableTeeBoxes, setAvailableTeeBoxes] = useState([]);
  const [selectedTeeBoxId, setSelectedTeeBoxId] = useState('');

  // Fetch all golf courses on mount (includes greens GPS data)
  useEffect(() => {
    fetchGolfCourses();
  }, []);

  const fetchGolfCourses = async () => {
    const { data, error } = await supabase
      .from('golf_courses')
      .select('*')
      .order('name');

    if (data && !error) {
      setGolfCourses(data);
    }
  };

  // Fetch tee boxes when a course is selected
  useEffect(() => {
    if (!selectedCourseId) {
      setAvailableTeeBoxes([]);
      setSelectedTeeBoxId('');
      return;
    }

    fetchTeeBoxes();
  }, [selectedCourseId]);

  const fetchTeeBoxes = async () => {
    const { data, error } = await supabase
      .from('tee_boxes')
      .select('*')
      .eq('course_id', selectedCourseId)
      .order('rating', { ascending: false }); // Longest/hardest first

    if (data && !error) {
      setAvailableTeeBoxes(data);
      // Auto-select first tee box
      if (data.length > 0) {
        setSelectedTeeBoxId(data[0].id);
      }
    }
  };

  // Get the selected tee box data for game configuration
  const selectedTeeBox = useMemo(() => {
    return availableTeeBoxes.find(t => t.id === selectedTeeBoxId);
  }, [availableTeeBoxes, selectedTeeBoxId]);

  // Build courseData from selected tee box + course (compatible with existing grids)
  const courseData = useMemo(() => {
    if (!selectedTeeBox) {
      return { pars: Array(18).fill(4), handicaps: Array(18).fill(10) };
    }

    // Get the golf course to access GPS data
    const course = golfCourses.find(c => c.id === selectedCourseId);

    return {
      pars: selectedTeeBox.par,
      handicaps: selectedTeeBox.stroke_index,
      slope: selectedTeeBox.slope,
      rating: selectedTeeBox.rating,
      greens: course?.greens || [],  // GPS data from golf_courses table
      yardage: selectedTeeBox.yardage || []
    };
  }, [selectedTeeBox, golfCourses, selectedCourseId]);

  // Calculate course handicap using WHS formula
  const calculateCourseHandicap = (handicapIndex) => {
    if (!selectedTeeBox?.slope || !selectedTeeBox?.rating) {
      return handicapIndex;
    }

    const pars = selectedTeeBox.par || Array(18).fill(4);
    const parTotal = pars.reduce((a, b) => a + b, 0);

    // WHS formula: (Handicap Index × Slope Rating / 113) + (Course Rating - Par)
    const courseHcp = (handicapIndex * selectedTeeBox.slope / 113) +
                      (selectedTeeBox.rating - parTotal);

    return Math.round(courseHcp);
  };

  return (
    <div>
      {/* Course Selector */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
          Select Course
        </label>
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
          required
        >
          <option value="">-- Select Course --</option>
          {golfCourses.map(course => (
            <option key={course.id} value={course.id}>
              {course.name} {course.location ? `(${course.location})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tee Box Selector (only shows when course selected) */}
      {selectedCourseId && availableTeeBoxes.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            Select Tees
          </label>
          <select
            value={selectedTeeBoxId}
            onChange={(e) => setSelectedTeeBoxId(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            required
          >
            {availableTeeBoxes.map(tee => (
              <option key={tee.id} value={tee.id}>
                {tee.tee_name} {/* Rating: {tee.rating} / Slope: {tee.slope} */}
              </option>
            ))}
          </select>

          {/* Tee Box Info Display */}
          {selectedTeeBox && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              background: '#f8f9fa',
              borderRadius: '4px',
              borderLeft: `4px solid ${selectedTeeBox.tee_color}`,
              fontSize: '12px',
              color: '#666'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Rating: <strong>{selectedTeeBox.rating || 'N/A'}</strong></span>
                <span>Slope: <strong>{selectedTeeBox.slope || 'N/A'}</strong></span>
                {selectedTeeBox.yardage && (
                  <span>Yardage: <strong>{selectedTeeBox.yardage.reduce((a,b) => a+b, 0)}</strong></span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Example: Show how this affects handicap calculation */}
      {selectedTeeBox && (
        <div style={{ marginTop: '20px', padding: '12px', background: '#e8f5e9', borderRadius: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
            Handicap Example (Index: 15.0)
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            From {selectedTeeBox.tee_name} tees: Course Handicap = {calculateCourseHandicap(15.0)}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
            Formula: (15.0 × {selectedTeeBox.slope} ÷ 113) + ({selectedTeeBox.rating} − par)
          </div>
        </div>
      )}

      {/* The courseData object can now be passed to your existing scoring grids */}
      {selectedTeeBox && (
        <div style={{ marginTop: '20px' }}>
          <pre style={{ fontSize: '10px', background: '#f4f4f4', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(courseData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ExampleCourseSelection;


/*
 * INTEGRATION CHECKLIST FOR App.jsx:
 *
 * 1. Replace `dbCourses` state with:
 *    - golfCourses (from golf_courses table)
 *    - availableTeeBoxes (from tee_boxes table)
 *    - selectedTeeBoxId (user selection)
 *
 * 2. Replace `selectedCourse` (string) with:
 *    - selectedCourseId (UUID)
 *    - selectedTeeBoxId (UUID)
 *
 * 3. Update courseData builder to use selectedTeeBox instead of dbCourses.find()
 *
 * 4. Store tee box selection in matches table:
 *    - Add tee_box_id column to matches table
 *    - Save selectedTeeBoxId when creating match
 *
 * 5. Peninsula Golf Club handling:
 *    - Keep the 9-hole combination logic OR
 *    - Create a special "Peninsula" course with combo tee boxes
 *
 * 6. Backward compatibility:
 *    - Keep old courses table untouched
 *    - Other app continues using it
 *    - This app only uses new golf_courses/tee_boxes
 */
