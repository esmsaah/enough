import { describe, expect, it } from 'vitest';
import { runAudit } from './score';
import { calendarEvents, howToFor, moneyPlan, toIcs, upcomingCharge } from './howto';
import type { Item } from './types';

const money = (n: number) => `€${n.toFixed(2)}`;
function item(p: Partial<Item>): Item {
  return { id: p.id ?? Math.random().toString(36).slice(2), name: 'X', category: 'digital', displayCategory: 'Entertainment', price: 10, frequency: 'monthly', source: 'statement', estimate: false, currency: 'EUR', ...p };
}

describe('the full list is a plan, not a verdict', () => {
  it('a cancel has steps, a link for known services and a deadline from the statement', () => {
    const nf = item({ id: 'nf', name: 'Netflix', merchantKey: 'netflix', usage: 'almostNever', nextCharge: '2026-12-12', price: 7.99 });
    const a = runAudit([nf], { createdAt: '2026-11-02' });
    const how = howToFor(a.recommendations[0]!, a.items[0]!, a, money);
    expect(how.link).toContain('netflix.com');
    expect(how.steps.length).toBeGreaterThanOrEqual(2);
    expect(how.deadline).toMatch(/December 12/);
  });

  it('an old statement date rolls forward to the next real charge', () => {
    expect(upcomingCharge(item({ nextCharge: '2026-05-08' }), '2026-11-02')).toBe('2026-11-08');
  });

  it('utilities get no compare-offers advice', () => {
    const a = runAudit([item({ name: 'Elektro distribucija', category: 'bill', displayCategory: 'Bills & Utilities', compareState: 'never' })]);
    expect(a.advice).toEqual([]);
  });

  it('rotation names the months for each service and the calendar has the switches', () => {
    const vids = ['Netflix', 'Disney+', 'HBO Max'].map((name, n) => item({ id: `v${n}`, name, overlapGroup: 'video', usage: 'sometimes', wouldMiss: true }));
    const a = runAudit(vids, { createdAt: '2026-11-02' });
    const how = howToFor(a.recommendations.find((r) => r.action === 'rotate')!, a.items[0]!, a, money);
    expect(how.steps[0]).toMatch(/Keep .* on in /);
    const events = calendarEvents(a, money);
    expect(events.filter((e) => e.title.startsWith('Streaming switch')).length).toBeGreaterThanOrEqual(3);
    expect(events.at(-1)!.title).toMatch(/check your subscriptions again/);
    const ics = toIcs(events);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(events.length);
  });

  it('the plan for the money compares to something they keep paying for', () => {
    const a = runAudit([
      item({ name: 'Disney+', usage: 'almostNever', price: 9.25 }),
      item({ name: 'Telekom', category: 'bill', displayCategory: 'Bills & Utilities', price: 25, compareState: 'thisYear' }),
    ]);
    expect(moneyPlan(a)).toEqual({ months: 4, name: 'Telekom' });
  });
});

describe('contracts and pauses', () => {
  const gym = (p: Partial<Item>) => item({ name: 'Gym', category: 'membership', displayCategory: 'Fitness & Health', price: 40, visitsPerMonth: 0, ...p });
  it('a gym under contract counts only the months after it ends', () => {
    const a = runAudit([gym({ contract: 'contract', contractEnds: '2027-05' })], { createdAt: '2026-11-02' });
    expect(a.potentialYearlySaving).toBe(240); // 6 of 12 months
    expect(calendarEvents(a, money).some((e) => e.title.startsWith('Give notice'))).toBe(true);
  });
  it('not sure about the contract: no money claimed, check it first', () => {
    const a = runAudit([gym({ contract: 'unsure' })], { createdAt: '2026-11-02' });
    expect(a.potentialYearlySaving).toBe(0);
    expect(a.recommendations[0]!.reason).toMatch(/contract/);
  });
  it('yearly video plans are not rotated', () => {
    const a = runAudit([
      item({ name: 'HBO Max', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true, frequency: 'yearly', price: 100 }),
      item({ name: 'Disney+', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true }),
    ], { createdAt: '2026-11-02' });
    expect(a.recommendations.some((r) => r.action === 'rotate')).toBe(false);
  });
  it('YouTube Premium is paused, not cancelled', () => {
    const a = runAudit([item({ name: 'YouTube Premium', merchantKey: 'youtube premium', usage: 'almostNever' })], { createdAt: '2026-11-02' });
    expect(howToFor(a.recommendations[0]!, a.items[0]!, a, money).steps[0]).toMatch(/Pause/);
  });
});

describe('calendar for tapped items', () => {
  it('a tapped cancel without a charge date still gets a reminder', () => {
    const a = runAudit([item({ name: 'Disney+', source: 'quickpick', usage: 'almostNever' })], { createdAt: '2026-11-02' });
    const ev = calendarEvents(a, money);
    expect(ev.find((e) => e.title === 'Cancel Disney+')?.date).toBe('2026-11-03');
  });
});
