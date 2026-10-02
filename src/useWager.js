import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { EMPTY_WAGER } from './settlement';
import { outbox, queueMatchSave, pendingMatchValue } from './lib/saves';

// Loads/persists the per-match wager (matches.wager JSONB) and provides a save fn.
// Any Grid can drop this in: const { wager, saveWager } = useWager(matchId);
// Saves go through the outbox (lib/saves.js), which resends until confirmed.
export function useWager(matchId) {
  const [wager, setWager] = useState(EMPTY_WAGER);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('matches').select('wager').eq('id', matchId).single();
      if (cancelled) return;
      // A wager not sent yet is newer than whatever the database holds.
      const saved = pendingMatchValue(outbox.pending(), matchId, 'wager') ?? data?.wager;
      if (saved) setWager({ ...EMPTY_WAGER, ...saved });
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const saveWager = useCallback(async (next) => {
    setWager(next);
    if (matchId) queueMatchSave(matchId, 'wager', next);
  }, [matchId]);

  return { wager, saveWager };
}
