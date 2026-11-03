// End to end: the person's answers + verified Bosnian plans → engine → the cut list's recommendations.
import { describe, expect, it } from 'vitest';
import { runAudit } from '../engine/score';
import type { Item } from '../engine/types';
import { opportunitiesFor } from './opportunities';

const TODAY = '2026-11-03';
const base = { displayCategory: 'Entertainment', source: 'quickpick', estimate: true, currency: 'EUR', frequency: 'monthly', category: 'digital' } as const;
const audit = (items: Item[]) => runAudit(items, {
  displayCurrency: 'EUR', createdAt: TODAY,
  opportunities: (subs, today, losers) => opportunitiesFor(subs, 'BA', 'EUR', today, losers),
});
const rec = (a: ReturnType<typeof audit>, id: string) => a.recommendations.find((r) => r.itemId === id)!;

describe('opportunity engine inside the audit (Bosnia, verified plans)', () => {
  it('Netflix Premium, one viewer, Full HD is enough → Standard, (9.99 − 7.99) × 12 = €24', () => {
    const a = audit([{ ...base, id: 'nf', name: 'Netflix', merchantKey: 'netflix', price: 9.99, planName: 'Premium', usage: 'always', watchAtOnce: 1, minQuality: 1080, overlapGroup: 'video' } as Item]);
    expect(rec(a, 'nf')).toMatchObject({ action: 'changePlan', potentialYearlySaving: 24 });
    expect(rec(a, 'nf').opp?.sources[0]).toMatch(/help\.netflix\.com/);
    expect(a.opportunities?.levels[0]?.saving12).toBe(24);
  });

  it('two Spotify accounts at one address → Duo, (2 × 5.99 − 8.49) × 12 = €41.88', () => {
    const a = audit([{ ...base, id: 'sp', name: 'Spotify', merchantKey: 'spotify', price: 5.99, planName: 'Premium Individual', usage: 'always', householdOwn: true, overlapGroup: 'music' } as Item]);
    expect(rec(a, 'sp')).toMatchObject({ action: 'sharePlan', potentialYearlySaving: 41.88 });
  });

  it('HBO Max and Disney+ used sometimes and missed → take turns, never cancel', () => {
    const a = audit([
      { ...base, id: 'hbo', name: 'HBO Max', merchantKey: 'max', price: 7.99, usage: 'sometimes', wouldMiss: true, overlapGroup: 'video' } as Item,
      { ...base, id: 'dp', name: 'Disney+', merchantKey: 'disney+', price: 9.99, usage: 'sometimes', wouldMiss: true, overlapGroup: 'video' } as Item,
    ]);
    expect(rec(a, 'hbo').action).toBe('rotate');
    expect(rec(a, 'dp').action).toBe('rotate');
    // 6 months each: (7.99 + 9.99) × 12 − 6 × 7.99 − 6 × 9.99 = 107.88
    expect(rec(a, 'hbo').potentialYearlySaving + rec(a, 'dp').potentialYearlySaving).toBeCloseTo(107.88, 2);
    expect(a.recommendations.some((r) => r.action === 'cancel')).toBe(false);
  });

  it('already on the cheapest plan that fits → nothing to change, €0, honest keep reason', () => {
    const a = audit([{ ...base, id: 'nf', name: 'Netflix', merchantKey: 'netflix', price: 4.99, planName: 'Basic', usage: 'always', watchAtOnce: 1, overlapGroup: 'video' } as Item]);
    expect(a.potentialYearlySaving).toBe(0);
    expect(rec(a, 'nf').action).toBe('keep');
    expect(rec(a, 'nf').reason).not.toMatch(/earning its place/);
  });

  it('unknown picture needs → no counted saving, one question instead', () => {
    const a = audit([{ ...base, id: 'nf', name: 'Netflix', merchantKey: 'netflix', price: 9.99, planName: 'Premium', usage: 'always', overlapGroup: 'video' } as Item]);
    expect(a.potentialYearlySaving).toBe(0);
    expect(a.opportunities?.conditionals[0]?.saving12IfYes).toBeGreaterThan(0);
  });

  it('something said "almost never" is still cancelled, with its full year', () => {
    const a = audit([{ ...base, id: 'dp', name: 'Disney+', merchantKey: 'disney+', price: 9.99, usage: 'almostNever', overlapGroup: 'video' } as Item]);
    expect(rec(a, 'dp')).toMatchObject({ action: 'cancel', potentialYearlySaving: 119.88 });
  });
});
