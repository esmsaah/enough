import { describe, expect, it } from 'vitest';
import { localPrice, plansFor, withLocalPrice } from './localPrices';

describe('local plan prices', () => {
  it('uses the country price, not the US one', () => {
    expect(localPrice('netflix', 'BA')).toMatchObject({ monthly: 7.99, currency: 'EUR', plan: 'Standard' });
    expect(localPrice('netflix', 'US')).toMatchObject({ monthly: 19.99, currency: 'USD' });
    expect(localPrice('spotify', 'BA')).toMatchObject({ monthly: 5.99, currency: 'EUR' });
  });
  it('treats UK and GB as the same country', () => {
    expect(localPrice('netflix', 'UK')).toMatchObject({ monthly: 13.99, currency: 'GBP' });
    expect(localPrice('netflix', 'gb')).toEqual(localPrice('netflix', 'UK'));
  });
  it('keeps every plan for the Check step', () => {
    expect(plansFor('netflix', 'DE')!.plans.length).toBeGreaterThan(1);
  });
  it('leaves unknown services and countries alone', () => {
    const pick = { merchantKey: 'nothing-here', price: 9.99 };
    expect(withLocalPrice(pick, 'BA')).toBe(pick);
    expect(localPrice('netflix', 'ZZ')).toBeUndefined();
  });
});
