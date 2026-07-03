import React from 'react';

// Money settlement modal (JS port of score_play's money_modal.c layout).
//   - Top: per-entity net cards ("Team A: +$25" / player rows).
//   - Left: Breakdown (labelled line items).
//   - Right: Settle (reduced "X → Y  $N" transactions).
// `settlement` is the object returned by src/settlement.js builders.
export default function MoneyModal({ settlement, gameName, onClose, accent = '#4CAF50' }) {
  if (!settlement) return null;
  const { entities = [], lines = [], txs = [] } = settlement;

  const fmtSigned = (amt) => {
    if (amt > 0.005) return `+$${amt.toFixed(2)}`;
    if (amt < -0.005) return `-$${Math.abs(amt).toFixed(2)}`;
    return '$0.00';
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box',
      }}
    >
      <div style={{
        background: '#1e1e1e', color: '#e0e0e0', borderRadius: '14px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto', border: `2px solid ${accent}`, boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>💰 Money</div>
          <div style={{ fontSize: '13px', color: '#888' }}>{gameName}</div>
        </div>

        {/* Per-entity net cards */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {entities.map((e) => {
            const col = e.net > 0.005 ? '#4CAF50' : e.net < -0.005 ? '#EF5350' : '#888';
            return (
              <div key={String(e.idx)} style={{ flex: 1, minWidth: '90px', background: '#252525', border: `1px solid ${col}`, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{e.name}</div>
                <div style={{ fontSize: '22px', fontWeight: '900', color: col }}>{fmtSigned(e.net)}</div>
              </div>
            );
          })}
        </div>

        {/* Breakdown */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Breakdown</div>
          {lines.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px' }}>(no lines)</div>
          ) : (
            lines.map((ln, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2a2a', fontSize: '13px' }}>
                <span style={{ flex: 2, color: '#ccc' }}>{ln.label}</span>
                <span style={{ flex: 1, textAlign: 'center', color: ln.winnerName ? '#4CAF50' : '#888' }}>{ln.winnerName || (ln.signed ? '' : 'push')}</span>
                <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: ln.signed ? (ln.amount > 0.005 ? '#4CAF50' : ln.amount < -0.005 ? '#EF5350' : '#888') : '#e0e0e0' }}>
                  {ln.signed ? fmtSigned(ln.amount) : (ln.winnerName || ln.amount > 0 ? `$${ln.amount.toFixed(2)}` : '-')}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Settle (reduced transactions) */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Settle Up</div>
          {txs.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px' }}>(nothing to settle)</div>
          ) : (
            txs.map((tx, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', marginBottom: '6px', background: '#252525', borderRadius: '8px', fontSize: '14px' }}>
                <span><strong style={{ color: '#EF5350' }}>{tx.fromName}</strong> <span style={{ color: '#666' }}>→</span> <strong style={{ color: '#4CAF50' }}>{tx.toName}</strong></span>
                <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>${tx.amount.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <button onClick={onClose} style={{ width: '100%', padding: '14px', background: accent, color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}
