import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { outbox, queueMatchSave, pendingMatchValue } from './lib/saves';

// =====================================================================================
// Loads / persists a Wolf round's partner picks (matches.wolf JSONB) so they survive a refresh,
// reach any device that joins the round, and reach the Finish Round summary (issue #46). Same
// load + outbox save + realtime as useWolfVegasState.
//
//   const { decisions, setDecision } = useWolfState(matchId);
//   decisions[holeNum] = partnerPlayerId | 'lone'
// =====================================================================================
const EMPTY = { decisions: {} };

export function useWolfState(matchId) {
  const [state, setState] = useState(EMPTY);
  const ref = useRef(state);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('matches').select('wolf').eq('id', matchId).single();
      if (cancelled) return;
      // A state not sent yet is newer than whatever the database holds.
      const unsent = pendingMatchValue(outbox.pending(), matchId, 'wolf');
      const next = unsent !== undefined
        ? { ...EMPTY, ...unsent }
        : error ? EMPTY : { ...EMPTY, ...(data?.wolf || {}) };
      ref.current = next;
      setState(next);
    };

    load();

    const channel = supabase
      .channel(`wolf-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        load
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [matchId]);

  const setDecision = useCallback((holeNum, choice) => {
    const next = { ...ref.current, decisions: { ...ref.current.decisions, [holeNum]: choice } };
    ref.current = next;
    setState(next);
    if (matchId) queueMatchSave(matchId, 'wolf', next);
  }, [matchId]);

  return { decisions: state.decisions, setDecision };
}
