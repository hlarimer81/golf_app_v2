import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function ReportCourseIssue({ courseId, courseName, teeBoxId, onClose }) {
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('course_issues').insert({
        course_id: courseId,
        tee_box_id: teeBoxId || null,
        issue_type: issueType,
        description: description.trim(),
        reported_by: 'user@app', // Replace with actual user identifier
        status: 'open'
      });

      if (error) throw error;

      alert('✅ Issue reported! The admin will review it soon.');
      onClose();
    } catch (err) {
      console.error('Error reporting issue:', err);
      alert('Failed to report issue. Please try again.');
    } finally {
      setLoading(false);
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
          <h3 style={{ margin: 0, color: '#333' }}>🐛 Report Issue</h3>
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

        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
          Report an issue with <strong>{courseName}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
              Issue Type *
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '15px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">-- Select Type --</option>
              <option value="incorrect_data">Incorrect Par/Stroke Index</option>
              <option value="missing_tees">Missing Tee Boxes</option>
              <option value="wrong_gps">Incorrect GPS Data</option>
              <option value="wrong_rating">Wrong Rating/Slope</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              required
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '15px',
                boxSizing: 'border-box',
                fontFamily: 'sans-serif',
                resize: 'vertical'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#ccc' : '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ReportCourseIssue;
