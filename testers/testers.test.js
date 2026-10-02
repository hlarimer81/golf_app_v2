import { describe, it, expect } from 'vitest';
import { generateCard, strokesOverPar, seededRandom, TYPICAL_OVER } from './scorecard';
import { SCENARIOS, BEHAVIOURS, GOLFERS, pickScenario, scenarioById, daysSinceEpoch } from './scenarios';

const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const strokeIndex = [7, 11, 17, 1, 9, 5, 15, 13, 3, 8, 12, 18, 2, 10, 6, 16, 14, 4];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const seeds = Array.from({ length: 400 }, (_, i) => `round-${i}`);

describe('generateCard', () => {
    it('gives the same card for the same seed, and a different one for another', () => {
        const a = generateCard({ pars, strokeIndex, courseHandicap: 14, seed: 'x' });
        expect(generateCard({ pars, strokeIndex, courseHandicap: 14, seed: 'x' })).toEqual(a);
        expect(generateCard({ pars, strokeIndex, courseHandicap: 14, seed: 'y' })).not.toEqual(a);
    });

    it('scores every hole, with nothing better than birdie or worse than four over', () => {
        for (const seed of seeds) {
            const card = generateCard({ pars, strokeIndex, courseHandicap: 20, seed });
            expect(card).toHaveLength(18);
            card.forEach((strokes, i) => {
                expect(Number.isInteger(strokes)).toBe(true);
                expect(strokes).toBeGreaterThanOrEqual(pars[i] - 1);
                expect(strokes).toBeLessThanOrEqual(pars[i] + 4);
            });
        }
    });

    it('keeps every round within reach of the handicap: 3 under it to 9 over it', () => {
        for (const courseHandicap of [2, 9, 14, 24]) {
            for (const seed of seeds) {
                const over = sum(generateCard({ pars, strokeIndex, courseHandicap, seed })) - sum(pars);
                expect(over).toBeGreaterThanOrEqual(courseHandicap - 3);
                expect(over).toBeLessThanOrEqual(courseHandicap + 9);
            }
        }
    });

    // The point of TYPICAL_OVER: an index is the best 8 of 20, so a golfer averages worse than it.
    // Cards that averaged the handicap itself would walk the index down round after round.
    it('averages a few strokes worse than the handicap, as real golfers do', () => {
        for (const courseHandicap of [5, 14, 22]) {
            const average = sum(seeds.map(seed =>
                sum(generateCard({ pars, strokeIndex, courseHandicap, seed })) - sum(pars))) / seeds.length;
            expect(average).toBeGreaterThan(courseHandicap + TYPICAL_OVER - 0.6);
            expect(average).toBeLessThan(courseHandicap + TYPICAL_OVER + 0.6);
        }
    });

    it('lets a good golfer break par on a good day and never invents a hole-in-one', () => {
        const overs = seeds.map(seed => sum(generateCard({ pars, strokeIndex, courseHandicap: 0, seed })) - sum(pars));
        expect(Math.min(...overs)).toBeLessThan(0);
        expect(Math.min(...overs)).toBeGreaterThanOrEqual(-3);
    });

    it('costs more strokes on the hard holes than the easy ones', () => {
        const over = Array(18).fill(0);
        for (const seed of seeds) {
            generateCard({ pars, strokeIndex, courseHandicap: 18, seed }).forEach((s, i) => { over[i] += s - pars[i]; });
        }
        const hardest = over.filter((_, i) => strokeIndex[i] <= 6);
        const easiest = over.filter((_, i) => strokeIndex[i] >= 13);
        expect(sum(hardest)).toBeGreaterThan(sum(easiest));
    });

    it('plays a nine-hole round to half the handicap', () => {
        const nine = pars.slice(0, 9);
        const average = sum(seeds.map(seed =>
            sum(generateCard({ pars: nine, strokeIndex: strokeIndex.slice(0, 9), courseHandicap: 16, seed })) - sum(nine))) / seeds.length;
        expect(average).toBeGreaterThan((16 + TYPICAL_OVER) / 2 - 0.6);
        expect(average).toBeLessThan((16 + TYPICAL_OVER) / 2 + 0.6);
    });

    it('works without stroke indexes', () => {
        const card = generateCard({ pars, courseHandicap: 12, seed: 'no-si' });
        expect(card).toHaveLength(18);
        expect(sum(card)).toBeGreaterThan(sum(pars));
    });
});

describe('strokesOverPar', () => {
    it('is a whole number', () => {
        expect(Number.isInteger(strokesOverPar(13.4, 18, seededRandom('a')))).toBe(true);
    });
});

describe('scenarios', () => {
    it('has unique ids', () => {
        expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
    });

    it('covers every game two golfers can play, and none that need more', () => {
        expect([...new Set(SCENARIOS.map(s => s.game))].sort())
            .toEqual(['chairman', 'fourball', 'nassau', 'singles', 'skins', 'stableford']);
    });

    it('never asks for a nine-hole Nassau, which the app refuses', () => {
        SCENARIOS.filter(s => s.game === 'nassau').forEach(s => expect(s.holes).toBe(18));
    });

    it('uses every setup option at least once', () => {
        const values = (key) => new Set(SCENARIOS.map(s => s[key]).filter(v => v !== undefined));
        expect(values('holes')).toEqual(new Set([18, 9]));
        expect(values('scoring')).toEqual(new Set(['net', 'gross']));
        expect(values('playOffLow')).toEqual(new Set([true, false]));
        expect(values('carryover')).toEqual(new Set([true, false]));
        expect(values('allowance').size).toBeGreaterThanOrEqual(4);
        expect(SCENARIOS.some(s => s.wager)).toBe(true);
        expect(SCENARIOS.some(s => s.presses)).toBe(true);
        expect(SCENARIOS.some(s => s.startHole && s.startHole !== 1)).toBe(true);
        expect(SCENARIOS.some(s => s.playMode === 'team')).toBe(true);
    });

    it('only sets an allowance when handicaps are in play', () => {
        SCENARIOS.filter(s => s.scoring === 'gross').forEach(s => expect(s.allowance).toBeUndefined());
    });
});

describe('pickScenario', () => {
    it('walks the whole list, one a night, and then starts again', () => {
        const ids = SCENARIOS.map((_, i) => pickScenario(1000 + i).id);
        expect(new Set(ids).size).toBe(SCENARIOS.length);
        expect(pickScenario(1000 + SCENARIOS.length).id).toBe(pickScenario(1000).id);
    });

    it('pairs each scenario with a different behaviour on the next lap', () => {
        const first = pickScenario(0);
        const nextLap = pickScenario(SCENARIOS.length);
        expect(nextLap.id).toBe(first.id);
        expect(nextLap.behaviour.id).not.toBe(first.behaviour.id);
    });

    it('names one of the golfers as the reporter, alternating', () => {
        expect(GOLFERS).toContain(pickScenario(7).reporter);
        expect(pickScenario(7).reporter).not.toBe(pickScenario(8).reporter);
    });

    it('copes with a negative or fractional day', () => {
        expect(SCENARIOS.map(s => s.id)).toContain(pickScenario(-3.5).id);
        expect(BEHAVIOURS.map(b => b.id)).toContain(pickScenario(-3.5).behaviour.id);
    });

    it('picks today when given a date', () => {
        expect(daysSinceEpoch(new Date('2026-10-02T12:00:00Z'))).toBe(20728);
    });
});

describe('scenarioById', () => {
    it('finds a scenario by name and still gives it a behaviour and a reporter', () => {
        const s = scenarioById('nassau-18-gross', 5);
        expect(s.game).toBe('nassau');
        expect(s.behaviour).toBeTruthy();
        expect(GOLFERS).toContain(s.reporter);
    });

    it('is null for a name that does not exist', () => {
        expect(scenarioById('no-such-thing')).toBeNull();
    });
});
