import { describe, it, expect } from 'vitest';
import { sideNames } from './teams';

describe('sideNames', () => {
  it('names a side from its golfers\' initials', () => {
    expect(sideNames([['Hazard'], ['Rough']])).toEqual(['H', 'R']);
    expect(sideNames([['Pat Par'], ['Bo Birdie']])).toEqual(['PP', 'BB']);
    expect(sideNames([['Hazard', 'Mulligan'], ['Rough', 'Rake']])).toEqual(['H-M', 'R-R']);
    expect(sideNames([['Mary Jo Van Dyke']])).toEqual(['MD']);
  });

  it('takes more letters when two sides would share a name, and leaves the others alone', () => {
    // Rough and Rake each playing for themselves were both "R", and both saved on the first "R".
    expect(sideNames([['Hazard'], ['Rough'], ['Rake'], ['Mulligan']])).toEqual(['H', 'Ro', 'Ra', 'M']);
  });

  it('takes as many letters as it needs', () => {
    expect(sideNames([['Ryan'], ['Ryder']])).toEqual(['Rya', 'Ryd']);
    expect(sideNames([['Rob'], ['Robert']])).toEqual(['Rob', 'Robe']);
  });

  it('keeps the last initial when lengthening a full name', () => {
    expect(sideNames([['Pat Par'], ['Pete Putt']])).toEqual(['PaP', 'PeP']);
  });

  it('lengthens every golfer on sides that clash', () => {
    expect(sideNames([['Hazard', 'Rough'], ['Harold', 'Ryan']])).toEqual(['Ha-Ro', 'Ha-Ry']);
  });

  it('numbers sides that no amount of letters can tell apart', () => {
    expect(sideNames([['Ryan'], ['Ryan'], ['Bo']])).toEqual(['Ryan1', 'Ryan2', 'B']);
    expect(sideNames([['ryan'], ['RYAN']])).toEqual(['Ryan1', 'Ryan2']);
  });

  it('always returns one distinct name per side', () => {
    const sides = [['Al'], ['Al'], ['Alan'], ['Ali'], ['A'], ['Al B'], ['Al C']];
    const names = sideNames(sides);
    expect(names).toHaveLength(sides.length);
    expect(new Set(names).size).toBe(sides.length);
  });

  it('copes with spare spaces and no sides', () => {
    expect(sideNames([['  Hazard  '], [' Rough']])).toEqual(['H', 'R']);
    expect(sideNames([])).toEqual([]);
  });
});
