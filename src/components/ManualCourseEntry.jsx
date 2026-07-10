import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function ManualCourseEntry({ courseName, location, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Basic info, 2: Hole details
  const [name, setName] = useState(courseName || '');
  const [loc, setLoc] = useState(location || '');
  const [holes, setHoles] = useState(18);
  const [teeName, setTeeName] = useState('');
  const [teeColor, setTeeColor] = useState('#0066CC');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');

  // Array of hole data: {par, strokeIndex, yardage}
  const [holeData, setHoleData] = useState(
    Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: 4,
      strokeIndex: i + 1,
      yardage: 0
    }))
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleHolesChange = (newHoles) => {
    setHoles(newHoles);
    setHoleData(Array.from({ length: newHoles }, (_, i) => ({
      hole: i + 1,
      par: holeData[i]?.par || 4,
      strokeIndex: holeData[i]?.strokeIndex || (i + 1),
      yardage: holeData[i]?.yardage || 0
    })));
  };

  const updateHole = (index, field, value) => {
    const newData = [...holeData];
    newData[index] = { ...newData[index], [field]: parseInt(value) || 0 };
    setHoleData(newData);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      // Validate
      if (!name.trim()) {
        setError('Course name is required');
        setLoading(false);
        return;
      }

      if (!teeName.trim()) {
        setError('Tee box name is required');
        setLoading(false);
        return;
      }

      // Step 1: Create the course
      const { data: course, error: courseError } = await supabase
        .from('golf_courses')
        .insert({
          name: name.trim(),
          location: loc.trim() || null,
          holes: holes
        })
        .select()
        .single();

      if (courseError) throw courseError;

      // Step 2: Create the tee box with hole data
      const { error: teeError } = await supabase
        .from('tee_boxes')
        .insert({
          course_id: course.id,
          tee_name: teeName.trim(),
          tee_color: teeColor,
          rating: rating ? parseFloat(rating) : null,
          slope: slope ? parseInt(slope) : null,
          par: holeData.map(h => h.par),
          stroke_index: holeData.map(h => h.strokeIndex),
          yardage: holeData.map(h => h.yardage)
        });

      if (teeError) throw teeError;

      alert(`✅ ${name} has been added successfully with ${teeName} tees!`);
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating course:', err);
      setError(err.message || 'Failed to create course');
    } finally {
      setLoading(false);
    }
  };

  const presetPars = (type) => {
    if (type === 'par72') {
      const newData = holeData.map((h, i) => ({
        ...h,
        par: [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 5, 4, 3, 4, 4, 3, 5, 4][i] || 4
      }));
      setHoleData(newData);
    } else if (type === 'par70') {
      const newData = holeData.map((h, i) => ({
        ...h,
        par: [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 3, 4, 4][i] || 4
      }));
      setHoleData(newData);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflowY: 'auto'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '25px',
          width: '100%',
          maxWidth: step === 1 ? '500px' : '800px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#333' }}>
            ⛳ Manual Course Entry - Step {step}/2
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '0 5px'
            }}
          >
            ✕
          </button>
        </div>

        {step === 1 && (
          <div>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
              Enter basic course information and tee box details.
            </p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                Course Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Homewood Golf Course"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '15px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                Location (City, State)
              </label>
              <input
                type="text"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                placeholder="e.g., Ames, IA"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '15px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                Number of Holes
              </label>
              <select
                value={holes}
                onChange={(e) => handleHolesChange(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '15px',
                  boxSizing: 'border-box'
                }}
              >
                <option value={9}>9 Holes</option>
                <option value={18}>18 Holes</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                Tee Box Name *
              </label>
              <input
                type="text"
                value={teeName}
                onChange={(e) => setTeeName(e.target.value)}
                placeholder="e.g., Blue, White, Red"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '15px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                  Rating (optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  placeholder="e.g., 72.5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                  Slope (optional)
                </label>
                <input
                  type="number"
                  value={slope}
                  onChange={(e) => setSlope(e.target.value)}
                  placeholder="e.g., 125"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: '6px',
                  padding: '10px',
                  marginBottom: '15px',
                  fontSize: '13px',
                  color: '#c00'
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!name.trim() || !teeName.trim()}
              style={{
                width: '100%',
                padding: '15px',
                background: (!name.trim() || !teeName.trim()) ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: (!name.trim() || !teeName.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              Next: Enter Hole Details →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
              Enter par, stroke index, and yardage for each hole.
            </p>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => presetPars('par72')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Preset Par 72
              </button>
              <button
                onClick={() => presetPars('par70')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Preset Par 70
              </button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f0f0f0', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}>Hole</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '80px' }}>Par</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd', width: '100px' }}>Stroke Index</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Yardage</th>
                  </tr>
                </thead>
                <tbody>
                  {holeData.map((hole, index) => (
                    <tr key={index}>
                      <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                        {hole.hole}
                      </td>
                      <td style={{ padding: '4px', border: '1px solid #ddd' }}>
                        <input
                          type="number"
                          min="3"
                          max="6"
                          value={hole.par}
                          onChange={(e) => updateHole(index, 'par', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px', border: '1px solid #ddd' }}>
                        <input
                          type="number"
                          min="1"
                          max={holes}
                          value={hole.strokeIndex}
                          onChange={(e) => updateHole(index, 'strokeIndex', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px', border: '1px solid #ddd' }}>
                        <input
                          type="number"
                          min="0"
                          value={hole.yardage}
                          onChange={(e) => updateHole(index, 'yardage', e.target.value)}
                          placeholder="yards"
                          style={{
                            width: '100%',
                            padding: '6px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div
                style={{
                  background: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: '6px',
                  padding: '10px',
                  marginBottom: '15px',
                  fontSize: '13px',
                  color: '#c00'
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '12px',
                  background: loading ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Creating Course...' : 'Create Course'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManualCourseEntry;
