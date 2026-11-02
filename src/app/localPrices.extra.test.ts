import { describe, expect, it } from 'vitest';
import { cheaperPlanFor, typicalGymEur, withLocalPrice } from './localPrices';

describe('plans and gym research', () => {
  it('the tap price remembers which plan it is', () => {
    expect(withLocalPrice({ merchantKey: 'netflix', price: 13.99 }, 'BA')).toMatchObject({ price: 7.99, planName: 'Standard' });
  });
  it('finds a cheaper Netflix plan than Premium in Bosnia', () => {
    const alt = cheaperPlanFor('netflix', 'Premium', 9.99, 'EUR', 'BA');
    expect(alt?.monthly).toBeLessThan(9.99);
    expect(alt?.name).not.toMatch(/ads/i);
  });
  it('knows the typical gym fee per country', () => {
    expect(typicalGymEur('BA')).toBeCloseTo(29.65, 2);
    expect(typicalGymEur('GB')).toBe(typicalGymEur('UK'));
  });
});
