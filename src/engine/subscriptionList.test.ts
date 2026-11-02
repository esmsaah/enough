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

describe('phone subscription list in many languages', () => {
  const T = '2026-11-02';
  it('German, French, Spanish', () => {
    expect(parseSubscriptionList(['Netflix', '13,99 € / Monat', 'Verlängert sich am 20. November'], T)[0]).toMatchObject({ price: 13.99, currency: 'EUR', frequency: 'monthly', nextCharge: '2026-11-20' });
    expect(parseSubscriptionList(['Spotify', '10,99 € par mois', 'Se renouvelle le 5 décembre'], T)[0]).toMatchObject({ price: 10.99, nextCharge: '2026-12-05' });
    expect(parseSubscriptionList(['Disney+', '89,90 € al año', 'Se renueva el 3 de marzo de 2027'], T)[0]).toMatchObject({ frequency: 'yearly', nextCharge: '2027-03-03' });
  });
  it('Arabic with Arabic digits, Hebrew', () => {
    expect(parseSubscriptionList(['Netflix', '٣٩٫٠٠ د.إ شهريًا', 'يتجدد في ١٥/١٢/٢٠٢٦'], T, 'AE')[0]).toMatchObject({ price: 39, currency: 'AED', frequency: 'monthly', nextCharge: '2026-12-15' });
    expect(parseSubscriptionList(['Spotify', '₪23.90 לחודש', 'מתחדש ב-10.12.2026'], T, 'IL')[0]).toMatchObject({ price: 23.9, currency: 'ILS', nextCharge: '2026-12-10' });
  });
  it('Japanese, Chinese, Korean', () => {
    expect(parseSubscriptionList(['YouTube Premium', '¥1,280/月', '次回の更新日: 2026年11月20日'], T, 'JP')[0]).toMatchObject({ price: 1280, currency: 'JPY', frequency: 'monthly', nextCharge: '2026-11-20' });
    expect(parseSubscriptionList(['iCloud+', '¥21.00/月', '下次续订：12月1日'], T, 'CN')[0]).toMatchObject({ price: 21, currency: 'CNY', nextCharge: '2026-12-01' });
    expect(parseSubscriptionList(['Netflix', '₩17,000/월', '다음 결제일: 11월 25일'], T, 'KR')[0]).toMatchObject({ price: 17000, currency: 'KRW', nextCharge: '2026-11-25' });
  });
  it('Russian, Turkish, Swedish, Polish', () => {
    expect(parseSubscriptionList(['Яндекс Плюс', '299 ₽ в месяц', 'Продлевается 14 декабря'], T, 'RU')[0]).toMatchObject({ price: 299, currency: 'RUB', nextCharge: '2026-12-14' });
    expect(parseSubscriptionList(['Netflix', '₺149,99/ay', 'Yenilenme: 20 Kasım'], T, 'TR')[0]).toMatchObject({ price: 149.99, currency: 'TRY', nextCharge: '2026-11-20' });
    expect(parseSubscriptionList(['Spotify', '119 kr/månad', 'Förnyas 3 december'], T, 'SE')[0]).toMatchObject({ price: 119, currency: 'SEK', nextCharge: '2026-12-03' });
    expect(parseSubscriptionList(['Netflix', '43 zł miesięcznie', 'Odnawia się 9 grudnia'], T, 'PL')[0]).toMatchObject({ price: 43, currency: 'PLN', nextCharge: '2026-12-09' });
  });
});

describe('OCR quirks', () => {
  it('Japanese screenshot as tesseract reads it', () => {
    const lines = ['サブ スク リプ ショ ン', 'YouTube Premium', '\\1,280/ 月', '次 回 の 更新 日 : 2026 年 11 月 20 日', 'Netflix', '\\1,590/ 月', '次 回 の 更新 日 : 2026 年 12 月 5 日', 'iCloud+', '¥450/8', '次 回 の 更新 日 : 2026 年 11 月 28 日'];
    const subs = parseSubscriptionList(lines, '2026-11-02', 'JP');
    expect(subs.map((s) => [s.name, s.price, s.currency, s.nextCharge])).toEqual([
      ['YouTube Premium', 1280, 'JPY', '2026-11-20'], ['Netflix', 1590, 'JPY', '2026-12-05'], ['iCloud+', 450, 'JPY', '2026-11-28'],
    ]);
  });
});
