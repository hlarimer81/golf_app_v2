import { describe, it, expect } from 'vitest';
import {
  decay,
  monthYear,
  roundSummary,
  partnerSummary,
  rankRoster,
  rankReason,
  HALF_LIFE_DAYS,
} from './partners';

// A fixed clock. Every ranking here depends on how old a round is, so a real `new Date()` would
// make these tests drift with the calendar and eventually fail on their own.
const NOW = new Date('2026-09-12T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

const RECENT = daysAgo(30);
const OLD = daysAgo(365 * 3);

// Harold plays with Ryan recently and often. He played with Nick a lot, but years ago — the case
// recency decay exists to fix. Barry is a single recent round. Karl has never played.
const rows = [
  { canonical_name: 'H Larimer', match_id: 'r1', played_on: RECENT },
  { canonical_name: 'Ryan B', match_id: 'r1', played_on: RECENT },
  { canonical_name: 'H Larimer', match_id: 'r2', played_on: RECENT },
  { canonical_name: 'Ryan B', match_id: 'r2', played_on: RECENT },

  { canonical_name: 'H Larimer', match_id: 'o1', played_on: OLD },
  { canonical_name: 'Nick G', match_id: 'o1', played_on: OLD },
  { canonical_name: 'H Larimer', match_id: 'o2', played_on: OLD },
  { canonical_name: 'Nick G', match_id: 'o2', played_on: OLD },
  { canonical_name: 'H Larimer', match_id: 'o3', played_on: OLD },
  { canonical_name: 'Nick G', match_id: 'o3', played_on: OLD },
  { canonical_name: 'H Larimer', match_id: 'o4', played_on: OLD },
  { canonical_name: 'Nick G', match_id: 'o4', played_on: OLD },

  { canonical_name: 'H Larimer', match_id: 'b1', played_on: RECENT },
  { canonical_name: 'Barry C', match_id: 'b1', played_on: RECENT },
];

const roster = [
  { id: '1', player_name: 'H Larimer', handicap: 22 },
  { id: '2', player_name: 'Ryan B', handicap: 9 },
  { id: '3', player_name: 'Nick G', handicap: 7 },
  { id: '4', player_name: 'Barry C', handicap: 18 },
  { id: '5', player_name: 'Karl M', handicap: 13 },
];

const names = (list) => list.map((p) => p.name);
const rank = (opts) => rankRoster({ roster, rows, now: NOW, ...opts });

describe('decay', () => {
  it('counts a round played today at very nearly full weight', () => {
    // played_on is a date, not a timestamp, so "today" is midnight — up to a day behind the clock.
    // That costs a thousandth of a stroke of weight, which is the correct amount to care: exactly
    // 1.0 would only be reachable by pretending the round happened at this instant.
    expect(decay(daysAgo(0), NOW)).toBeGreaterThan(0.999);
    expect(decay(daysAgo(0), NOW)).toBeLessThanOrEqual(1);
  });

  it('halves a round at one half-life and quarters it at two', () => {
    expect(decay(daysAgo(HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5, 3);
    expect(decay(daysAgo(HALF_LIFE_DAYS * 2), NOW)).toBeCloseTo(0.25, 3);
  });

  it('never reaches zero, so old history fades rather than vanishing', () => {
    expect(decay(daysAgo(HALF_LIFE_DAYS * 10), NOW)).toBeGreaterThan(0);
  });

  it('counts an undated or unparseable round at full weight', () => {
    // A round that happened is evidence, whatever the metadata says. Dropping it would make a
    // round disappear because of a missing column.
    expect(decay(null, NOW)).toBe(1);
    expect(decay(undefined, NOW)).toBe(1);
    expect(decay('not a date', NOW)).toBe(1);
  });

  it('does not inflate a round dated in the future', () => {
    expect(decay(daysAgo(-100), NOW)).toBe(1);
  });
});

describe('monthYear', () => {
  it('reads the date string directly, without a timezone shift', () => {
    expect(monthYear('2026-08-02')).toBe('Aug 2026');
    expect(monthYear('2026-01-31')).toBe('Jan 2026');
    expect(monthYear('2023-12-01')).toBe('Dec 2023');
  });

  it('returns nothing it cannot format', () => {
    expect(monthYear(null)).toBeNull();
    expect(monthYear('')).toBeNull();
    expect(monthYear('nonsense')).toBeNull();
  });
});

describe('roundSummary', () => {
  it('reports true counts alongside decayed weight and the last date', () => {
    const harold = roundSummary(rows, NOW).get('H Larimer');
    expect(harold.rounds).toBe(7);
    expect(harold.last).toBe(RECENT);
    // Three recent rounds at ~full weight plus four three-year-old ones at ~an eighth each.
    expect(harold.weight).toBeGreaterThan(3);
    expect(harold.weight).toBeLessThan(4);
  });

  it('weighs a recent round more heavily than an old one', () => {
    const summary = roundSummary(rows, NOW);
    expect(summary.get('Barry C').weight).toBeGreaterThan(summary.get('Nick G').weight / 4);
  });

  it('counts a round once even if a player has two rows for it', () => {
    const dupe = [...rows, { canonical_name: 'Barry C', match_id: 'b1', played_on: RECENT }];
    expect(roundSummary(dupe, NOW).get('Barry C').rounds).toBe(1);
  });

  it('survives empty and malformed input', () => {
    expect(roundSummary([], NOW).size).toBe(0);
    expect(roundSummary(undefined, NOW).size).toBe(0);
    expect(roundSummary([{ canonical_name: 'X' }, { match_id: 'm' }, null], NOW).size).toBe(0);
  });
});

describe('partnerSummary', () => {
  it('records shared rounds in both directions', () => {
    const pairs = partnerSummary(rows, NOW);
    expect(pairs.get('H Larimer').get('Ryan B').rounds).toBe(2);
    expect(pairs.get('Ryan B').get('H Larimer').rounds).toBe(2);
  });

  it('respects the injected clock rather than the real one', () => {
    // The same rows, read from far in the future, weigh almost nothing.
    const later = new Date('2046-09-12T12:00:00Z');
    const soon = partnerSummary(rows, NOW).get('H Larimer').get('Ryan B').weight;
    const distant = partnerSummary(rows, later).get('H Larimer').get('Ryan B').weight;
    expect(distant).toBeLessThan(soon / 100);
  });

  it('does not pair a player with themselves', () => {
    expect(partnerSummary(rows, NOW).get('H Larimer').get('H Larimer')).toBeUndefined();
  });

  it('gives no partners for a solo round', () => {
    expect(partnerSummary([{ canonical_name: 'Solo', match_id: 'm9' }], NOW).get('Solo')).toBeUndefined();
  });
});

describe('rankRoster', () => {
  it('leads with whoever has been playing most lately', () => {
    // Harold has the most rounds outright and the most recent ones.
    expect(names(rank({}))[0]).toBe('H Larimer');
  });

  it('ranks a recent partner above an older, more frequent one', () => {
    // This is the whole point of the decay: Nick shares four rounds with Harold and Ryan only two,
    // but Nick's were three years ago.
    const ranked = rank({ chosen: ['H Larimer'] });
    expect(names(ranked)[0]).toBe('Ryan B');
    expect(ranked.find((p) => p.name === 'Ryan B').together).toBe(2);
    expect(ranked.find((p) => p.name === 'Nick G').together).toBe(4);
    expect(names(ranked).indexOf('Ryan B')).toBeLessThan(names(ranked).indexOf('Nick G'));
  });

  it('would have ranked the other way without decay', () => {
    // Sanity check on the fixture: read at the time those old rounds were played, Nick leads.
    const backThen = new Date(`${OLD}T12:00:00Z`);
    const ranked = rankRoster({ roster, rows, chosen: ['H Larimer'], now: backThen });
    expect(names(ranked)[0]).toBe('Nick G');
  });

  it('reports the last round shared with the people already chosen', () => {
    const ranked = rank({ chosen: ['H Larimer'] });
    expect(ranked.find((p) => p.name === 'Ryan B').lastTogether).toBe(RECENT);
    expect(ranked.find((p) => p.name === 'Nick G').lastTogether).toBe(OLD);
  });

  it('keeps a player with no rounds in the list, at the bottom', () => {
    const ranked = rank({});
    expect(names(ranked).at(-1)).toBe('Karl M');
    expect(ranked.at(-1).rounds).toBe(0);
  });

  it('never offers someone already in the round', () => {
    const ranked = rank({ chosen: ['Ryan B', 'Nick G'] });
    expect(names(ranked)).toEqual(expect.not.arrayContaining(['Ryan B', 'Nick G']));
  });

  it('filters on search, matching anywhere in the name', () => {
    expect(names(rank({ search: 'ar' }))).toEqual(['H Larimer', 'Barry C', 'Karl M']);
  });

  it('puts names that start with the query first', () => {
    expect(names(rank({ search: 'kar' }))).toEqual(['Karl M']);
    expect(names(rank({ search: 'b' }))[0]).toBe('Barry C');
  });

  it('ignores case and surrounding spaces in the query', () => {
    expect(names(rank({ search: '  RYAN ' }))).toEqual(['Ryan B']);
  });

  it('returns nothing when the search matches nobody', () => {
    expect(rank({ search: 'zzz' })).toEqual([]);
  });

  it('still lists the roster when there is no round history at all', () => {
    expect(names(rankRoster({ roster, rows: [], now: NOW }))).toEqual([
      'Barry C', 'H Larimer', 'Karl M', 'Nick G', 'Ryan B',
    ]);
  });

  it('survives being called with nothing', () => {
    expect(rankRoster()).toEqual([]);
  });
});

describe('rankReason', () => {
  it('explains a suggestion by shared rounds and when they last played', () => {
    expect(rankReason({ rounds: 9, together: 2, lastTogether: '2026-08-02' }, 1))
      .toBe('2 rounds together · last Aug 2026');
    expect(rankReason({ rounds: 9, together: 1, lastTogether: '2026-08-02' }, 1))
      .toBe('1 round together · last Aug 2026');
  });

  it('falls back to total rounds when nobody is chosen', () => {
    expect(rankReason({ rounds: 3, together: 0, lastPlayed: '2026-07-04' }, 0))
      .toBe('3 rounds · last Jul 2026');
    expect(rankReason({ rounds: 1, together: 0, lastPlayed: '2026-07-04' }, 0))
      .toBe('1 round · last Jul 2026');
  });

  it('drops the date when there is not one', () => {
    expect(rankReason({ rounds: 3, together: 0, lastPlayed: null }, 0)).toBe('3 rounds');
  });

  it('says plainly when a player has no history', () => {
    expect(rankReason({ rounds: 0, together: 0 }, 0)).toBe('no rounds yet');
  });
});
