import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './state';
import type { Item } from '../engine/types';
import { detect, type ImportMeta } from '../engine/detect';

describe('display currency preference', () => {
  it('allows changing the result currency without replacing audit items', () => {
    const state = {
      ...initialState,
      step: 'result' as const,
      items: [{ id: 'one', name: 'Adobe', merchantKey: 'adobe', category: 'digital', displayCategory: 'AI & Software', price: 10, frequency: 'monthly', source: 'statement', estimate: false, currency: 'EUR' } satisfies Item],
    };
    const updated = reducer(state, { type: 'setCurrency', currency: 'USD' });
    expect(updated.currency).toBe('USD');
    expect(updated.items).toBe(state.items);
    expect(updated.step).toBe('result');
  });
});

describe('adding multiple statements', () => {
  it('merges rows from each upload, deduplicates overlaps, and reruns detection', () => {
    const meta: ImportMeta = { displayCurrency: 'EUR', dateFormat: 'iso', dateAmbiguous: false, monthsSpan: 0, redactedCategories: [], columnQuestions: [], columnCount: 3 };
    const first = detect([{ date: '2026-08-01', merchantRaw: 'Adobe Creative Cloud', amount: 16.99, currency: 'EUR' }], meta);
    const second = detect([
      { date: '2026-09-01', merchantRaw: 'Adobe Creative Cloud', amount: 16.99, currency: 'EUR' },
      { date: '2026-08-01', merchantRaw: 'adobe creative cloud', amount: 16.99, currency: 'EUR' },
      { date: '2026-09-02', merchantRaw: 'Lidl', amount: 25, currency: 'EUR' },
    ], meta);
    const stateWithA = reducer(initialState, { type: 'statementParsed', result: first });
    const stateWithAB = reducer(stateWithA, { type: 'statementParsed', result: second });
    expect(stateWithAB.statement?.transactions.map((row) => row.date).sort()).toEqual(['2026-08-01', '2026-09-01', '2026-09-02']);
    expect(stateWithAB.statement?.recurring.find((item) => item.merchantKey === 'adobe')?.charges).toBe(2);
    expect(stateWithAB.statement?.spendingByCategory.Groceries).toBe(25);
  });
});
