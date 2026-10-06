import { describe, expect, it } from 'vitest';
import { pickSavingsSubset } from './savings';

const c = (id: string, name: string, monthlySaving: number) => ({ id, name, monthlySaving });

describe('savings target tool (section 7)', () => {
  it('prefers a subset at or above the target, then closest, then fewer items', () => {
    const cands = [c('a', 'A', 5), c('b', 'B', 8), c('c', 'C', 3)];
    const got = pickSavingsSubset(cands, 8);
    // B alone (8) reaches the target exactly with one item
    expect(got.map((x) => x.name)).toEqual(['B']);
  });

  it('combines items when no single one reaches the target', () => {
    const cands = [c('a', 'A', 5), c('b', 'B', 4), c('c', 'C', 2)];
    const got = pickSavingsSubset(cands, 8);
    const sum = got.reduce((s, x) => s + x.monthlySaving, 0);
    expect(sum).toBeGreaterThanOrEqual(8);
    // A + B = 9 (over), fewer/closer than A+B+C = 11
    expect(got.map((x) => x.name).sort()).toEqual(['A', 'B']);
  });

  it('ignores zero-saving items and returns [] for a non-positive target', () => {
    expect(pickSavingsSubset([c('a', 'A', 0)], 10)).toEqual([]);
    expect(pickSavingsSubset([c('a', 'A', 5)], 0)).toEqual([]);
  });
});
