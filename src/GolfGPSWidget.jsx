import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

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

export default function GolfGPSWidget({ courseData, matchId, players, courseName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [error, setError] = useState(null);
  const [distances, setDistances] = useState({ front: null, middle: null, back: null });
  const [targetHole, setTargetHole] = useState(1);

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
      const green = courseData?.greens?.[targetHole - 1];
      if (green) {
        setDistances({
          front: calculateDistanceInYards(latitude, longitude, green.f?.[0], green.f?.[1]),
          middle: calculateDistanceInYards(latitude, longitude, green.m?.[0], green.m?.[1]),
          back: calculateDistanceInYards(latitude, longitude, green.b?.[0], green.b?.[1]),
        });
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

      {!hasGreensData ? (
        <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px' }}>
          ❌ No GPS coordinates available for this course.
        </div>
      ) : error ? (
        <div style={{ fontSize: '12px', color: '#ff9800', textAlign: 'center', padding: '10px' }}>
          ⚠️ GPS Error: {error}. Check iPhone settings.
        </div>
      ) : !distances.middle ? (
        <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px' }}>
          🛰️ Tracking green coordinates...
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>FRONT</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#ff9800' }}>{distances.front} <span style={{ fontSize: '11px', fontWeight: 'normal' }}>yd</span></div>
          </div>
          <div style={{ borderLeft: '1px solid #333', borderRight: '1px solid #333', padding: '0 20px' }}>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>MIDDLE</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#4CAF50' }}>{distances.middle} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>yd</span></div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>BACK</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#2196F3' }}>{distances.back} <span style={{ fontSize: '11px', fontWeight: 'normal' }}>yd</span></div>
          </div>
        </div>
      )}

      {userLocation && (
        <div style={{ fontSize: '8px', color: '#555', textAlign: 'right', marginTop: '6px' }}>
          GPS accuracy: ±{Math.round(userLocation.accuracy)} yds
        </div>
      )}
    </div>
  );
}
