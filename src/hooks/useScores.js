import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// =====================================================================================
// Loads a match's scores, keeps them in sync via Supabase realtime, and exposes an
// optimistic saveScore(). Replaces the fetch/realtime/save block that was copy-pasted
// into every *Grid.jsx.
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
      setScores(map);
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
      const val = strokes === '' ? null : parseInt(strokes, 10);

      // Optimistic local update.
      setScores((prev) => ({
        ...prev,
        [playerId]: { ...(prev[playerId] || {}), [holeNum]: val },
      }));

      if (val === null) {
        await supabase
          .from('scores')
          .delete()
          .eq('match_id', matchId)
          .eq('player_id', playerId)
          .eq('hole_number', holeNum);
        return;
      }

      await supabase.from('scores').upsert(
        { match_id: matchId, player_id: playerId, hole_number: holeNum, strokes: val },
        { onConflict: 'match_id,player_id,hole_number' }
      );
    },
    [matchId]
  );

  return { scores, saveScore };
}
