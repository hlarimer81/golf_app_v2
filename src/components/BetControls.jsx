import React from 'react';
import WagerConfig from '../WagerConfig';
import MoneyModal from '../MoneyModal';

// The 💵 Wager and 💰 Money buttons for a points game played for money, and the two screens they
// open. `bet` comes from useBet (src/useBet.js). Render it wherever the buttons belong (scorecard
// header, summary): the screens are fixed position, so they open from wherever the buttons are.
export default function BetControls({ bet, settlement, gameType, gameName, accent }) {
  const { wager, saveWager, hasStake, showWager, setShowWager, showMoney, setShowMoney } = bet;
  const pill = { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', cursor: 'pointer' };
  return (
    <>
      <button onClick={() => setShowWager(true)}
        style={{ ...pill, border: `1px solid ${accent}`, background: 'transparent', color: '#ddd' }}>
        💵 {hasStake ? `$${wager.per_point.toFixed(2)}/pt` : 'Wager'}
      </button>
      {hasStake && (
        <button onClick={() => setShowMoney(true)}
          style={{ ...pill, border: 'none', background: accent, color: '#fff' }}>
          💰 Money
        </button>
      )}
      {showWager && (
        <WagerConfig gameType={gameType} wager={wager} accent={accent}
          onClose={() => setShowWager(false)}
          onSave={(w) => { saveWager(w); setShowWager(false); }} />
      )}
      {showMoney && (
        <MoneyModal settlement={settlement} gameName={gameName} accent={accent}
          onClose={() => setShowMoney(false)} />
      )}
    </>
  );
}
