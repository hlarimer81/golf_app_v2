import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { outbox, queueMatchSave, pendingMatchValue } from './lib/saves';

// Persists manual Nassau presses in matches.presses (int[] of 0-based "after-hole"
// indices). Saves go through the outbox (lib/saves.js), which resends until confirmed.
export function usePresses(matchId) {
  const [presses, setPresses] = useState([]);
  // Mirror of the latest value, so the next one is computed outside a setState updater: queueing
  // a save is a side effect, and React runs updaters during render.
  const ref = useRef(presses);

  const show = useCallback((next) => {
    ref.current = next;
    setPresses(next);
  }, []);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('matches').select('presses').eq('id', matchId).single();
      if (cancelled) return;
      // A press not sent yet is newer than whatever the database holds.
      const unsent = pendingMatchValue(outbox.pending(), matchId, 'presses');
      if (unsent !== undefined) show(unsent);
      else if (Array.isArray(data?.presses)) show(data.presses);
    })();
    return () => { cancelled = true; };
  }, [matchId, show]);

  const apply = useCallback((next) => {
    show(next);
    if (matchId) queueMatchSave(matchId, 'presses', next);
  }, [matchId, show]);

  const addPress = useCallback(async (afterHoleIdx) => {
    if (ref.current.includes(afterHoleIdx)) return;
    apply([...ref.current, afterHoleIdx].sort((a, b) => a - b));
  }, [apply]);

  const removePress = useCallback(async (afterHoleIdx) => {
    apply(ref.current.filter((h) => h !== afterHoleIdx));
  }, [apply]);

  return { presses, addPress, removePress };
}
