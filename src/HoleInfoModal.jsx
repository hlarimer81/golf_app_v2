import React from 'react';

// Per-hole "What Happened" modal. Given the active game and a small description of the
// hole's result (built by the Grid), explains the math for that single hole in plain
// language. `info` is: { hole, par, rows:[{ name, gross, net, note }], summary }.
export default function HoleInfoModal({ info, gameName, onClose, accent = '#4CAF50' }) {
  if (!info) return null;
  const { hole, par, rows = [], summary } = info;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 3100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}
    >
      <div style={{ background: '#1e1e1e', color: '#e0e0e0', borderRadius: '14px', width: '100%', maxWidth: '420px', maxHeight: '85vh', overflowY: 'auto', border: `2px solid ${accent}`, padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Hole {hole} · Par {par}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{gameName} — what happened</div>
        </div>

        {summary && (
          <div style={{ background: '#252525', border: `1px solid ${accent}`, borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', color: accent }}>
            {summary}
          </div>
        )}

        <div style={{ marginBottom: '18px' }}>
          {rows.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', textAlign: 'center' }}>No scores entered for this hole yet.</div>
          ) : (
            rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2a2a', fontSize: '13px' }}>
                <span style={{ flex: 2, color: '#ccc', fontWeight: 'bold' }}>{r.name}</span>
                <span style={{ flex: 1, textAlign: 'center', color: '#888' }}>{r.gross != null ? `${r.gross}${r.net != null && r.net !== r.gross ? ` (${r.net})` : ''}` : '—'}</span>
                <span style={{ flex: 2, textAlign: 'right', color: r.highlight ? accent : '#aaa', fontWeight: r.highlight ? 'bold' : 'normal' }}>{r.note || ''}</span>
              </div>
            ))
          )}
        </div>

        <button onClick={onClose} style={{ width: '100%', padding: '13px', background: accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}
