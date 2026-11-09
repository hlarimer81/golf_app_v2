import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { outbox, queueMatchSave, pendingMatchValue } from './lib/saves';

// =====================================================================================
// Loads / persists a regular Vegas round's options (matches.vegas JSONB) so a choice made on
// one phone survives a refresh and shows on every phone in the round. Mirrors useWolfVegasState.
//
//   const { grossBirdies, toggleGrossBirdies } = useVegasState(matchId);
//
// grossBirdies (default true): only a natural birdie flips the other side's number. Off, a net
// birdie (a stroke turning par into a birdie) flips it too.
// Saves go through the outbox (lib/saves.js), which resends until the database confirms them.
// =====================================================================================
const EMPTY = { grossBirdies: true };

export function useVegasState(matchId) {
  const [state, setState] = useState(EMPTY);
  // Mirror of the latest state, so a toggle computes the next value without a stale closure.
  const ref = useRef(state);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('matches').select('vegas').eq('id', matchId).single();
      if (cancelled) return;
      // A state not sent yet is newer than whatever the database holds. On an error, fall back to
      // the defaults rather than leaving a previous match's option on screen.
      const unsent = pendingMatchValue(outbox.pending(), matchId, 'vegas');
      const next = unsent !== undefined
        ? { ...EMPTY, ...unsent }
        : error ? EMPTY : { ...EMPTY, ...(data?.vegas || {}) };
      ref.current = next;
      setState(next);
    };

    load();

    // Live-sync from other phones scoring the same round.
    const channel = supabase
      .channel(`vegas-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        load
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [matchId]);

  const toggleGrossBirdies = useCallback(() => {
    const next = { ...ref.current, grossBirdies: !ref.current.grossBirdies };
    ref.current = next;
    setState(next);
    if (matchId) queueMatchSave(matchId, 'vegas', next);
  }, [matchId]);

  return { grossBirdies: state.grossBirdies, toggleGrossBirdies };
}
