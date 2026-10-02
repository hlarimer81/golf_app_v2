import { describe, it, expect } from 'vitest';
import { courseHandicap, describeIndex, playingHandicaps } from './handicap';

describe('courseHandicap', () => {
  it('returns null for a player with no index, rather than treating them as scratch', () => {
    expect(courseHandicap(null)).toBeNull();
    expect(courseHandicap(undefined)).toBeNull();
  });

  it('returns the index itself when the course has no slope or rating', () => {
    // Neutral assumption: nothing says the course is harder or easier than standard.
    expect(courseHandicap(18)).toBe(18);
    expect(courseHandicap(18, {})).toBe(18);
  });

  it('scales by slope', () => {
    // 20 * (131/113) = 23.2 -> 23
    expect(courseHandicap(20, { slope: 131 })).toBe(23);
    // Slope 113 is standard, so it changes nothing.
    expect(courseHandicap(20, { slope: 113 })).toBe(20);
  });

  it('adds the rating-minus-par adjustment for a real WHS index', () => {
    // 10 * (113/113) + (72.8 - 72) = 10.8 -> 11
    expect(courseHandicap(10, { slope: 113, rating: 72.8, par: 72 })).toBe(11);
  });

  it('skips the rating adjustment when the index is already par-relative', () => {
    // REGRESSION: an index built from 'estimated' rounds is already relative to par, so applying
    // (rating - par) subtracts a second time. At Okoboji View (rating 67.2, par 71) that handed
    // every player about four strokes fewer than they play to.
    const okoboji = { slope: 113, rating: 67.2, par: 71 };
    expect(courseHandicap(20, okoboji)).toBe(16);                        // the wrong answer
    expect(courseHandicap(20, { ...okoboji, parRelative: true })).toBe(20); // the right one
  });

  it('still applies slope when par-relative, because difficulty is a ratio either way', () => {
    // 20 * (131/113) = 23.2 -> 23, with no rating adjustment.
    expect(courseHandicap(20, { slope: 131, rating: 67.2, par: 71, parRelative: true })).toBe(23);
  });

  it('rounds to a whole number of strokes', () => {
    expect(courseHandicap(12.4, { slope: 113 })).toBe(12);
    expect(courseHandicap(12.6, { slope: 113 })).toBe(13);
  });
});

describe('describeIndex', () => {
  it('says how far off a player is when they have too few rounds', () => {
    expect(describeIndex({ handicap_index: null, rounds_available: 2 })).toEqual({
      value: null,
      label: 'Not enough rounds (2 of 3)',
      estimated: false,
    });
  });

  it('handles a player with no record at all', () => {
    expect(describeIndex(undefined).label).toBe('Not enough rounds (0 of 3)');
  });

  it('labels a WHS index as such', () => {
    const d = describeIndex({ handicap_index: 9.1, estimated_count: 0, rounds_available: 20 });
    expect(d.value).toBe(9.1);
    expect(d.estimated).toBe(false);
    expect(d.label).toBe('9.1 (WHS, 20 rounds)');
  });

  it('flags an index that leans on rounds without a course rating', () => {
    // ~90% of this database's history has no rating, so this is the normal case. Presenting it as
    // a WHS index would be a lie.
    const d = describeIndex({ handicap_index: 22.6, estimated_count: 14, rounds_available: 20 });
    expect(d.estimated).toBe(true);
    expect(d.label).toBe('22.6 (estimated - 14 of 20 rounds lack course rating)');
  });
});

describe('playingHandicaps', () => {
  const group = [
    { id: 'a', player_name: 'Hazard', handicap: 21 },
    { id: 'b', player_name: 'Rough', handicap: 11 },
  ];
  const strokes = (players) => players.map(p => p.handicap);

  it('plays the handicap saved at setup as it is, with no second conversion', () => {
    // Issue #11: these came out as 60 and 49 on a nine-hole round, because the saved course
    // handicap was run through slope and (18-hole rating - 9-hole par) again.
    expect(strokes(playingHandicaps(group))).toEqual([21, 11]);
  });

  it('has no notion of holes, slope or rating - a nine-hole round uses the same numbers', () => {
    // Nine holes hold about half the stroke indexes, so strokesReceived() already gives about
    // half the strokes. See the comment on playingHandicaps().
    expect(strokes(playingHandicaps(group, { holesCount: 9, slope: 140, rating: 74 }))).toEqual([21, 11]);
  });

  it('gives nobody any strokes in a gross round', () => {
    expect(strokes(playingHandicaps(group, { useHandicaps: false }))).toEqual([0, 0]);
  });

  it('cuts each handicap to the allowance, rounding to a whole stroke', () => {
    expect(strokes(playingHandicaps(group, { allowancePct: 90 }))).toEqual([19, 10]);
    expect(strokes(playingHandicaps(group, { allowancePct: 50 }))).toEqual([11, 6]);
  });

  it('plays off the low handicap after the allowance, not before', () => {
    expect(strokes(playingHandicaps(group, { playOffLow: true }))).toEqual([10, 0]);
    // 90% of 21 and 11 is 19 and 10, so the gap is 9 - not 90% of the 10-stroke gap rounded.
    expect(strokes(playingHandicaps(group, { allowancePct: 90, playOffLow: true }))).toEqual([9, 0]);
  });

  it('treats a missing, zero or negative handicap as scratch', () => {
    const odd = [{ id: 'a', handicap: null }, { id: 'b', handicap: 0 }, { id: 'c', handicap: -2 }, { id: 'd', handicap: '14' }];
    expect(strokes(playingHandicaps(odd))).toEqual([0, 0, 0, 14]);
  });

  it('treats an unset allowance as 100%', () => {
    expect(strokes(playingHandicaps(group, { allowancePct: '' }))).toEqual([21, 11]);
  });

  it('keeps every other field on the player and does not change its input', () => {
    const out = playingHandicaps(group, { playOffLow: true });
    expect(out[0]).toMatchObject({ id: 'a', player_name: 'Hazard' });
    expect(group[0].handicap).toBe(21);
  });

  it('copes with an empty group', () => {
    expect(playingHandicaps([], { playOffLow: true })).toEqual([]);
  });
});
