import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// =====================================================================================
// Loads / persists a Wolf Vegas round's live state (matches.wolf_vegas JSONB) so wolf
// decisions, hammers, and the birdie option survive a refresh and sync to any device that
// joins the round. Mirrors useWager (load + save) with useScores-style realtime.
//
//   const { decisions, hammers, grossBirdies,
//           setDecision, adjustHammer, cycleHammer, toggleGrossBirdies } = useWolfVegasState(id);
//
// If the wolf_vegas column has not been added yet (see sql/add-wolf-vegas-state-column.sql),
// loads/saves fail softly and the round still works in-memory for the session.
// =====================================================================================
const EMPTY = { decisions: {}, hammers: {}, grossBirdies: false };

export function useWolfVegasState(matchId) {
  const [state, setState] = useState(EMPTY);
  // Mirror of the latest state so mutators compute the next value synchronously (no stale
  // closures, and no side effects inside a setState updater — which React double-invokes).
  const ref = useRef(state);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('matches').select('wolf_vegas').eq('id', matchId).single();
      if (cancelled) return;
      // On error (column missing / row not found) fall back to a clean slate rather than
      // leaving a previous match's state on screen.
      const next = error ? EMPTY : { ...EMPTY, ...(data?.wolf_vegas || {}) };
      ref.current = next;
      setState(next);
    };

    load();

    // Live-sync from other devices scoring the same round.
    const channel = supabase
      .channel(`wolf-vegas-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        load
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [matchId]);

  // Apply a computed next-state: update the mirror + React state, then persist once.
  const apply = useCallback((next) => {
    ref.current = next;
    setState(next);
    if (!matchId) return;
    supabase.from('matches').update({ wolf_vegas: next }).eq('id', matchId).then(({ error }) => {
      if (error) console.error('wolf_vegas save failed', error);
    });
  }, [matchId]);

  const setDecision = useCallback((holeNum, choice) => {
    apply({ ...ref.current, decisions: { ...ref.current.decisions, [holeNum]: choice } });
  }, [apply]);

  const adjustHammer = useCallback((holeNum, delta) => {
    const n = Math.max(0, Math.min(4, (ref.current.hammers[holeNum] || 0) + delta));
    apply({ ...ref.current, hammers: { ...ref.current.hammers, [holeNum]: n } });
  }, [apply]);

  const cycleHammer = useCallback((holeNum) => {
    const cur = ref.current.hammers[holeNum] || 0;
    apply({ ...ref.current, hammers: { ...ref.current.hammers, [holeNum]: cur >= 4 ? 0 : cur + 1 } });
  }, [apply]);

  const toggleGrossBirdies = useCallback(() => {
    apply({ ...ref.current, grossBirdies: !ref.current.grossBirdies });
  }, [apply]);

  return {
    decisions: state.decisions,
    hammers: state.hammers,
    grossBirdies: state.grossBirdies,
    setDecision,
    adjustHammer,
    cycleHammer,
    toggleGrossBirdies,
  };
}
