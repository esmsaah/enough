import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './state';
import type { Item } from '../engine/types';

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
