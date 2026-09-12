import { describe, it, expect } from 'vitest';
import { roundCounts, partnerCounts, rankRoster, rankReason } from './partners';

// Three rounds:
//   m1: Harold, Ryan, Nick
//   m2: Harold, Ryan
//   m3: Harold, Barry
// So Harold plays most, Ryan is Harold's most frequent partner, and Karl has never played.
const rows = [
  { canonical_name: 'H Larimer', match_id: 'm1' },
  { canonical_name: 'Ryan B', match_id: 'm1' },
  { canonical_name: 'Nick G', match_id: 'm1' },
  { canonical_name: 'H Larimer', match_id: 'm2' },
  { canonical_name: 'Ryan B', match_id: 'm2' },
  { canonical_name: 'H Larimer', match_id: 'm3' },
  { canonical_name: 'Barry C', match_id: 'm3' },
];

const roster = [
  { id: '1', player_name: 'H Larimer', handicap: 22 },
  { id: '2', player_name: 'Ryan B', handicap: 9 },
  { id: '3', player_name: 'Nick G', handicap: 7 },
  { id: '4', player_name: 'Barry C', handicap: 18 },
  { id: '5', player_name: 'Karl M', handicap: 13 },
];

const names = (list) => list.map((p) => p.name);

describe('roundCounts', () => {
  it('counts the rounds each player appears in', () => {
    const counts = roundCounts(rows);
    expect(counts.get('H Larimer')).toBe(3);
    expect(counts.get('Ryan B')).toBe(2);
    expect(counts.get('Barry C')).toBe(1);
  });

  it('counts a round once even if a player somehow has two rows for it', () => {
    const counts = roundCounts([...rows, { canonical_name: 'Barry C', match_id: 'm3' }]);
    expect(counts.get('Barry C')).toBe(1);
  });

  it('survives empty and malformed input', () => {
    expect(roundCounts([]).size).toBe(0);
    expect(roundCounts(undefined).size).toBe(0);
    expect(roundCounts([{ canonical_name: 'X' }, { match_id: 'm9' }, null]).size).toBe(0);
  });
});

describe('partnerCounts', () => {
  it('records who played with whom, in both directions', () => {
    const pairs = partnerCounts(rows);
    expect(pairs.get('H Larimer').get('Ryan B')).toBe(2);
    expect(pairs.get('Ryan B').get('H Larimer')).toBe(2);
  });

  it('does not pair a player with themselves', () => {
    expect(partnerCounts(rows).get('H Larimer').get('H Larimer')).toBeUndefined();
  });

  it('gives no partners for a solo round', () => {
    const pairs = partnerCounts([{ canonical_name: 'Solo', match_id: 'm9' }]);
    expect(pairs.get('Solo')).toBeUndefined();
  });
});

describe('rankRoster', () => {
  it('leads with the regulars when nobody has been chosen yet', () => {
    expect(names(rankRoster({ roster, rows }))).toEqual([
      'H Larimer', // 3 rounds
      'Ryan B',    // 2
      'Barry C',   // 1, alphabetically before Nick
      'Nick G',    // 1
      'Karl M',    // none
    ]);
  });

  it('re-ranks by who actually plays with the people already added', () => {
    // With Harold in the round, his regular partners should rise above a stranger.
    const ranked = rankRoster({ roster, rows, chosen: ['H Larimer'] });
    expect(names(ranked)[0]).toBe('Ryan B'); // 2 rounds with Harold
    expect(ranked[0].together).toBe(2);
    expect(names(ranked)).not.toContain('H Larimer'); // already taken
  });

  it('adds up shared rounds across everyone already chosen', () => {
    const ranked = rankRoster({ roster, rows, chosen: ['H Larimer', 'Ryan B'] });
    const nick = ranked.find((p) => p.name === 'Nick G');
    expect(nick.together).toBe(2); // one round with each of them
  });

  it('keeps a player with no rounds in the list, at the bottom', () => {
    const ranked = rankRoster({ roster, rows });
    expect(names(ranked).at(-1)).toBe('Karl M');
    expect(ranked.at(-1).rounds).toBe(0);
  });

  it('never offers someone already in the round', () => {
    const ranked = rankRoster({ roster, rows, chosen: ['Ryan B', 'Nick G'] });
    expect(names(ranked)).toEqual(expect.not.arrayContaining(['Ryan B', 'Nick G']));
  });

  it('filters on search, matching anywhere in the name', () => {
    expect(names(rankRoster({ roster, rows, search: 'ar' }))).toEqual(['H Larimer', 'Barry C', 'Karl M']);
  });

  it('puts names that start with the query first', () => {
    // "Karl" starts with the query; "H Larimer" merely contains it.
    expect(names(rankRoster({ roster, rows, search: 'kar' }))).toEqual(['Karl M']);
    expect(names(rankRoster({ roster, rows, search: 'b' }))[0]).toBe('Barry C');
  });

  it('ignores case and surrounding spaces in the query', () => {
    expect(names(rankRoster({ roster, rows, search: '  RYAN ' }))).toEqual(['Ryan B']);
  });

  it('returns nothing when the search matches nobody', () => {
    expect(rankRoster({ roster, rows, search: 'zzz' })).toEqual([]);
  });

  it('still lists the roster when there is no round history at all', () => {
    expect(names(rankRoster({ roster, rows: [] }))).toEqual([
      'Barry C', 'H Larimer', 'Karl M', 'Nick G', 'Ryan B',
    ]);
  });

  it('survives being called with nothing', () => {
    expect(rankRoster()).toEqual([]);
  });
});

describe('rankReason', () => {
  it('explains a suggestion by shared rounds once someone is chosen', () => {
    expect(rankReason({ rounds: 9, together: 2 }, 1)).toBe('2 rounds together');
    expect(rankReason({ rounds: 9, together: 1 }, 1)).toBe('1 round together');
  });

  it('falls back to total rounds when nobody is chosen', () => {
    expect(rankReason({ rounds: 3, together: 0 }, 0)).toBe('3 rounds');
    expect(rankReason({ rounds: 1, together: 0 }, 0)).toBe('1 round');
  });

  it('says plainly when a player has no history', () => {
    expect(rankReason({ rounds: 0, together: 0 }, 0)).toBe('no rounds yet');
  });
});
