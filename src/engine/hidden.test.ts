import { describe, expect, it } from 'vitest';
import { computeHiddenCosts } from './hidden';
import type { Item, Profile } from './types';

function sub(partial: Partial<Item>): Item {
  return {
    id: partial.id ?? 'x',
    name: partial.name ?? 'Thing',
    category: 'digital',
    displayCategory: 'Entertainment',
    price: 10,
    frequency: 'monthly',
    source: 'quickpick',
    estimate: true,
    currency: 'EUR',
    ...partial,
  };
}

describe('hidden costs — foreign-currency fees (§7)', () => {
  it('estimates 1.5% of foreign spend when the person pays abroad sometimes', () => {
    const profile: Profile = { foreignCurrency: 'sometimes' };
    const [fx] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile, foreignSpendYearly: 2000 });
    expect(fx!.kind).toBe('fx');
    expect(fx!.yearly).toBeCloseTo(30, 2); // 2000 * 1.5%
    expect(fx!.estimate).toBe(true);
  });

  it('estimates 3% when they pay abroad often', () => {
    const [fx] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { foreignCurrency: 'often' }, foreignSpendYearly: 2000 });
    expect(fx!.yearly).toBeCloseTo(60, 2);
  });

  it('prefers the exact fee from the statement over the estimate', () => {
    const costs = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { foreignCurrency: 'often' }, foreignSpendYearly: 2000, statementFxFeeYearly: 312.5 });
    const fx = costs.filter((c) => c.kind === 'fx');
    expect(fx).toHaveLength(1);
    expect(fx[0]!.yearly).toBe(312.5);
    expect(fx[0]!.estimate).toBe(false);
  });

  it('says nothing when they never pay in another currency', () => {
    expect(computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { foreignCurrency: 'never' }, foreignSpendYearly: 2000 })).toHaveLength(0);
  });
});

describe('hidden costs — bank fee (§7)', () => {
  it('turns a known monthly fee into a yearly figure', () => {
    const [fee] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { bankFeeMonthly: 5 } });
    expect(fee!.kind).toBe('bankFee');
    expect(fee!.yearly).toBe(60);
    expect(fee!.estimate).toBe(true);
  });

  it('gives advice only when the fee is unknown', () => {
    const [fee] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { bankFeeMonthly: 'unknown' } });
    expect(fee!.kind).toBe('bankFee');
    expect(fee!.yearly).toBeUndefined();
  });

  it('uses the exact statement fee when present', () => {
    const [fee] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { bankFeeMonthly: 2 }, statementBankFeeYearly: 48 });
    expect(fee!.yearly).toBe(48);
    expect(fee!.estimate).toBe(false);
  });

  it('says nothing when the account is free', () => {
    expect(computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { bankFeeMonthly: 0 } })).toHaveLength(0);
  });
});

describe('hidden costs — habits, cash and small subs (§7)', () => {
  it('annualizes delivery and taxi habits', () => {
    const profile: Profile = { delivery: { frequency: 'weekly', typicalAmount: 20 }, taxi: { frequency: 'sometimes', typicalAmount: 10 } };
    const costs = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile });
    expect(costs.find((c) => c.label === 'Food delivery')!.yearly).toBe(20 * 52);
    expect(costs.find((c) => c.label === 'Taxis & ride-hailing')!.yearly).toBe(10 * 12);
  });

  it('sums cash items the statement never sees', () => {
    const [cash] = computeHiddenCosts({ currency: 'EUR', subscriptions: [], profile: { cashItems: [{ label: 'Hairdresser', monthly: 25 }, { label: 'Coffee', monthly: 15 }] } });
    expect(cash!.kind).toBe('cash');
    expect(cash!.yearly).toBe((25 + 15) * 12);
  });

  it('flags a pile of small subscriptions under €5', () => {
    const subs = [sub({ id: 'a', price: 2.99 }), sub({ id: 'b', price: 3.99 }), sub({ id: 'c', price: 12 })];
    const [small] = computeHiddenCosts({ currency: 'EUR', subscriptions: subs });
    expect(small!.kind).toBe('smallSubs');
    expect(small!.yearly).toBeCloseTo((2.99 + 3.99) * 12, 2); // the €12 one is not small
  });

  it('does not flag a single small subscription', () => {
    expect(computeHiddenCosts({ currency: 'EUR', subscriptions: [sub({ price: 2.99 })] })).toHaveLength(0);
  });
});

describe('hidden costs — price above catalog (§7)', () => {
  it('warns when the person pays well over the typical price', () => {
    const item = sub({ id: 'nf', name: 'Netflix', price: 20, catalogPrice: 13.99 });
    const [warn] = computeHiddenCosts({ currency: 'EUR', subscriptions: [item] });
    expect(warn!.kind).toBe('priceAboveCatalog');
    expect(warn!.itemId).toBe('nf');
    expect(warn!.yearly).toBeCloseTo((20 - 13.99) * 12, 2);
  });

  it('stays quiet when the price is in the normal range', () => {
    const item = sub({ price: 14.99, catalogPrice: 13.99 });
    expect(computeHiddenCosts({ currency: 'EUR', subscriptions: [item] })).toHaveLength(0);
  });
});
