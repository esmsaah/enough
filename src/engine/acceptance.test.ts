// Acceptance tests from the usability run (Nov 2026): every amount the app shows
// must be explained by a line in the list, and nothing the person told us may vanish.
import { describe, expect, it } from 'vitest';
import { runAudit } from './score';
import type { Item } from './types';

let n = 0;
function item(p: Partial<Item>): Item {
  n += 1;
  return { id: p.id ?? `a${n}`, name: 'X', category: 'digital', displayCategory: 'Entertainment', price: 10, frequency: 'monthly', source: 'quickpick', estimate: true, currency: 'EUR', ...p };
}
const sumRecs = (a: ReturnType<typeof runAudit>) => Math.round(a.recommendations.reduce((s, r) => s + r.potentialYearlySaving, 0) * 100) / 100;

describe('acceptance: honest money found', () => {
  it('rotation shows one line per paused service and the lines add up to the total', () => {
    const vids = ['Netflix', 'Disney+', 'HBO Max', 'Apple TV+'].map((name) => item({ name, overlapGroup: 'video', usage: 'sometimes', wouldMiss: true }));
    const a = runAudit(vids, { createdAt: '2026-11-01' });
    const rotate = a.recommendations.filter((r) => r.action === 'rotate');
    expect(rotate.length).toBe(4);
    expect(a.potentialYearlySaving).toBeGreaterThan(0);
    expect(sumRecs(a)).toBe(a.potentialYearlySaving);
  });

  it('a video service used every week is never rotated', () => {
    const a = runAudit([
      item({ id: 'nf', name: 'Netflix', overlapGroup: 'video', usage: 'always' }),
      item({ name: 'Disney+', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true }),
      item({ name: 'HBO Max', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true }),
    ], { createdAt: '2026-11-01' });
    expect(a.recommendations.find((r) => r.itemId === 'nf')!.action).toBe('keep');
    expect(a.recommendations.filter((r) => r.action === 'rotate').length).toBe(2);
  });

  it('unanswered items never produce money', () => {
    const a = runAudit([item({ name: 'Netflix', overlapGroup: 'video' }), item({ name: 'Disney+', overlapGroup: 'video' })]);
    expect(a.potentialYearlySaving).toBe(0);
  });

  it('Spotify plus YouTube Premium is an overlap: drop the music-only app', () => {
    const a = runAudit([
      item({ id: 'sp', name: 'Spotify', merchantKey: 'spotify', overlapGroup: 'music', usage: 'always', price: 5.99 }),
      item({ id: 'yt', name: 'YouTube Premium', merchantKey: 'youtube premium', usage: 'always', price: 12.95 }),
    ]);
    const sp = a.recommendations.find((r) => r.itemId === 'sp')!;
    expect(sp.action).toBe('removeOverlap');
    expect(sp.reason).toMatch(/includes YouTube Music/);
    expect(a.potentialYearlySaving).toBeCloseTo(71.88, 2);
  });

  it('an overlap between two equally used services never claims one is used more', () => {
    const a = runAudit([
      item({ name: 'iCloud+', overlapGroup: 'cloud', usage: 'always', price: 0.99, displayCategory: 'Cloud & Storage' }),
      item({ name: 'Google One', overlapGroup: 'cloud', usage: 'always', price: 1.99, displayCategory: 'Cloud & Storage' }),
    ]);
    const r = a.recommendations.find((x) => x.action === 'removeOverlap')!;
    expect(r.reason).not.toMatch(/use more/);
  });
});

describe('acceptance: nothing vanishes', () => {
  it('bills not compared in a year become advice and count in the year total', () => {
    const bill = item({ name: 'BH Telecom', category: 'bill', displayCategory: 'Bills & Utilities', price: 25.54, compareState: 'never' });
    const a = runAudit([bill]);
    expect(a.advice.map((x) => x.kind)).toEqual(['compareOffers']);
    expect(a.grandYearlyTotal).toBeCloseTo(306.48, 2);
    expect(a.potentialYearlySaving).toBe(0); // advice, not money found
  });

  it('habits are shown with their yearly total, never as money found', () => {
    const a = runAudit([item({ name: 'Coffee / eating out', category: 'habit', displayCategory: 'Other', price: 65 })]);
    expect(a.advice[0]).toMatchObject({ kind: 'habit', yearly: 780 });
    expect(a.grandYearlyTotal).toBe(780);
    expect(a.potentialYearlySaving).toBe(0);
  });

  it('a cheaper plan is suggested for a service used only sometimes', () => {
    const a = runAudit([item({ name: 'Netflix', merchantKey: 'netflix', planName: 'Premium', price: 9.99, usage: 'sometimes', wouldMiss: true })], {
      cheaperPlan: () => ({ name: 'Basic', monthly: 4.99, currency: 'EUR' }),
    });
    expect(a.advice[0]).toMatchObject({ kind: 'cheaperPlan', yearlyDiff: 60 });
  });
});
