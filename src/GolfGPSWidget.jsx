import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AddGreenData from './components/AddGreenData';

// Haversine formula → distance in meters (raw, no rounding).
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const metersToYards = (m) => Math.round(m * 1.09361);

const calculateDistanceInYards = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
  return metersToYards(haversineMeters(lat1, lon1, lat2, lon2));
};

// Calculate front/middle/back distances from green polygon
const calculateDistancesFromPolygon = (userLat, userLon, polygon) => {
  if (!polygon || polygon.length === 0) {
    return { front: null, middle: null, back: null };
  }

  // MIDDLE: Distance to centroid (center of green)
  const centroid = calculateCentroid(polygon);
  const middle = calculateDistanceInYards(userLat, userLon, centroid[0], centroid[1]);

  // FRONT: Distance to closest point on polygon
  let frontMeters = Infinity;
  polygon.forEach(point => {
    const dist = haversineMeters(userLat, userLon, point[0], point[1]);
    if (dist < frontMeters) frontMeters = dist;
  });
  const front = metersToYards(frontMeters);

  // BACK: Distance to farthest point on polygon
  let backMeters = 0;
  polygon.forEach(point => {
    const dist = haversineMeters(userLat, userLon, point[0], point[1]);
    if (dist > backMeters) backMeters = dist;
  });
  const back = metersToYards(backMeters);

  return { front, middle, back };
};

// Calculate centroid (center point) of polygon
const calculateCentroid = (polygon) => {
  let sumLat = 0, sumLon = 0;
  polygon.forEach(coord => {
    sumLat += coord[0];
    sumLon += coord[1];
  });
  return [sumLat / polygon.length, sumLon / polygon.length];
};

export default function GolfGPSWidget({ courseData, matchId, players, courseName, onCourseRefresh }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [error, setError] = useState(null);
  const [distances, setDistances] = useState({ front: null, middle: null, back: null });
  const [targetHole, setTargetHole] = useState(1);
  const [showAddGreen, setShowAddGreen] = useState(false);

  // Fetch real-time scores and determine the next unscored hole when opened
  useEffect(() => {
    if (!matchId || !isOpen || !players || players.length === 0) return;

    const determineNextHole = async () => {
      const { data } = await supabase.from('scores').select('*').eq('match_id', matchId);
      const scoreMap = {};
      data?.forEach(s => {
        if (!scoreMap[s.player_id]) scoreMap[s.player_id] = {};
        scoreMap[s.player_id][s.hole_number] = s.strokes;
      });

      // Find the first hole 1 to 18 where no player has a score entered
      let nextH = 1;
      for (let h = 1; h <= 18; h++) {
        const hasAnyScore = players.some(p => {
          const playerScores = scoreMap[p.id] || {};
          return playerScores[h] !== undefined && playerScores[h] !== null && playerScores[h] !== '';
        });
        if (!hasAnyScore) {
          nextH = h;
          break;
        }
      }
      setTargetHole(nextH);
    };

    determineNextHole();
  }, [isOpen, matchId, players]);


  useEffect(() => {
    if (!isOpen) {
      setUserLocation(null);
      setDistances({ front: null, middle: null, back: null });
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    const handleSuccess = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setUserLocation({ latitude, longitude, accuracy });

      // Use greens data from courseData
      const green = courseData?.greens?.find(g => g.hole === targetHole);
      if (green) {
        // Check format: new front/center/back objects or old polygon or old f/m/b arrays
        //
        // ANY of the three is enough. Requiring all three meant a green missing one point showed
        // NO distances at all - it fell through every branch to nulls and sat on "Tracking green
        // coordinates..." forever. Partial greens are normal: a capture can be interrupted, and
        // every green captured before the stale-state fix in AddGreenData.jsx has a null back.
        if (green.front || green.center || green.back) {
          // NEW FORMAT: {front:{lat,lon}, center:{lat,lon}, back:{lat,lon}}, any subset present
          setDistances({
            front: green.front
              ? calculateDistanceInYards(latitude, longitude, green.front.lat, green.front.lon)
              : null,
            middle: green.center
              ? calculateDistanceInYards(latitude, longitude, green.center.lat, green.center.lon)
              : null,
            back: green.back
              ? calculateDistanceInYards(latitude, longitude, green.back.lat, green.back.lon)
              : null,
          });
        } else if (green.polygon && Array.isArray(green.polygon)) {
          // POLYGON FORMAT: Calculate from polygon
          const polygonDistances = calculateDistancesFromPolygon(latitude, longitude, green.polygon);
          setDistances(polygonDistances);
        } else if (green.f && green.m && green.b) {
          // OLD ARRAY FORMAT: [lat, lon] arrays
          setDistances({
            front: calculateDistanceInYards(latitude, longitude, green.f?.[0], green.f?.[1]),
            middle: calculateDistanceInYards(latitude, longitude, green.m?.[0], green.m?.[1]),
            back: calculateDistanceInYards(latitude, longitude, green.b?.[0], green.b?.[1]),
          });
        } else {
          setDistances({ front: null, middle: null, back: null });
        }
      } else {
        setDistances({ front: null, middle: null, back: null });
      }
    };

    const handleError = (err) => {
      setError(err.message);
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOpen, targetHole, courseData]);

  const hasGreensData = courseData?.greens && courseData.greens.length > 0;
  const currentGreen = courseData?.greens?.find(g => g.hole === targetHole);

  const handleAddGreenComplete = async () => {
    if (onCourseRefresh) {
      await onCourseRefresh();
    }
    setShowAddGreen(false);
  };

  // Render AddGreenData modal if active
  if (showAddGreen && courseData?.id) {
    return (
      <>
        {isOpen && (
          <div style={{
            position: 'fixed',
            top: '60px',
            left: '10px',
            right: '10px',
            background: '#1a1a1a',
            border: '2px solid #4CAF50',
            borderRadius: '12px',
            padding: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
            zIndex: 999,
            fontFamily: 'sans-serif',
            opacity: 0.3
          }}>
            <div style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>
              Adding green data...
            </div>
          </div>
        )}
        <AddGreenData
          courseId={courseData.id}
          courseName={courseData.name || courseName}
          holeNumber={targetHole}
          onComplete={handleAddGreenComplete}
        />
      </>
    );
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          padding: '5px 12px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '20px',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          marginLeft: '10px',
          marginRight: '10px'
        }}
      >
        🛰️ GPS
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      left: '10px',
      right: '10px',
      background: '#1a1a1a',
      border: '2px solid #4CAF50',
      borderRadius: '12px',
      padding: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
      zIndex: 1000,
      fontFamily: 'sans-serif'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#4CAF50' }}>
          ⛳ Hole {targetHole} Green GPS ({courseData?.name || 'Course'})
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>

      {!currentGreen ? (
        <div>
          <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px', marginBottom: '10px' }}>
            ❌ No GPS coordinates for Hole {targetHole}.
          </div>
          <button
            onClick={() => setShowAddGreen(true)}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            📍 Add Green GPS Data
          </button>
        </div>
      ) : error ? (
        <div style={{ fontSize: '12px', color: '#ff9800', textAlign: 'center', padding: '10px' }}>
          ⚠️ GPS Error: {error}. Check iPhone settings.
        </div>
      ) : (distances.front == null && distances.middle == null && distances.back == null) ? (
        // Only when we have NOTHING. Gating on `middle` alone kept a front-and-back green stuck
        // here with two perfectly good numbers to show.
        <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px' }}>
          🛰️ Tracking green coordinates...
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>FRONT</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: distances.front == null ? '#555' : '#ff9800' }}>{distances.front ?? '–'} {distances.front != null && <span style={{ fontSize: '11px', fontWeight: 'normal' }}>yd</span>}</div>
          </div>
          <div style={{ borderLeft: '1px solid #333', borderRight: '1px solid #333', padding: '0 20px' }}>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>MIDDLE</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: distances.middle == null ? '#555' : '#4CAF50' }}>{distances.middle ?? '–'} {distances.middle != null && <span style={{ fontSize: '14px', fontWeight: 'normal' }}>yd</span>}</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>BACK</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: distances.back == null ? '#555' : '#2196F3' }}>{distances.back ?? '–'} {distances.back != null && <span style={{ fontSize: '11px', fontWeight: 'normal' }}>yd</span>}</div>
          </div>
        </div>
      )}

      {userLocation && (
        <div style={{ fontSize: '8px', color: '#555', textAlign: 'right', marginTop: '6px' }}>
          GPS accuracy: ±{Math.round(userLocation.accuracy)} yds
        </div>
      )}

      {/* Show "Add Green Data" button if any distance is showing. Keyed off `middle` alone, a
          partially-captured green hid the very button needed to finish capturing it. */}
      {(distances.front != null || distances.middle != null || distances.back != null) && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
          <button
            onClick={() => setShowAddGreen(true)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            📍 Update Green GPS Data
          </button>
        </div>
      )}
    </div>
  );
}
