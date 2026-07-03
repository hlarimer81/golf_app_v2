import React, { useState } from 'react';

// Wager configuration modal. Renders the right dollar inputs for the active game and
// returns the updated wager object via onSave. Steps are $0.25 with +/- buttons, plus
// a direct numeric input. Mirrors score_play's wager_edit stepper but game-aware.
export default function WagerConfig({ gameType, wager, onSave, onClose, accent = '#4CAF50' }) {
  const [w, setW] = useState({ ...wager });

  const set = (field, val) => setW((prev) => ({ ...prev, [field]: val }));
  const clampMoney = (v) => Math.max(0, Math.round((parseFloat(v) || 0) * 100) / 100);

  const DollarInput = ({ label, field }) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={() => set(field, clampMoney((w[field] || 0) - 0.25))}
          style={{ width: '42px', height: '42px', fontSize: '20px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>−</button>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}>$</span>
          <input type="number" inputMode="decimal" min="0" step="0.25" value={w[field] || 0}
            onChange={(e) => set(field, clampMoney(e.target.value))}
            style={{ width: '100%', padding: '10px 10px 10px 24px', fontSize: '18px', textAlign: 'center', background: '#252525', color: '#fff', border: '1px solid #444', borderRadius: '8px', boxSizing: 'border-box' }} />
        </div>
        <button type="button" onClick={() => set(field, clampMoney((w[field] || 0) + 0.25))}
          style={{ width: '42px', height: '42px', fontSize: '20px', background: accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>+</button>
      </div>
    </div>
  );

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}
    >
      <div style={{ background: '#1e1e1e', color: '#e0e0e0', borderRadius: '14px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto', border: `2px solid ${accent}`, padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>💵 Set Wager</div>
          <div style={{ fontSize: '13px', color: '#888' }}>Amounts are per unit</div>
        </div>

        {gameType === 'skins' ? (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button type="button" onClick={() => set('skins_pot', false)}
                style={{ flex: 1, padding: '10px', background: !w.skins_pot ? accent : '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Per Skin</button>
              <button type="button" onClick={() => set('skins_pot', true)}
                style={{ flex: 1, padding: '10px', background: w.skins_pot ? accent : '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Pot (Ante)</button>
            </div>
            {w.skins_pot ? <DollarInput label="Ante per player" field="skins_ante" /> : <DollarInput label="$ per skin" field="per_skin" />}
          </>
        ) : gameType === 'nassau' ? (
          <>
            <DollarInput label="Front 9 stake" field="nassau_front" />
            <DollarInput label="Back 9 stake" field="nassau_back" />
            <DollarInput label="Overall (18) stake" field="nassau_overall" />
            <DollarInput label="Press stake (0 = inherit)" field="nassau_press" />
          </>
        ) : (
          <DollarInput label="$ per point" field="per_point" />
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(w)} style={{ flex: 1, padding: '13px', background: accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}
