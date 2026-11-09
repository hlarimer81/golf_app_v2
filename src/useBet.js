import { useState } from 'react';
import { useWager } from './useWager';
import { wagerHasStake } from './settlement';

// The bet for a points game ($ per point, saved to matches.wager) and whether its two screens are
// open. Pair with <BetControls> (src/components/BetControls.jsx):
//
//   const bet = useBet(matchId);
//   const settlement = settleSomething({ wager: bet.wager, ... });
//   <BetControls bet={bet} settlement={settlement} gameType="wolf" gameName="Wolf" accent="#607D8B" />
export function useBet(matchId) {
  const { wager, saveWager } = useWager(matchId);
  const [showWager, setShowWager] = useState(false);
  const [showMoney, setShowMoney] = useState(false);
  return { wager, saveWager, hasStake: wagerHasStake(wager), showWager, setShowWager, showMoney, setShowMoney };
}
