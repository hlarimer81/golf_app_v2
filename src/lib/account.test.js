import { describe, it, expect } from 'vitest';
import { claimableNames, heldByAnother } from './account';

describe('claimableNames', () => {
  it('lists the same people as the player directory, alphabetically', () => {
    const entries = [
      { canonical_name: 'Pat Par', handicap_index: 12.4, rounds_available: 20 },
      { canonical_name: 'Bo Birdie', handicap_index: null, rounds_available: 2 },
      // No index and no combined rounds: a scramble team or placeholder, not a person.
      { canonical_name: 'Arick Lance Scramble', handicap_index: null, rounds_available: 0 },
    ];
    expect(claimableNames(entries)).toEqual(['Bo Birdie', 'Pat Par']);
  });
});

describe('heldByAnother', () => {
  const me = 'account-me';
  const other = 'account-other';

  it('is true only for a confirmed claim by a different account', () => {
    const claims = [{ account_id: other, canonical_name: 'Pat Par', status: 'confirmed' }];
    expect(heldByAnother(claims, 'Pat Par', me)).toBe(true);
    expect(heldByAnother(claims, 'Bo Birdie', me)).toBe(false);
  });

  it('ignores a pending claim, which holds nothing yet', () => {
    const claims = [{ account_id: other, canonical_name: 'Pat Par', status: 'pending' }];
    expect(heldByAnother(claims, 'Pat Par', me)).toBe(false);
  });

  it('ignores your own claim', () => {
    const claims = [{ account_id: me, canonical_name: 'Pat Par', status: 'confirmed' }];
    expect(heldByAnother(claims, 'Pat Par', me)).toBe(false);
  });
});
