import { describe, expect, it } from 'vitest';
import { pickForTarget } from './target';
import type { Recommendation } from './types';

const rec = (itemId: string, yearly: number): Recommendation => ({ itemId, verdict: 'cut', action: 'cancel', reason: '', yearlyCost: yearly, potentialYearlySaving: yearly });

describe('savings target tool (brief §7)', () => {
  const recs = [rec('a', 120), rec('b', 60), rec('c', 36), rec('k', 0)];
  it('reaches the target when possible, then fewer changes', () => {
    const p = pickForTarget(recs, 12)!; // a=10, b=5, c=3 a month
    expect(p.monthly).toBeGreaterThanOrEqual(12);
    expect(p.ids.sort()).toEqual(['a', 'c']);
  });
  it('when nothing reaches it, takes everything closest', () => {
    expect(pickForTarget(recs, 100)!.ids.sort()).toEqual(['a', 'b', 'c']);
  });
  it('ignores changes that save nothing', () => {
    expect(pickForTarget([rec('k', 0)], 5)).toBeUndefined();
  });
});
