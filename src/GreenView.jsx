import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';

/**
 * GreenView
 * Displays a putt-break green image from Supabase Storage with optional
 * GPS-based live position dot.
 *
 * Calibration is now auto-derived from the OSM green polygon (stored in
 * green_images.green_polygon) and the image's bounding box. The image's
 * real-world rotation is taken from green_images.image_north_deg — the
 * bearing (clockwise from true north) that the TOP of the image points to.
 *   - 0   → image is north-up.
 *   - 90  → top of image points east.
 *   - 265 → top of image points roughly west.
 *
 * Conventions:
 *  - Image x-axis = right, y-axis = down (standard image coords).
 *  - 5-yard grid overlay (default).
 *
 * Props:
 *  - courseName     (string)  e.g. "AGCC Blues"
 *  - holeNumber     (number)  e.g. 1
 *  - greenPolygon   (array)   [[lat,lon], ...] OSM polygon for this green (preferred)
 *  - greenCoords    (object)  legacy { f: [lat,lon], m: [lat,lon], b: [lat,lon] } (fallback)
 *  - onClose        (func)    optional close handler
 */

// --- GPS helpers -----------------------------------------------------------
function latLonToMeters(lat, lon, originLat, originLon) {
  const R = 6371000;
  const dLat = ((lat - originLat) * Math.PI) / 180;
  const dLon = ((lon - originLon) * Math.PI) / 180;
  const meanLat = ((lat + originLat) / 2) * (Math.PI / 180);
  const x = dLon * R * Math.cos(meanLat); // east (m)
  const y = dLat * R;                     // north (m)
  return { x, y };
}

/**
 * Build an auto transform from a green polygon + image dimensions + image rotation.
 *
 * - The polygon (in real-world lat/lon) is converted to local meters
 *   (east, north) about its centroid.
 * - Those meter coords are then rotated into "image-space meters" using
 *   `imageNorthDeg` (the bearing that the TOP of the image points toward
 *   in the real world), so that image-up becomes the +Y axis.
 * - We then bbox-fit (letterbox) the rotated polygon into the image and
 *   produce a (lat,lon) → normalized-pixel function.
 *
 * Returns { originLat, originLon, toNormalized(lat, lon), bbox }.
 */
function buildAutoTransform(polygon, imgW, imgH, imageNorthDeg = 0) {
  if (!polygon?.length || !imgW || !imgH) return null;

  // Reference origin = polygon centroid (keeps meters small/accurate).
  let sumLat = 0, sumLon = 0;
  for (const [la, lo] of polygon) { sumLat += la; sumLon += lo; }
  const originLat = sumLat / polygon.length;
  const originLon = sumLon / polygon.length;

  // We want a rotation that maps real-world (east, north) into image-space
  // (right, up) where image-up is the +Y axis. If the top of the image
  // points to bearing θ (clockwise from north), then a real-world vector
  // pointing along that bearing must end up along image-up.
  //
  // Real-world vector at bearing θ in (east, north) coords:
  //   v_world = (sin θ, cos θ)
  // We want R · v_world = (0, 1).
  //
  // R = [[ cos θ, -sin θ],
  //      [ sin θ,  cos θ]]
  // applied as: imgRight =  cos θ · east  -  sin θ · north
  //             imgUp    =  sin θ · east  +  cos θ · north
  // (Check: east=sin θ, north=cos θ → imgRight = sinθcosθ − sinθcosθ = 0,
  //  imgUp = sin²θ + cos²θ = 1. ✓)
  const thetaRad = (imageNorthDeg * Math.PI) / 180;
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  const rotate = (east, north) => ({
    r:  cosT * east - sinT * north, // image right (+X)
    u:  sinT * east + cosT * north, // image up (+Y)
  });

  // Convert polygon to local meters (east, north) and then rotate into image space.
  const pts = polygon.map(([la, lo]) => {
    const m = latLonToMeters(la, lo, originLat, originLon);
    return rotate(m.x, m.y);
  });

  // Bounding box in rotated (image-space) meters.
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
  for (const p of pts) {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
    if (p.u < minU) minU = p.u;
    if (p.u > maxU) maxU = p.u;
  }
  const widthM = maxR - minR;
  const heightM = maxU - minU;
  if (widthM <= 0 || heightM <= 0) return null;

  // Letterbox the polygon bbox inside the image bbox (preserve aspect).
  const mppX = widthM / imgW;
  const mppY = heightM / imgH;
  const mpp = Math.max(mppX, mppY);

  const polyPxW = widthM / mpp;
  const polyPxH = heightM / mpp;

  const offsetPxX = (imgW - polyPxW) / 2;
  const offsetPxY = (imgH - polyPxH) / 2;

  return {
    originLat,
    originLon,
    imageNorthDeg,
    /**
     * Convert lat/lon to normalized pixel coords on the image (0..1).
     */
    toNormalized(lat, lon) {
      const m = latLonToMeters(lat, lon, originLat, originLon);
      const { r, u } = rotate(m.x, m.y);
      // r → image x (right). offset from minR.
      const px = offsetPxX + (r - minR) / mpp;
      // u → image-up. Image y grows DOWN, so flip:
      // maxU is at top of image → y=0; minU at bottom → y=imgH.
      const py = offsetPxY + (maxU - u) / mpp;
      return { x: px / imgW, y: py / imgH };
    },
    bbox: { minR, maxR, minU, maxU, widthM, heightM, mpp, polyPxW, polyPxH },
  };
}

export default function GreenView({ courseName, holeNumber, greenPolygon, greenCoords, onClose }) {
  const [record, setRecord] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Image natural size (for aspect-correct transform).
  const [imgSize, setImgSize] = useState(null); // { w, h }

  // Plotted user points (taps).
  const [points, setPoints] = useState([]);

  // Live GPS
  const [userPos, setUserPos] = useState(null);

  // Compass-follow mode (rotates the picture so phone heading is "up").
  const [compassFollow, setCompassFollow] = useState(false);
  const [heading, setHeading] = useState(null); // degrees clockwise from true north
  const [orientationPermission, setOrientationPermission] = useState('unknown'); // 'unknown' | 'granted' | 'denied' | 'unsupported'

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
      setImgSize(null);

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

  // -------- Watch device orientation (compass) when compass-follow is on --------
  useEffect(() => {
    if (!compassFollow) return;

    const handler = (e) => {
      // Prefer iOS-specific webkitCompassHeading (already in degrees clockwise from true north).
      let deg = null;
      if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
        deg = e.webkitCompassHeading;
      } else if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        // Most browsers: alpha is degrees counter-clockwise around z-axis (0 = device-pointing-north when flat).
        // Convert to clockwise-from-north heading.
        deg = (360 - e.alpha) % 360;
      }
      if (deg != null) setHeading(deg);
    };

    // iOS 13+ requires explicit permission via a user-gesture-triggered call.
    const DeviceOrientationEventCtor = window.DeviceOrientationEvent;
    if (!DeviceOrientationEventCtor) {
      setOrientationPermission('unsupported');
      return;
    }

    let attached = false;
    const attach = () => {
      window.addEventListener('deviceorientation', handler, true);
      attached = true;
    };

    if (typeof DeviceOrientationEventCtor.requestPermission === 'function') {
      // iOS path — must be invoked from a user gesture. We do this on toggle-on.
      DeviceOrientationEventCtor.requestPermission()
        .then((state) => {
          if (state === 'granted') {
            setOrientationPermission('granted');
            attach();
          } else {
            setOrientationPermission('denied');
          }
        })
        .catch(() => setOrientationPermission('denied'));
    } else {
      setOrientationPermission('granted');
      attach();
    }

    return () => {
      if (attached) window.removeEventListener('deviceorientation', handler, true);
    };
  }, [compassFollow]);

  // -------- Resolve polygon: prefer prop, fall back to record --------
  const polygon = useMemo(() => {
    if (greenPolygon?.length) return greenPolygon;
    if (record?.green_polygon?.length) return record.green_polygon;
    // Synthesize a 3-point polygon from legacy f/m/b coords if present.
    if (greenCoords?.f && greenCoords?.m && greenCoords?.b) {
      return [greenCoords.f, greenCoords.m, greenCoords.b];
    }
    return null;
  }, [greenPolygon, record, greenCoords]);

  // -------- Build auto transform --------
  const transform = useMemo(() => {
    if (!polygon || !imgSize) return null;
    const northDeg = Number(record?.image_north_deg) || 0;
    return buildAutoTransform(polygon, imgSize.w, imgSize.h, northDeg);
  }, [polygon, imgSize, record]);

  // -------- User pixel position from GPS --------
  const userPixel = useMemo(() => {
    if (!transform || !userPos) return null;
    return transform.toNormalized(userPos.lat, userPos.lon);
  }, [transform, userPos]);

  // -------- Rotation applied to the on-screen image when compass-follow is active --------
  // We want the direction the phone is facing (= `heading`) to appear at the TOP of the
  // picture. The picture's top currently represents bearing `imageNorthDeg`.
  //
  // CSS `transform: rotate(θ)` rotates content CLOCKWISE on screen (because the y-axis
  // grows downward). To bring the heading bearing to the top, we need to rotate the
  // picture COUNTER-clockwise by (heading − imageNorthDeg) — i.e. CLOCKWISE by
  // (imageNorthDeg − heading)... but on a screen where y grows DOWN, that comes out
  // the wrong way. The correct CSS rotation is (heading − imageNorthDeg).
  const imageNorthDeg = Number(record?.image_north_deg) || 0;
  const displayRotationDeg =
    compassFollow && heading != null ? (heading - imageNorthDeg) : 0;

  // -------- Handle image click (plot points) --------
  const handleImageClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;
    setPoints(prev => [...prev, {
      id: Date.now(),
      xNorm, yNorm,
      label: `P${prev.length + 1}`
    }]);
  };

  const clearPoints = () => setPoints([]);

  const handleImageLoad = (e) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
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

  const hasPolygon = !!polygon;

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

        <div style={{ position: 'relative', display: 'inline-block', width: '100%', overflow: 'hidden' }}>
          {/* Wrapper that we rotate as a whole so points/dot stay aligned with the image. */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              transform: `rotate(${displayRotationDeg}deg)`,
              transformOrigin: '50% 50%',
              transition: 'transform 120ms linear',
            }}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt={`${record.course_name} hole ${record.hole_number} green`}
              onClick={handleImageClick}
              onLoad={handleImageLoad}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: 6,
                cursor: 'crosshair',
                userSelect: 'none'
              }}
            />

            {/* Plotted points (manual taps) */}
            {points.map(pt => (
              <div
                key={pt.id}
                style={pinStyle(pt.xNorm, pt.yNorm, '#ff3b30')}
                title={pt.label}
              >
                <span style={pinLabelStyle}>{pt.label}</span>
              </div>
            ))}

            {/* Live user position (auto-calibrated from OSM polygon) */}
            {hasPolygon && userPixel && (
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

          {/* "Up" indicator overlay (always points to the top of the screen). */}
          {compassFollow && (
            <div style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}>
              ⬆ Facing {heading != null ? `${Math.round(heading)}°` : '…'}
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{ marginTop: 10, fontSize: 12, color: '#bbb' }}>
          {!hasPolygon ? (
            <div style={{ color: '#ff9800' }}>⚠️ No GPS polygon for this green — live position unavailable.</div>
          ) : (
            <div>
              {userPos ? (
                <>📍 Live position {userPos.accuracy ? `(±${Math.round(userPos.accuracy)}m)` : ''} · auto-calibrated from map data</>
              ) : '🛰️ Acquiring GPS…'}
            </div>
          )}
        </div>

        {/* Compass-follow toggle */}
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#bbb' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={compassFollow}
              onChange={(e) => setCompassFollow(e.target.checked)}
            />
            🧭 Compass-follow (rotate image with phone heading)
          </label>
          {compassFollow && orientationPermission === 'denied' && (
            <span style={{ color: '#ff7070', fontSize: 11 }}>Motion access denied</span>
          )}
          {compassFollow && orientationPermission === 'unsupported' && (
            <span style={{ color: '#ff9800', fontSize: 11 }}>Not supported</span>
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
