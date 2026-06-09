import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';

/**
 * GreenView
 * Displays a putt-break green image from Supabase Storage with optional
 * GPS-based live position dot.
 *
 * Conventions:
 *  - Image front (closest to fairway) is at the bottom of the image.
 *  - Compass on image shows true-north orientation.
 *  - 5-yard grid overlay (default).
 *
 * Props:
 *  - courseName     (string)  e.g. "AGCC Blues"
 *  - holeNumber     (number)  e.g. 1
 *  - greenCoords    (object)  { f: [lat,lon], m: [lat,lon], b: [lat,lon] }
 *  - onClose        (func)    optional close handler
 */

// --- GPS helpers -----------------------------------------------------------
// Convert lat/lon to a local meters plane around an origin lat
// Returns { x: meters east, y: meters north }
function latLonToMeters(lat, lon, originLat, originLon) {
  const R = 6371000; // earth radius m
  const dLat = ((lat - originLat) * Math.PI) / 180;
  const dLon = ((lon - originLon) * Math.PI) / 180;
  const meanLat = ((lat + originLat) / 2) * (Math.PI / 180);
  const x = dLon * R * Math.cos(meanLat); // east
  const y = dLat * R;                     // north
  return { x, y };
}

/**
 * Compute a 2D affine transform A such that:
 *   [px_norm]   = A * [meters_east]
 *   [py_norm]         [meters_north]
 *                     [1            ]
 *
 * Solves least-squares with 3 point pairs (front/middle/back).
 * Returns 6 coefficients: a,b,c,d,e,f where
 *   x' = a*mx + b*my + c
 *   y' = d*mx + e*my + f
 */
function solveAffine(srcPts, dstPts) {
  // srcPts/dstPts are arrays of {x,y} length 3.
  // We solve two 3x3 linear systems (one for x', one for y').
  // [mx my 1] [a]   [x']
  // [mx my 1] [b] = [x']
  // [mx my 1] [c]   [x']
  const M = [
    [srcPts[0].x, srcPts[0].y, 1],
    [srcPts[1].x, srcPts[1].y, 1],
    [srcPts[2].x, srcPts[2].y, 1],
  ];
  const xPrime = [dstPts[0].x, dstPts[1].x, dstPts[2].x];
  const yPrime = [dstPts[0].y, dstPts[1].y, dstPts[2].y];

  // Solve M * [a,b,c]^T = xPrime via Cramer's rule
  const det = (m) =>
    m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
   -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
   +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);

  const D = det(M);
  if (Math.abs(D) < 1e-12) return null;

  const replaceCol = (m, col, vec) => m.map((row, i) => row.map((v, j) => j === col ? vec[i] : v));

  const a = det(replaceCol(M, 0, xPrime)) / D;
  const b = det(replaceCol(M, 1, xPrime)) / D;
  const c = det(replaceCol(M, 2, xPrime)) / D;
  const d = det(replaceCol(M, 0, yPrime)) / D;
  const e = det(replaceCol(M, 1, yPrime)) / D;
  const f = det(replaceCol(M, 2, yPrime)) / D;

  return { a, b, c, d, e, f };
}

export default function GreenView({ courseName, holeNumber, greenCoords, onClose }) {
  const [record, setRecord] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Plotted user points
  const [points, setPoints] = useState([]);

  // Calibration
  const [calibrating, setCalibrating] = useState(false);
  const [calibStep, setCalibStep] = useState(0); // 0=front,1=middle,2=back
  const [tempCalib, setTempCalib] = useState({ front: null, middle: null, back: null });

  // Live GPS
  const [userPos, setUserPos] = useState(null); // {lat, lon, accuracy}

  const imgRef = useRef(null);

  // -------- Load record + image --------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setRecord(null);
      setImageUrl(null);
      setPoints([]);
      setCalibrating(false);
      setCalibStep(0);
      setTempCalib({ front: null, middle: null, back: null });

      const { data, error } = await supabase
        .from('green_images')
        .select('*')
        .eq('course_name', courseName)
        .eq('hole_number', holeNumber)
        .maybeSingle();

      if (cancelled) return;

      if (error) { setError(error.message); setLoading(false); return; }
      if (!data) { setError(`No green image for ${courseName} hole ${holeNumber}`); setLoading(false); return; }

      setRecord(data);
      const { data: urlData } = supabase.storage.from('green-images').getPublicUrl(data.image_path);
      setImageUrl(urlData.publicUrl);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [courseName, holeNumber]);

  // -------- Watch GPS --------
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPos({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // -------- Build affine transform from calibration + greenCoords --------
  const transform = useMemo(() => {
    if (!record || !greenCoords) return null;
    const { front_px, middle_px, back_px } = record;
    const { f, m, b } = greenCoords;
    if (!front_px || !middle_px || !back_px) return null;
    if (!f || !m || !b) return null;

    const originLat = m[0];
    const originLon = m[1];
    const srcPts = [
      latLonToMeters(f[0], f[1], originLat, originLon),
      latLonToMeters(m[0], m[1], originLat, originLon),
      latLonToMeters(b[0], b[1], originLat, originLon),
    ];
    const dstPts = [
      { x: front_px.x, y: front_px.y },
      { x: middle_px.x, y: middle_px.y },
      { x: back_px.x, y: back_px.y },
    ];
    const A = solveAffine(srcPts, dstPts);
    return A ? { affine: A, originLat, originLon } : null;
  }, [record, greenCoords]);

  // -------- User pixel position from GPS --------
  const userPixel = useMemo(() => {
    if (!transform || !userPos) return null;
    const { affine, originLat, originLon } = transform;
    const m = latLonToMeters(userPos.lat, userPos.lon, originLat, originLon);
    const x = affine.a * m.x + affine.b * m.y + affine.c;
    const y = affine.d * m.x + affine.e * m.y + affine.f;
    return { x, y };
  }, [transform, userPos]);

  // -------- Handle image click --------
  const handleImageClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;

    if (calibrating) {
      const keys = ['front', 'middle', 'back'];
      const key = keys[calibStep];
      const next = { ...tempCalib, [key]: { x: xNorm, y: yNorm } };
      setTempCalib(next);
      if (calibStep < 2) {
        setCalibStep(calibStep + 1);
      } else {
        // Save to DB
        saveCalibration(next);
      }
      return;
    }

    setPoints(prev => [...prev, {
      id: Date.now(),
      xNorm, yNorm,
      label: `P${prev.length + 1}`
    }]);
  };

  const saveCalibration = async (cal) => {
    const { error } = await supabase
      .from('green_images')
      .update({
        front_px: cal.front,
        middle_px: cal.middle,
        back_px: cal.back,
      })
      .eq('id', record.id);
    if (error) {
      alert('Save calibration error: ' + error.message);
    } else {
      setRecord({ ...record, front_px: cal.front, middle_px: cal.middle, back_px: cal.back });
      setCalibrating(false);
      setCalibStep(0);
      setTempCalib({ front: null, middle: null, back: null });
    }
  };

  const clearPoints = () => setPoints([]);

  const startCalibration = () => {
    setCalibrating(true);
    setCalibStep(0);
    setTempCalib({ front: null, middle: null, back: null });
  };

  const cancelCalibration = () => {
    setCalibrating(false);
    setCalibStep(0);
    setTempCalib({ front: null, middle: null, back: null });
  };

  const recalibrate = () => {
    if (window.confirm('Re-calibrate this green? This will overwrite the saved calibration.')) {
      startCalibration();
    }
  };

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

  const hasCalibration = record?.front_px && record?.middle_px && record?.back_px;
  const hasGreenCoords = !!(greenCoords?.f && greenCoords?.m && greenCoords?.b);
  const calibLabels = ['🟢 FRONT', '🟡 MIDDLE', '🔵 BACK'];

  // Calibration anchor markers
  const anchorMarkers = [];
  if (calibrating) {
    if (tempCalib.front) anchorMarkers.push({ key: 'f', color: '#4CAF50', pt: tempCalib.front, label: 'F' });
    if (tempCalib.middle) anchorMarkers.push({ key: 'm', color: '#FFC107', pt: tempCalib.middle, label: 'M' });
    if (tempCalib.back) anchorMarkers.push({ key: 'b', color: '#2196F3', pt: tempCalib.back, label: 'B' });
  } else if (hasCalibration) {
    anchorMarkers.push({ key: 'f', color: '#4CAF50', pt: record.front_px, label: 'F' });
    anchorMarkers.push({ key: 'm', color: '#FFC107', pt: record.middle_px, label: 'M' });
    anchorMarkers.push({ key: 'b', color: '#2196F3', pt: record.back_px, label: 'B' });
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
            ⛳ {record.course_name} – Hole {record.hole_number}
            <span style={{ color: '#888', fontWeight: 'normal', fontSize: 12, marginLeft: 8 }}>
              ({record.grid_size_yards}-yd grid)
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} style={closeBtn}>✕</button>
          )}
        </div>

        {/* Calibration banner */}
        {calibrating && (
          <div style={{ background: '#332b00', border: '1px solid #c9a700', color: '#ffd54f', padding: '8px 10px', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
            Calibration step {calibStep + 1}/3 — tap on the image where the <strong>{calibLabels[calibStep]}</strong> of the green is.
            <button onClick={cancelCalibration} style={{ ...btn, marginLeft: 10, padding: '2px 8px' }}>Cancel</button>
          </div>
        )}

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`${record.course_name} hole ${record.hole_number} green`}
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

          {/* Plotted points (manual) */}
          {points.map(pt => (
            <div
              key={pt.id}
              style={pinStyle(pt.xNorm, pt.yNorm, '#ff3b30')}
              title={pt.label}
            >
              <span style={pinLabelStyle}>{pt.label}</span>
            </div>
          ))}

          {/* Anchor markers (calibration) */}
          {anchorMarkers.map(a => (
            <div
              key={a.key}
              style={{
                ...pinStyle(a.pt.x, a.pt.y, a.color),
                width: 16, height: 16,
              }}
              title={a.label}
            >
              <span style={pinLabelStyle}>{a.label}</span>
            </div>
          ))}

          {/* Live user position */}
          {!calibrating && hasCalibration && userPixel && (
            <div
              style={{
                position: 'absolute',
                left: `${userPixel.x * 100}%`,
                top: `${userPixel.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(33,150,243,0.95)',
                border: '3px solid #fff',
                boxShadow: '0 0 8px rgba(33,150,243,0.9), 0 0 2px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
              }}
              title={`You (±${Math.round(userPos.accuracy)}m)`}
            />
          )}
        </div>

        {/* Status / actions */}
        <div style={{ marginTop: 10, fontSize: 12, color: '#bbb' }}>
          {calibrating ? (
            <div>Tap to mark the {calibLabels[calibStep]}.</div>
          ) : !hasGreenCoords ? (
            <div style={{ color: '#ff9800' }}>⚠️ No GPS front/middle/back coords for this hole — live position unavailable.</div>
          ) : !hasCalibration ? (
            <div>
              <button onClick={startCalibration} style={{ ...btn, background: '#2e7d32', borderColor: '#2e7d32' }}>
                📍 Calibrate Green (tap F/M/B)
              </button>
              <div style={{ marginTop: 4, color: '#888' }}>One-time setup — enables live blue dot for your position.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {userPos ? (
                  <>📍 Live position {userPos.accuracy ? `(±${Math.round(userPos.accuracy)}m)` : ''}</>
                ) : '🛰️ Acquiring GPS…'}
              </span>
              <button onClick={recalibrate} style={btn}>Re-calibrate</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#888' }}>
          <div>Tap image to plot points · {points.length} plotted</div>
          {points.length > 0 && (
            <button onClick={clearPoints} style={btn}>Clear pts</button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Style helpers ---
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

const pinStyle = (xNorm, yNorm, color) => ({
  position: 'absolute',
  left: `${xNorm * 100}%`,
  top: `${yNorm * 100}%`,
  transform: 'translate(-50%, -50%)',
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: color,
  border: '2px solid #fff',
  boxShadow: '0 0 4px rgba(0,0,0,0.6)',
  pointerEvents: 'none'
});

const pinLabelStyle = {
  position: 'absolute',
  top: -18,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.75)',
  color: '#fff',
  fontSize: 10,
  padding: '1px 4px',
  borderRadius: 3,
  whiteSpace: 'nowrap'
};
