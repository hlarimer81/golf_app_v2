import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * GreenView
 * Displays a putt-break green image from Supabase Storage.
 *
 * Conventions:
 *  - Image front (closest to fairway) is always at the bottom.
 *  - A compass icon on the image shows true-north orientation.
 *  - Image has a 5-yard (default) grid overlay – we can use it to plot
 *    additional points by converting pixel coords → yard coords.
 *
 * Props:
 *  - courseName   (string)  e.g. "AGCC Blues"
 *  - holeNumber   (number)  e.g. 1
 *  - onClose      (func)    optional close handler when used as a modal/overlay
 */
export default function GreenView({ courseName, holeNumber, onClose }) {
  const [record, setRecord] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Plotted points: [{ id, xYards, yYards, label }]
  const [points, setPoints] = useState([]);
  // Image natural dimensions in px (used to map clicks → yards)
  const imgRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setRecord(null);
      setImageUrl(null);
      setPoints([]);

      const { data, error } = await supabase
        .from('green_images')
        .select('*')
        .eq('course_name', courseName)
        .eq('hole_number', holeNumber)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError(`No green image for ${courseName} hole ${holeNumber}`);
        setLoading(false);
        return;
      }

      setRecord(data);

      const { data: urlData } = supabase
        .storage
        .from('green-images')
        .getPublicUrl(data.image_path);

      setImageUrl(urlData.publicUrl);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [courseName, holeNumber]);

  // Convert px → yards based on image natural size & yard dimensions
  // For now we don't know exact yard dimensions of the image, so we just
  // expose pixel coords relative to image. Once image_width_yards /
  // image_height_yards are recorded, we'll convert properly.
  const handleImageClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    // Normalize 0..1 in displayed image
    const xNorm = xPx / rect.width;
    const yNorm = yPx / rect.height;

    // If yardage dims are known, convert to yards; otherwise store norm coords
    const widthYards = record?.image_width_yards;
    const heightYards = record?.image_height_yards;

    const xYards = widthYards ? +(xNorm * widthYards).toFixed(1) : null;
    const yYards = heightYards ? +((1 - yNorm) * heightYards).toFixed(1) : null;

    setPoints(prev => [...prev, {
      id: Date.now(),
      xNorm, yNorm,
      xYards, yYards,
      label: `P${prev.length + 1}`
    }]);
  };

  const clearPoints = () => setPoints([]);

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ color: '#aaa' }}>Loading green…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ color: '#ff7070', marginBottom: 10 }}>⚠️ {error}</div>
          {onClose && <button style={btn} onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
            ⛳ {record.course_name} – Hole {record.hole_number}
            <span style={{ color: '#888', fontWeight: 'normal', fontSize: 12, marginLeft: 8 }}>
              ({record.grid_size_yards}-yard grid · front at bottom)
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} style={closeBtn}>✕</button>
          )}
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`${record.course_name} hole ${record.hole_number} green`}
            onLoad={(e) => setImgDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            onClick={handleImageClick}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 6,
              cursor: 'crosshair',
              userSelect: 'none'
            }}
          />

          {/* Plotted points overlay */}
          {points.map(pt => (
            <div
              key={pt.id}
              style={{
                position: 'absolute',
                left: `${pt.xNorm * 100}%`,
                top: `${pt.yNorm * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#ff3b30',
                border: '2px solid #fff',
                boxShadow: '0 0 4px rgba(0,0,0,0.6)',
                pointerEvents: 'none'
              }}
              title={pt.xYards != null ? `${pt.label}: (${pt.xYards}yd, ${pt.yYards}yd)` : pt.label}
            >
              <span style={{
                position: 'absolute',
                top: -18,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                fontSize: 10,
                padding: '1px 4px',
                borderRadius: 3,
                whiteSpace: 'nowrap'
              }}>
                {pt.label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#bbb' }}>
          <div>
            Tap image to plot a point. {points.length} point{points.length === 1 ? '' : 's'} plotted.
          </div>
          {points.length > 0 && (
            <button onClick={clearPoints} style={btn}>Clear</button>
          )}
        </div>

        {record.notes && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#888', fontStyle: 'italic' }}>
            {record.notes}
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 10,
  boxSizing: 'border-box'
};

const panelStyle = {
  background: '#1a1a1a',
  border: '2px solid #4CAF50',
  borderRadius: 12,
  padding: 12,
  width: '100%',
  maxWidth: 600,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
};

const btn = {
  background: '#333',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer'
};

const closeBtn = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: 18,
  cursor: 'pointer'
};
