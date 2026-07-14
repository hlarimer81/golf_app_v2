import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * AddGreenData Component
 *
 * Allows users to manually add front/center/back GPS coordinates for greens
 * during a round by tapping 3 points on their current position.
 */
export default function AddGreenData({ courseId, courseName, holeNumber, onComplete }) {
  const [step, setStep] = useState(0); // 0=intro, 1=front, 2=center, 3=back, 4=saving
  const [greenData, setGreenData] = useState({
    front: null,
    center: null,
    back: null
  });
  const [currentLocation, setCurrentLocation] = useState(null);
  const [error, setError] = useState(null);

  const steps = ['front', 'center', 'back'];
  const stepLabels = {
    front: 'Front Edge',
    center: 'Center',
    back: 'Back Edge'
  };

  // Watch user location
  useEffect(() => {
    if (step === 0 || step === 4) return;

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [step]);

  const handleCapturePoint = () => {
    if (!currentLocation) {
      setError("Waiting for GPS signal...");
      return;
    }

    const pointType = steps[step - 1];
    setGreenData(prev => ({
      ...prev,
      [pointType]: {
        lat: currentLocation.lat,
        lon: currentLocation.lon
      }
    }));

    if (step < 3) {
      setStep(step + 1);
    } else {
      saveGreenData();
    }
  };

  const saveGreenData = async () => {
    setStep(4);

    try {
      // Fetch current course data
      const { data: courseData, error: fetchError } = await supabase
        .from('golf_courses')
        .select('greens')
        .eq('id', courseId)
        .single();

      if (fetchError) throw fetchError;

      // Get existing greens or initialize empty array
      let greens = courseData?.greens || [];
      if (!Array.isArray(greens)) greens = [];

      // Find if this hole already exists
      const existingIndex = greens.findIndex(g => g.hole === holeNumber);

      const newGreenEntry = {
        hole: holeNumber,
        front: greenData.front,
        center: greenData.center,
        back: greenData.back,
        added_by: 'user', // Could track user ID here
        added_at: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        // Update existing
        greens[existingIndex] = newGreenEntry;
      } else {
        // Add new and sort by hole number
        greens.push(newGreenEntry);
        greens.sort((a, b) => a.hole - b.hole);
      }

      // Save to database
      const { error: updateError } = await supabase
        .from('golf_courses')
        .update({ greens: greens })
        .eq('id', courseId);

      if (updateError) throw updateError;

      // Success!
      if (onComplete) onComplete(newGreenEntry);
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
      setStep(0);
    }
  };

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    container: {
      background: '#1a1a1a',
      border: '2px solid #4CAF50',
      borderRadius: '12px',
      padding: '20px',
      maxWidth: '400px',
      width: '100%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)'
    },
    header: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#4CAF50',
      marginBottom: '15px',
      textAlign: 'center'
    },
    subtitle: {
      fontSize: '14px',
      color: '#aaa',
      marginBottom: '20px',
      textAlign: 'center'
    },
    stepIndicator: {
      display: 'flex',
      justifyContent: 'center',
      gap: '10px',
      marginBottom: '20px'
    },
    stepDot: {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: '#333'
    },
    stepDotActive: {
      backgroundColor: '#4CAF50'
    },
    stepDotComplete: {
      backgroundColor: '#2196F3'
    },
    instructions: {
      fontSize: '14px',
      color: '#fff',
      marginBottom: '20px',
      lineHeight: '1.5',
      textAlign: 'center'
    },
    locationBox: {
      background: '#0a0a0a',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '20px',
      fontSize: '12px',
      color: '#888'
    },
    button: {
      width: '100%',
      padding: '15px',
      backgroundColor: '#4CAF50',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      marginBottom: '10px'
    },
    buttonSecondary: {
      backgroundColor: '#555'
    },
    buttonDisabled: {
      backgroundColor: '#333',
      cursor: 'not-allowed',
      opacity: 0.5
    },
    error: {
      color: '#ff9800',
      fontSize: '12px',
      marginTop: '10px',
      textAlign: 'center'
    },
    successIcon: {
      fontSize: '48px',
      textAlign: 'center',
      marginBottom: '20px'
    }
  };

  if (step === 0) {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.header}>📍 Add Green GPS Data</div>
          <div style={styles.subtitle}>
            {courseName} - Hole {holeNumber}
          </div>
          <div style={styles.instructions}>
            You'll be asked to walk to and mark <strong>3 positions</strong>:
            <ul style={{ textAlign: 'left', marginTop: '10px' }}>
              <li>🔴 Front edge of green</li>
              <li>🟡 Center of green</li>
              <li>🔵 Back edge of green</li>
            </ul>
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#888' }}>
              Make sure you're standing ON the green at each position when you tap "Capture".
            </div>
          </div>
          <button style={styles.button} onClick={() => setStep(1)}>
            Start Mapping
          </button>
          <button
            style={{...styles.button, ...styles.buttonSecondary}}
            onClick={onComplete}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.successIcon}>✅</div>
          <div style={styles.header}>Green Data Saved!</div>
          <div style={styles.subtitle}>
            Hole {holeNumber} GPS coordinates have been added
          </div>
          <div style={styles.instructions}>
            Thank you for contributing! This data will help everyone who plays this course.
          </div>
          <button style={styles.button} onClick={onComplete}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const currentStep = steps[step - 1];
  const currentLabel = stepLabels[currentStep];
  const isCapturing = step >= 1 && step <= 3;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          Step {step}/3: {currentLabel}
        </div>
        <div style={styles.subtitle}>
          {courseName} - Hole {holeNumber}
        </div>

        <div style={styles.stepIndicator}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                ...styles.stepDot,
                ...(i < step ? styles.stepDotComplete : {}),
                ...(i === step ? styles.stepDotActive : {})
              }}
            />
          ))}
        </div>

        <div style={styles.instructions}>
          {currentStep === 'front' && "Walk to the FRONT EDGE of the green (closest to the tee). Stand on the green and tap Capture."}
          {currentStep === 'center' && "Walk to the CENTER of the green. Stand in the middle and tap Capture."}
          {currentStep === 'back' && "Walk to the BACK EDGE of the green (farthest from the tee). Stand on the green and tap Capture."}
        </div>

        {currentLocation && (
          <div style={styles.locationBox}>
            <div>📍 GPS Lock Acquired</div>
            <div style={{ marginTop: '5px', fontSize: '10px' }}>
              Lat: {currentLocation.lat.toFixed(6)}<br/>
              Lon: {currentLocation.lon.toFixed(6)}<br/>
              Accuracy: ±{Math.round(currentLocation.accuracy * 1.09361)} yards
            </div>
          </div>
        )}

        <button
          style={{
            ...styles.button,
            ...(currentLocation?.accuracy > 15 ? styles.buttonDisabled : {})
          }}
          onClick={handleCapturePoint}
          disabled={!currentLocation || currentLocation.accuracy > 15}
        >
          {!currentLocation
            ? '🛰️ Acquiring GPS...'
            : currentLocation.accuracy > 15
            ? '⚠️ Waiting for Better GPS...'
            : `✓ Capture ${currentLabel}`
          }
        </button>

        <button
          style={{...styles.button, ...styles.buttonSecondary}}
          onClick={() => setStep(step - 1)}
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        {error && <div style={styles.error}>⚠️ {error}</div>}

        {currentLocation && currentLocation.accuracy > 15 && (
          <div style={styles.error}>
            GPS accuracy is {Math.round(currentLocation.accuracy)}m.
            Move to open sky for better signal.
          </div>
        )}
      </div>
    </div>
  );
}
