import { describe, expect, it } from 'vitest';
import { parseRenewalDate, parseSubscriptionList } from './subscriptionList';

const TODAY = '2026-11-02';

describe('phone subscription list (brief §6)', () => {
  it('iPhone: name, plan line, renewal, price', () => {
    const lines = ['Subscriptions', 'Active', 'Netflix', 'Standard (Monthly)', 'Renews 14 November', '€7.99/month', 'Spotify', 'Premium Individual', 'Renews 3 December', '€5.99', 'Duolingo', 'Super (Yearly)', 'Renews 1 March 2027', '€83.99/year'];
    const subs = parseSubscriptionList(lines, TODAY);
    expect(subs.map((s) => s.name)).toEqual(['Netflix', 'Spotify', 'Duolingo']);
    expect(subs[0]).toMatchObject({ price: 7.99, currency: 'EUR', frequency: 'monthly', nextCharge: '2026-11-14' });
    expect(subs[2]).toMatchObject({ frequency: 'yearly', price: 83.99, nextCharge: '2027-03-01' });
  });
  it('Google Play: price line with next payment', () => {
    const lines = ['Payments & subscriptions', 'YouTube Premium', '12,95 € / month', 'Next payment: Nov 20', 'Google One', '1,99 € / month', 'Next payment: Dec 1, 2026'];
    const subs = parseSubscriptionList(lines, TODAY);
    expect(subs).toEqual([
      { name: 'YouTube Premium', price: 12.95, currency: 'EUR', frequency: 'monthly', nextCharge: '2026-11-20' },
      { name: 'Google One', price: 1.99, currency: 'EUR', frequency: 'monthly', nextCharge: '2026-12-01' },
    ]);
  });
  it('local languages and currencies', () => {
    expect(parseRenewalDate('Obnavlja se 14.10.2027.', TODAY)).toBe('2027-10-14');
    expect(parseRenewalDate('Verlängert sich am 5. Jan.', TODAY)).toBe('2027-01-05');
    const subs = parseSubscriptionList(['HBO Max', '15,99 KM mjesečno', 'Obnavlja se 20.11.2026'], TODAY);
    expect(subs[0]).toMatchObject({ currency: 'BAM', price: 15.99, nextCharge: '2026-11-20' });
  });
});
