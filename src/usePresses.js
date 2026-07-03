import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Persists manual Nassau presses in matches.presses (int[] of 0-based "after-hole"
// indices). Falls back to in-memory only if the column doesn't exist yet.
export function usePresses(matchId) {
  const [presses, setPresses] = useState([]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('matches').select('presses').eq('id', matchId).single();
      if (!cancelled && Array.isArray(data?.presses)) setPresses(data.presses);
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const addPress = useCallback(async (afterHoleIdx) => {
    setPresses((prev) => {
      if (prev.includes(afterHoleIdx)) return prev;
      const next = [...prev, afterHoleIdx].sort((a, b) => a - b);
      if (matchId) supabase.from('matches').update({ presses: next }).eq('id', matchId).then(() => {});
      return next;
    });
  }, [matchId]);

  const removePress = useCallback(async (afterHoleIdx) => {
    setPresses((prev) => {
      const next = prev.filter((h) => h !== afterHoleIdx);
      if (matchId) supabase.from('matches').update({ presses: next }).eq('id', matchId).then(() => {});
      return next;
    });
  }, [matchId]);

  return { presses, addPress, removePress };
}
