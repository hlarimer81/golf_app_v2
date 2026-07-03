import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { EMPTY_WAGER } from './settlement';

// Loads/persists the per-match wager (matches.wager JSONB) and provides a save fn.
// Any Grid can drop this in: const { wager, saveWager } = useWager(matchId);
export function useWager(matchId) {
  const [wager, setWager] = useState(EMPTY_WAGER);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('matches').select('wager').eq('id', matchId).single();
      if (!cancelled && data?.wager) setWager({ ...EMPTY_WAGER, ...data.wager });
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const saveWager = useCallback(async (next) => {
    setWager(next);
    if (!matchId) return;
    await supabase.from('matches').update({ wager: next }).eq('id', matchId);
  }, [matchId]);

  return { wager, saveWager };
}
