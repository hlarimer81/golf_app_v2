import React from 'react';

export default function GolfScoreTile({
  score,
  par,
  hasOneStroke,
  hasTwoStrokes,
  wolfPoints,
  showStar,
  vegasPoints,
  style = {},
  id,
  onChange,
  onKeyDown,
  customBorderColor,
  ...rest
}) {
  const numScore = score !== '' && score !== null && score !== undefined ? parseInt(score) : null;
  const numPar = parseInt(par) || 4;
  
  let shapeType = null;
  if (numScore !== null && !isNaN(numScore) && numScore > 0) {
    const diff = numScore - numPar;
    if (diff <= -2) {
      shapeType = 'double-circle';
    } else if (diff === -1) {
      shapeType = 'single-circle';
    } else if (diff === 0) {
      shapeType = 'par';
    } else if (diff === 1) {
      shapeType = 'single-square';
    } else if (diff >= 2) {
      shapeType = 'double-square';
    }
  }

  const width = style.width || '38px';
  const height = style.height || '38px';
  const borderColor = customBorderColor || '#fff';
  
  const outerStyle = {
    position: 'relative',
    width: width,
    height: height,
    display: 'inline-block',
    verticalAlign: 'middle',
    boxSizing: 'border-box'
  };

  let shapeDecorations = null;
  if (shapeType === 'single-circle') {
    shapeDecorations = (
      <div style={{
        position: 'absolute',
        top: '1px',
        left: '1px',
        right: '1px',
        bottom: '1px',
        border: `1.5px solid ${borderColor}`,
        borderRadius: '50%',
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }} />
    );
  } else if (shapeType === 'double-circle') {
    shapeDecorations = (
      <>
        <div style={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          right: '0px',
          bottom: '0px',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '50%',
          pointerEvents: 'none',
          boxSizing: 'border-box'
        }} />
        <div style={{
          position: 'absolute',
          top: '3px',
          left: '3px',
          right: '3px',
          bottom: '3px',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '50%',
          pointerEvents: 'none',
          boxSizing: 'border-box'
        }} />
      </>
    );
  } else if (shapeType === 'single-square') {
    shapeDecorations = (
      <div style={{
        position: 'absolute',
        top: '1px',
        left: '1px',
        right: '1px',
        bottom: '1px',
        border: `1.5px solid ${borderColor}`,
        borderRadius: '0px',
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }} />
    );
  } else if (shapeType === 'double-square') {
    shapeDecorations = (
      <>
        <div style={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          right: '0px',
          bottom: '0px',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '0px',
          pointerEvents: 'none',
          boxSizing: 'border-box'
        }} />
        <div style={{
          position: 'absolute',
          top: '3px',
          left: '3px',
          right: '3px',
          bottom: '3px',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '0px',
          pointerEvents: 'none',
          boxSizing: 'border-box'
        }} />
      </>
    );
  }

  const inputStyle = {
    ...style,
    width: '100%',
    height: '100%',
    margin: 0,
    boxSizing: 'border-box',
    border: shapeType === null ? (customBorderColor ? `2px solid ${customBorderColor}` : style.border || '1px solid #444') : 'none',
    borderRadius: shapeType === null ? (style.borderRadius || '4px') : '0px',
    background: 'transparent',
    position: 'relative',
    zIndex: 2,
  };

  const popDots = (hasOneStroke || hasTwoStrokes) && (
    <div style={{
      position: 'absolute',
      top: '-6px',
      right: '2px',
      display: 'flex',
      flexDirection: 'row',
      gap: '2px',
      zIndex: 5,
      pointerEvents: 'none'
    }}>
      {hasOneStroke && <div style={{ width: '4px', height: '4px', backgroundColor: '#4CAF50', borderRadius: '50%' }} />}
      {hasTwoStrokes && <div style={{ width: '4px', height: '4px', backgroundColor: '#4CAF50', borderRadius: '50%' }} />}
    </div>
  );

  const wolfPointsContainer = wolfPoints > 0 && (
    <div style={{
      position: 'absolute',
      top: '-2px',
      left: '-2px',
      width: '14px',
      height: '14px',
      backgroundColor: '#4CAF50',
      borderRadius: '50%',
      color: '#fff',
      fontSize: '8px',
      fontWeight: 'bold',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 6,
      pointerEvents: 'none',
      border: '1px solid #fff'
    }}>
      {wolfPoints}
    </div>
  );

  const starContainer = showStar && (
    <div style={{
      position: 'absolute',
      top: '-6px',
      left: '0px',
      fontSize: '8px',
      zIndex: 5,
      pointerEvents: 'none'
    }}>
      ⭐
    </div>
  );

  // Anchored to the tile itself, not the table cell, so it stays next to the score it describes:
  // a cell is often much wider than this 38px tile (minWidth leaves slack), and a badge anchored to
  // the cell's own edge can drift far enough from the tile to read as detached from any score, or
  // to be the only part of a scrolled-off cell still peeking out from under a sticky column.
  const vegasPointsBadge = vegasPoints > 0 && (
    <div
      aria-label={`Vegas points won on this hole: ${vegasPoints}`}
      style={{
        position: 'absolute',
        bottom: '-4px',
        right: '-4px',
        fontSize: '10px',
        fontWeight: '900',
        color: '#E91E63',
        background: 'rgba(0,0,0,0.4)',
        padding: '0 2px',
        borderRadius: '2px',
        zIndex: 10,
        pointerEvents: 'none'
      }}>
      +{vegasPoints}
    </div>
  );

  return (
    <div style={outerStyle}>
      {shapeDecorations}
      <input
        id={id}
        onChange={onChange}
        onKeyDown={onKeyDown}
        value={score}
        style={inputStyle}
        {...rest}
      />
      {popDots}
      {wolfPointsContainer}
      {starContainer}
      {vegasPointsBadge}
    </div>
  );
}
