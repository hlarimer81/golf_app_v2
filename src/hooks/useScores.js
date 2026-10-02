import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { outbox, queueScoreSave, overlayScores } from '../lib/saves';

// =====================================================================================
// Loads a match's scores, keeps them in sync via Supabase realtime, and exposes an
// optimistic saveScore(). Replaces the fetch/realtime/save block that was copy-pasted
// into every *Grid.jsx.
//
// Saves go through the outbox (lib/saves.js), which resends until the database confirms
// them. A score still waiting to be sent is laid over every fetch, so a refetch caused by
// another phone never wipes it off this one.
//
//   const { scores, saveScore } = useScores(matchId);
//   scores[playerId][holeNumber] -> strokes (number) | undefined
// =====================================================================================
export function useScores(matchId) {
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    const fetchScores = async () => {
      const { data } = await supabase.from('scores').select('*').eq('match_id', matchId);
      if (cancelled) return;
      const map = {};
      data?.forEach((s) => {
        (map[s.player_id] ??= {})[s.hole_number] = s.strokes;
      });
      setScores(overlayScores(map, outbox.pending(), matchId));
    };

    fetchScores();

    // Key the channel by matchId so concurrently-mounted grids never collide.
    const channel = supabase
      .channel(`scores-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `match_id=eq.${matchId}` },
        fetchScores
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const saveScore = useCallback(
    async (playerId, holeNum, strokes) => {
      const parsed = strokes === '' ? null : parseInt(strokes, 10);
      const val = Number.isNaN(parsed) ? null : parsed;

      // Optimistic local update.
      setScores((prev) => ({
        ...prev,
        [playerId]: { ...(prev[playerId] || {}), [holeNum]: val },
      }));

      if (matchId) queueScoreSave(matchId, playerId, holeNum, val);
    },
    [matchId]
  );

  return { scores, saveScore };
}
