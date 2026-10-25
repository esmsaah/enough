import { describe, expect, it } from 'vitest';
import { buildReminders } from './reminders';
import type { Item, Profile } from './types';

function item(partial: Partial<Item>): Item {
  return {
    id: partial.id ?? 'x',
    name: partial.name ?? 'Thing',
    category: 'digital',
    displayCategory: 'AI & Software',
    price: 100,
    frequency: 'yearly',
    source: 'quickpick',
    estimate: true,
    currency: 'EUR',
    ...partial,
  };
}

describe('reminders — yearly renewal (§7)', () => {
  it('reminds a week before a yearly plan renews', () => {
    const domain = item({ id: 'd', name: 'Domain', frequency: 'yearly', renewalMonth: 3 });
    const [r] = buildReminders([domain], undefined, '2026-01-10');
    expect(r!.kind).toBe('renewal');
    expect(r!.itemId).toBe('d');
    expect(r!.date).toBe('2026-02-22'); // 7 days before March 1
  });

  it('rolls into next year when the renewal month has passed', () => {
    const [r] = buildReminders([item({ id: 'd', frequency: 'yearly', renewalMonth: 1 })], undefined, '2026-06-01');
    expect(r!.date).toBe('2026-12-25'); // 7 days before Jan 1, 2027
  });

  it('ignores a monthly plan with no renewal month', () => {
    expect(buildReminders([item({ frequency: 'monthly', renewalMonth: undefined })], undefined, '2026-01-10')).toHaveLength(0);
  });
});

describe('reminders — trial ending (§7)', () => {
  it('reminds two days before an explicit trial end date', () => {
    const [r] = buildReminders([item({ id: 't', name: 'ChatGPT', trialEndsOn: '2026-02-15' })], undefined, '2026-01-20');
    expect(r!.kind).toBe('trial');
    expect(r!.date).toBe('2026-02-13');
  });

  it('derives the trial end from a profile start date (30-day default)', () => {
    const profile: Profile = { recentTrials: [{ merchantKey: 'chatgpt', startDate: '2026-01-01' }] };
    const [r] = buildReminders([item({ id: 't', name: 'ChatGPT', merchantKey: 'chatgpt' })], profile, '2026-01-05');
    expect(r!.kind).toBe('trial');
    expect(r!.date).toBe('2026-01-29'); // 2 days before Jan 31 (Jan 1 + 30d)
  });
});
