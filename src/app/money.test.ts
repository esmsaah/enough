import { describe, expect, it } from 'vitest';
import { auditPrice, PRICE_TIERS } from './money';

describe('auditPrice', () => {
  it('full price where not listed', () => {
    expect(auditPrice('DE')).toBe(5.99);
    expect(auditPrice('UK')).toBe(5.99);
    expect(auditPrice(undefined)).toBe(5.99);
  });
  it('70% and 50% tiers', () => {
    expect(auditPrice('HR')).toBe(4.19);
    expect(auditPrice('BA')).toBe(3);
    expect(auditPrice('in')).toBe(3);
  });
  it('no country is in two tiers', () => {
    const all = PRICE_TIERS.flatMap((t) => t.countries);
    expect(new Set(all).size).toBe(all.length);
  });
});
