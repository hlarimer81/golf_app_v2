import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import ManualCourseEntry from './ManualCourseEntry';

function RequestCourseForm({ onClose, onSuccess }) {
  const [courseName, setCourseName] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Call Supabase Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('request-course', {
        body: {
          courseName: courseName.trim(),
          location: location.trim(),
          requestedBy: 'user@app', // You can replace with actual user identifier
          selectedCourseId: selectedChoice || undefined
        }
      });

      if (functionError) {
        // Handle 404 (course not found) differently
        if (functionError.message?.includes('not found')) {
          throw new Error(functionError.message);
        }
        throw functionError;
      }

      // Handle multiple choices
      if (data.needsSelection && data.choices) {
        setChoices(data.choices);
        setError('');
        setLoading(false);
        return;
      }

      // Handle course not found - offer manual entry
      if (data.notFound) {
        if (confirm(`${data.message}\n\nWould you like to add it manually with par and handicap details?`)) {
          setShowManualEntry(true);
        }
        setLoading(false);
        return;
      }

      if (data.success) {
        // Show what was actually found
        alert(`✅ ${data.message || 'Course added successfully!'}`);
        onSuccess && onSuccess(data.course?.id); // Pass course ID to parent
        onClose();
      } else {
        setError(data.message || 'Failed to add course');
      }
    } catch (err) {
      console.error('Error requesting course:', err);
      // Show the actual error message from the API
      setError(err.message || 'Failed to add course. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleChoiceSelect = (courseId) => {
    setSelectedChoice(courseId);
    setError('');
  };

  const handleConfirmChoice = async () => {
    if (!selectedChoice) {
      setError('Please select a course');
      return;
    }

    // Re-submit with selected course ID
    await handleSubmit({ preventDefault: () => {} });
  };

  return (
    <>
      {showManualEntry && (
        <ManualCourseEntry
          courseName={courseName}
          location={location}
          onClose={() => {
            setShowManualEntry(false);
            onClose();
          }}
          onSuccess={onSuccess}
        />
      )}

      {!showManualEntry && (
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
        padding: '20px'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '25px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#333' }}>🏌️ Request Course</h3>
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

        {!choices && (
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
            Can't find your course? Request it and we'll add it automatically!
          </p>
        )}

        {choices ? (
          // Show course selection
          <div>
            <p style={{ fontSize: '14px', color: '#333', marginBottom: '15px', fontWeight: 'bold' }}>
              Found {choices.length} courses. Please select the correct one:
            </p>

            <div style={{ marginBottom: '20px', maxHeight: '300px', overflowY: 'auto' }}>
              {choices.map((choice) => (
                <div
                  key={choice.id}
                  onClick={() => handleChoiceSelect(choice.id)}
                  style={{
                    padding: '15px',
                    marginBottom: '10px',
                    border: selectedChoice === choice.id ? '2px solid #28a745' : '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: selectedChoice === choice.id ? '#f0fff0' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>
                    {choice.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    📍 {choice.location}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    {choice.teeCount} tee boxes available
                  </div>
                </div>
              ))}
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
                onClick={() => { setChoices(null); setSelectedChoice(''); setError(''); }}
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
                Back
              </button>
              <button
                onClick={handleConfirmChoice}
                disabled={!selectedChoice || loading}
                style={{
                  flex: 2,
                  padding: '12px',
                  background: (!selectedChoice || loading) ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: (!selectedChoice || loading) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Adding...' : 'Confirm Selection'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
              Course Name *
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g., Pebble Beach Golf Links"
              required
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

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
              Location (City, State)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Pebble Beach, CA"
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
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Adding Course...' : 'Add Course'}
          </button>
        </form>
        )}

        {!choices && (
          <p style={{ fontSize: '12px', color: '#888', marginTop: '15px', textAlign: 'center' }}>
            Course data is fetched from public golf databases
          </p>
        )}
      </div>
    </div>
      )}
    </>
  );
}

export default RequestCourseForm;
