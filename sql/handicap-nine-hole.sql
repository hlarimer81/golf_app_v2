-- =============================================================================================
-- 9-HOLE ROUNDS
--
-- WHS does not score a nine on its own: two 9-hole Score Differentials combine into one 18-hole
-- differential, and an unpaired nine simply waits for a partner. That is implemented here by
-- pairing AT READ TIME in golf_handicap_index() rather than by writing synthetic combined rows.
-- Synthetic rows would have no match_id, could not be re-derived if a nine were later excluded,
-- and would need re-pairing on every correction. Pairing on read is a handful of rows and always
-- reflects the current data.
--
-- WHAT THIS IS WORTH TODAY: almost nothing. Of 21 players with a qualifying nine, only THREE have
-- two or more, so pairing produces roughly three differentials. The value is forward-looking - from
-- here, nines accumulate and pair themselves instead of being silently discarded. Backfilling the
-- existing 29 is a side effect, not the reason.
--
-- THE TRAP THIS EXISTS TO AVOID: 9-hole matches in this database store scores on holes 10-18, not
-- 1-9. Summing the whole 18-element course_pars array - which is what the original golf_bank_round
-- did - gives par 72 for a nine and a differential roughly 36 strokes wrong. Par is therefore
-- derived from the holes the player ACTUALLY SCORED, which is correct for 1-9, for 10-18, and for
-- any shotgun range, without anything having to know which convention was used.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- Adjusted gross now also returns the par of the holes actually played.
--
-- DROP first: CREATE OR REPLACE cannot change a function's OUT parameters, and this adds one.
-- Dropping is safe here because plpgsql resolves callers at runtime, so golf_bank_round() is not
-- dropped with it - it is simply recreated below in the same transaction.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS golf_adjusted_gross(uuid, uuid);

CREATE OR REPLACE FUNCTION golf_adjusted_gross(p_match_id uuid, p_player_id uuid)
RETURNS TABLE (adjusted int, raw int, holes_scored int, par_played int)
LANGUAGE sql STABLE AS $$
    WITH m AS (SELECT course_pars, hole_indices FROM matches WHERE id = p_match_id),
         h AS (SELECT handicap FROM players WHERE id = p_player_id),
         capped AS (
            SELECT s.strokes,
                   m.course_pars[s.hole_number] AS hole_par,
                   LEAST(s.strokes,
                         coalesce(
                           CASE WHEN (SELECT handicap FROM h) IS NULL
                                THEN m.course_pars[s.hole_number] + 5
                                ELSE m.course_pars[s.hole_number] + 2
                                     + golf_strokes_on_hole((SELECT handicap FROM h),
                                                            m.hole_indices[s.hole_number])
                           END, s.strokes)) AS capped_strokes
              FROM scores s CROSS JOIN m
             WHERE s.match_id = p_match_id AND s.player_id = p_player_id AND s.strokes > 0)
    SELECT sum(capped_strokes)::int, sum(strokes)::int, count(*)::int, sum(hole_par)::int
      FROM capped;
$$;


-- ---------------------------------------------------------------------------------------------
-- Banking now accepts 9-hole rounds, and takes par from the holes played.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_bank_round(p_match_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    banked   int := 0;
    inserted int;
    m        record;
    pl       record;
    ag       record;
    v_rating numeric;
    v_slope  int;
    required int;
BEGIN
    SELECT id, holes, course_name, tee_box_id, created_at INTO m
      FROM matches WHERE id = p_match_id;
    IF NOT FOUND OR m.holes NOT IN (9, 18) THEN
        RETURN 0;
    END IF;
    required := m.holes;

    SELECT t.rating, t.slope INTO v_rating, v_slope
      FROM tee_boxes t WHERE t.id = m.tee_box_id;

    FOR pl IN SELECT id, player_name FROM players WHERE match_id = p_match_id LOOP
        SELECT * INTO ag FROM golf_adjusted_gross(p_match_id, pl.id);

        -- A partial round is not a round. The player must have completed every hole of it.
        CONTINUE WHEN ag.holes_scored IS NULL OR ag.holes_scored < required
                   OR ag.par_played IS NULL OR ag.par_played = 0;

        INSERT INTO round_differential (
            match_id, player_name, canonical_name, played_on, course_name, holes,
            adjusted_gross, gross, course_rating, slope, par_total, differential, method,
            excluded, exclusion_reason)
        VALUES (
            p_match_id, pl.player_name, golf_canonical_name(pl.player_name),
            m.created_at::date, m.course_name, m.holes,
            ag.adjusted, ag.raw, v_rating, v_slope, ag.par_played,
            golf_differential(ag.adjusted, v_rating, v_slope, ag.par_played),
            CASE WHEN v_rating IS NOT NULL AND v_slope IS NOT NULL THEN 'whs' ELSE 'estimated' END,
            (EXISTS (SELECT 1 FROM handicap_excluded_name e
                      WHERE lower(e.name) = lower(pl.player_name))
             OR golf_differential(ag.adjusted, v_rating, v_slope, ag.par_played)
                < golf_min_plausible_differential()),
            CASE
              WHEN EXISTS (SELECT 1 FROM handicap_excluded_name e
                            WHERE lower(e.name) = lower(pl.player_name))
                THEN (SELECT e.reason FROM handicap_excluded_name e
                       WHERE lower(e.name) = lower(pl.player_name))
              WHEN golf_differential(ag.adjusted, v_rating, v_slope, ag.par_played)
                   < golf_min_plausible_differential()
                THEN 'implausible differential - suspect par array or team score'
            END)
        ON CONFLICT (match_id, player_name) DO NOTHING;

        GET DIAGNOSTICS inserted = ROW_COUNT;
        banked := banked + inserted;
    END LOOP;

    RETURN banked;
END $$;


-- ---------------------------------------------------------------------------------------------
-- The index pairs nines chronologically before selecting the most recent 20.
--
-- A trailing unpaired nine is ignored, which is what WHS does - it is not a round yet. Two nines
-- combine by SUMMING their differentials: a differential is measured in strokes, so two halves add.
-- (Slope, being an index on a fixed scale, would average - but that is already inside each nine's
-- own differential, so nothing extra is needed here.)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_handicap_index(p_canonical text)
RETURNS TABLE (
    handicap_index   numeric,
    rounds_used      int,
    rounds_available int,
    estimated_count  int,
    method           text)
LANGUAGE sql STABLE AS $$
WITH nines AS (
    SELECT d.differential, d.played_on, d.method,
           row_number() OVER (ORDER BY d.played_on, d.id) AS rn
      FROM round_differential d
     WHERE d.canonical_name = p_canonical AND NOT d.excluded AND d.holes = 9),
paired AS (
    SELECT sum(differential) AS differential,
           max(played_on)    AS played_on,
           CASE WHEN bool_or(method = 'estimated') THEN 'estimated' ELSE 'whs' END AS method
      FROM nines GROUP BY (rn + 1) / 2 HAVING count(*) = 2),
combined AS (
    SELECT d.differential, d.played_on, d.method
      FROM round_differential d
     WHERE d.canonical_name = p_canonical AND NOT d.excluded AND d.holes = 18
    UNION ALL
    SELECT p.differential, p.played_on, p.method FROM paired p),
recent AS (SELECT * FROM combined ORDER BY played_on DESC LIMIT 20),
cnt AS (SELECT count(*)::int AS n,
               count(*) FILTER (WHERE method = 'estimated')::int AS est FROM recent),
whs AS (SELECT t.take, t.adj FROM (VALUES
            (3,1,-2.0),(4,1,-1.0),(5,1,0.0),(6,2,-1.0),(7,2,0.0),(8,2,0.0),
            (9,3,0.0),(10,3,0.0),(11,3,0.0),(12,4,0.0),(13,4,0.0),(14,4,0.0),
            (15,5,0.0),(16,5,0.0),(17,6,0.0),(18,6,0.0),(19,7,0.0),(20,8,0.0)
        ) AS t(rounds, take, adj), cnt WHERE t.rounds = cnt.n),
lowest AS (SELECT differential FROM recent ORDER BY differential ASC
            LIMIT (SELECT take FROM whs))
SELECT
    CASE WHEN (SELECT n FROM cnt) < 3 THEN NULL
         ELSE round((SELECT avg(differential) FROM lowest) + (SELECT adj FROM whs), 1) END,
    CASE WHEN (SELECT n FROM cnt) < 3 THEN 0 ELSE (SELECT take FROM whs) END,
    (SELECT n FROM cnt),
    CASE WHEN (SELECT n FROM cnt) < 3 THEN 0 ELSE (SELECT est FROM cnt) END,
    CASE WHEN (SELECT n FROM cnt) < 3 THEN 'insufficient'
         WHEN (SELECT est FROM cnt) = 0 THEN 'whs' ELSE 'mixed' END;
$$;


-- ---------------------------------------------------------------------------------------------
-- The sweep now covers nines too.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_sweep_unbanked()
RETURNS TABLE (matches_processed int, differentials_banked int)
LANGUAGE plpgsql AS $$
DECLARE r record; total int := 0; touched int := 0; got int;
BEGIN
    FOR r IN
        SELECT m.id FROM matches m
         WHERE m.holes IN (9, 18)
           AND EXISTS (SELECT 1 FROM scores s WHERE s.match_id = m.id)
    LOOP
        got := golf_bank_round(r.id);
        IF got > 0 THEN touched := touched + 1; total := total + got; END IF;
    END LOOP;
    RETURN QUERY SELECT touched, total;
END $$;

-- Re-assert privileges: CREATE OR REPLACE resets nothing, but the definer flag and search_path
-- must be re-applied because they are properties of the function body being replaced.
ALTER FUNCTION golf_bank_round(uuid) SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION golf_sweep_unbanked() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION golf_bank_round(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION golf_sweep_unbanked() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION golf_bank_round(uuid) TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION golf_sweep_unbanked() TO service_role;
GRANT  EXECUTE ON FUNCTION golf_handicap_index(text) TO anon, authenticated, service_role;
