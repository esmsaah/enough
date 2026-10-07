import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detect, transactionsFromRows, type ImportMeta } from './detect';
import { runAudit } from './score';
import { matchMerchant } from './merchants';
import type { Frequency, Item, Transaction } from './types';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', '..', 'fixtures/detection/recurring-cases.synthetic.json'), 'utf8')) as {
  asOf: string;
  transactions: Transaction[];
  singleCharges: Transaction[];
};
const meta: ImportMeta = {
  displayCurrency: 'EUR', dateFormat: 'iso', dateAmbiguous: false, monthsSpan: 5,
  redactedCategories: [], columnQuestions: [], columnCount: 4,
};

describe('synthetic merchant recurrence safeguards', () => {
  const result = detect(fixture.transactions, meta, fixture.asOf);

  it('never calls irregular shop and cafe spending a recurring subscription', () => {
    const recurringKeys = result.recurring.map((item) => item.merchantKey);
    for (const key of ['maci', 'aroma marketi', 'idea', 'zaokret']) expect(recurringKeys).not.toContain(key);
    expect(result.habits.some((item) => item.merchantKey === 'maci')).toBe(true);
    expect(result.habits.some((item) => item.merchantKey === 'zaokret')).toBe(true);
    expect(result.ignored.map((item) => item.merchantKey)).toContain('aroma marketi');
    expect(result.ignored.map((item) => item.merchantKey)).toContain('idea');
  });

  it('surfaces known one-charge subscriptions and bills as possible recurring', () => {
    for (const transaction of fixture.singleCharges) {
      const candidate = detect([transaction], meta, fixture.asOf).possibleRecurring[0];
      const classified = detect([transaction], meta, fixture.asOf);
      if (['usage', 'oneTime'].includes(classified.habits[0]?.billingModel ?? '')) {
        expect(classified.habits[0], transaction.merchantRaw).toBeDefined();
        continue;
      }
      expect(candidate, transaction.merchantRaw).toBeDefined();
      if (transaction.merchantRaw.includes('mts') || transaction.merchantRaw.includes('Infostan') || transaction.merchantRaw.includes('osiguranje')) {
        expect(candidate?.category).toBe('bill');
      }
    }
  });

  it('calls close same-merchant charges within seven days a possible double charge', () => {
    expect(result.possibleDoubleCharges).toContainEqual({
      merchantKey: 'adobe', name: 'Adobe', amount: 16.81, currency: 'EUR',
      firstCharge: '2026-09-01', secondCharge: '2026-09-03',
    });
    const candidate = detect(fixture.transactions.filter((transaction) => transaction.merchantRaw.toLowerCase().includes('adobe')), meta).possibleRecurring[0];
    expect(candidate?.possibleDuplicateCharge).toMatchObject({ amount: 16.81, firstCharge: '2026-09-01', secondCharge: '2026-09-03' });
  });

  it('flags possible double charges only for digital and bill merchants', () => {
    const transactions: Transaction[] = [
      { date: '2026-09-01', merchantRaw: 'MAĆI', amount: 4.20, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'MAĆI', amount: 4.20, currency: 'EUR' },
      { date: '2026-09-01', merchantRaw: 'Upwork', amount: 24.00, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'Upwork', amount: 24.00, currency: 'EUR' },
      { date: '2026-09-01', merchantRaw: 'Adobe Creative Cloud', amount: 16.80, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'Adobe Creative Cloud', amount: 16.80, currency: 'EUR' },
      { date: '2026-09-01', merchantRaw: 'mts Mobile', amount: 34.99, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'mts Mobile', amount: 34.99, currency: 'EUR' },
    ];
    const found = detect(transactions, meta).possibleDoubleCharges.map((item) => item.merchantKey);
    expect(found).toEqual(['adobe', 'mts']);
    expect(found).not.toContain('maci');
    expect(found).not.toContain('upwork');
  });

  it('offers a one-charge Wiener Städtische insurance payment as a yearly bill', () => {
    const transaction: Transaction = {
      date: '2026-09-12', merchantRaw: 'Wiener Stadtische Osig', amount: 89.50, currency: 'EUR',
    };
    const candidate = detect([transaction], meta).possibleRecurring.find((item) => item.merchantKey === 'insurance');
    expect(candidate).toMatchObject({ category: 'bill', frequency: 'yearly', charges: 1 });
  });

  it('never returns an empty key for ignored merchants', () => {
    const result = detect([
      { date: '2026-09-01', merchantRaw: 'Lidl', amount: 12.30, currency: 'EUR' },
      { date: '2026-09-02', merchantRaw: 'Revolut card payment', amount: 2.00, currency: 'EUR' },
    ], meta);
    expect(result.ignored.map((item) => item.merchantKey)).toEqual(['lidl']);
    expect(result.ignored.every((item) => item.merchantKey.trim().length > 0)).toBe(true);
  });

  it('shows only the requested spending categories and leaves bills/subscriptions separate', () => {
    const categorized = detect([
      { date: '2026-09-01', merchantRaw: 'Lidl', amount: 20, currency: 'EUR' },
      { date: '2026-09-02', merchantRaw: 'Coffee Corner', amount: 8, currency: 'EUR', bankCategoryHint: 'eatingOut' },
      { date: '2026-09-03', merchantRaw: 'Uber ride', amount: 12, currency: 'EUR' },
      { date: '2026-09-04', merchantRaw: 'Wolt', amount: 15, currency: 'EUR' },
      { date: '2026-09-05', merchantRaw: 'Adobe Creative Cloud', amount: 16.99, currency: 'EUR' },
      { date: '2026-09-06', merchantRaw: 'mts Mobile', amount: 34.99, currency: 'EUR' },
      { date: '2026-09-07', merchantRaw: 'Unknown antique shop', amount: 70, currency: 'EUR' },
    ], meta);
    expect(categorized.spendingByCategory).toEqual({
      Groceries: 20,
      Shopping: 0,
      Travel: 0,
      'Cafes & eating out': 8,
      Transport: 12,
      Delivery: 15,
    });
  });

  it('maps billing models for known merchants and asks about an unknown single charge', () => {
    expect(matchMerchant('Skillshare')?.billingModel).toBe('yearly');
    expect(matchMerchant('Outscraper')?.billingModel).toBe('usage');
    expect(matchMerchant('Airalo')?.billingModel).toBe('oneTime');
    expect(matchMerchant('Adobe Creative Cloud')?.billingModel).toBe('monthly');
    expect(matchMerchant('Wiener Stadtische Osig')?.billingModel).toBe('yearly');
    expect(matchMerchant('Uniqa Osiguranje')?.billingModel).toBe('yearly');
    expect(matchMerchant('electricity bill')?.billingModel).toBe('monthly');

    const result = detect([
      { date: '2026-10-01', merchantRaw: 'Skillshare', amount: 99, currency: 'EUR' },
      { date: '2026-10-02', merchantRaw: 'Outscraper', amount: 8, currency: 'EUR' },
      { date: '2026-10-03', merchantRaw: 'Airalo', amount: 11, currency: 'EUR' },
      { date: '2026-10-04', merchantRaw: 'Local Studio subscription charge', amount: 25, currency: 'EUR' },
    ], meta);
    expect(result.possibleRecurring.find((item) => item.merchantKey === 'skillshare')?.frequency).toBe('yearly');
    expect(result.possibleRecurring.find((item) => item.merchantKey === 'local studio charge')).toMatchObject({ frequency: 'monthly', estimate: true, askBilling: true });
    expect(result.possibleRecurring.some((item) => ['outscraper', 'airalo'].includes(item.merchantKey))).toBe(false);
    expect(result.habits.find((item) => item.merchantKey === 'outscraper')).toMatchObject({ billingModel: 'usage', frequency: 'oneTime' });
    expect(result.habits.find((item) => item.merchantKey === 'airalo')?.frequency).toBe('oneTime');
  });

  it('never calculates savings for pay-as-you-go or one-time merchants', () => {
    const result = detect([
      { date: '2026-10-01', merchantRaw: 'Outscraper', amount: 8, currency: 'EUR' },
      { date: '2026-10-03', merchantRaw: 'Outscraper', amount: 12, currency: 'EUR' },
      { date: '2026-10-04', merchantRaw: 'Airalo', amount: 11, currency: 'EUR' },
    ], meta);
    const items = result.habits.filter((found): found is typeof found & { frequency: Frequency } => found.frequency !== 'unknown').map((found, index): Item => ({ id: `transactional-${index}`, ...found, source: 'statement', estimate: found.estimate }));
    const audit = runAudit(items);
    expect(audit.potentialYearlySaving).toBe(0);
    expect(audit.recommendations.every((recommendation) => recommendation.potentialYearlySaving === 0)).toBe(true);
  });

  it('moves a recurring item with no charge in over 60 days to ended', () => {
    expect(result.ended.some((item) => item.merchantKey === 'google one')).toBe(true);
    expect(result.recurring.some((item) => item.merchantKey === 'google one')).toBe(false);
    expect(result.recurring.some((item) => item.merchantKey === 'netflix')).toBe(true);
  });

  it('uses the latest statement transaction as the default ended reference date', () => {
    const withoutExplicitDate = detect(fixture.transactions, meta);
    expect(withoutExplicitDate.recurring.some((item) => item.merchantKey === 'netflix')).toBe(true);
    expect(withoutExplicitDate.ended.some((item) => item.merchantKey === 'netflix')).toBe(false);
  });

  it('infers annual billing from description and a yearly interval', () => {
    const inferred = detect([
      { date: '2025-01-03', merchantRaw: 'Local annual plan', amount: 99.99, currency: 'EUR' },
      { date: '2026-01-04', merchantRaw: 'Local annual plan', amount: 99.99, currency: 'EUR' },
    ], meta);
    expect(inferred.recurring[0]).toMatchObject({ frequency: 'yearly', billingModel: 'yearly' });

    const intervalOnly = detect([
      { date: '2026-01-03', merchantRaw: 'Unknown Plan', amount: 25, currency: 'EUR' },
      { date: '2026-02-02', merchantRaw: 'Unknown Plan', amount: 25, currency: 'EUR' },
    ], meta);
    expect(intervalOnly.recurring[0]).toMatchObject({ frequency: 'monthly', billingModel: 'monthly', confidence: 0.9 });
  });

  it('uses common price points and multilingual plan words as offline hints', () => {
    const annualPrice = detect([{ date: '2026-09-01', merchantRaw: 'Local software subscription', amount: 119.88, currency: 'EUR' }], meta).possibleRecurring[0];
    expect(annualPrice).toMatchObject({ billingModel: 'yearly', frequency: 'yearly', confidence: 0.7, estimate: true, askBilling: true });
    const localizedAnnual = detect([{ date: '2026-09-01', merchantRaw: 'Local godišnja plan', amount: 100, currency: 'EUR' }], meta).possibleRecurring[0];
    expect(localizedAnnual).toMatchObject({ billingModel: 'yearly', frequency: 'yearly' });
    const topup = detect([{ date: '2026-09-01', merchantRaw: 'Mobile eSIM top-up', amount: 20, currency: 'EUR' }], meta);
    expect(topup.habits).toHaveLength(0);
    expect(topup.ignored.length).toBe(1);
    const prepaid = detect([{ date: '2026-09-01', merchantRaw: 'Local prepaid recharge', amount: 10, currency: 'EUR' }], meta);
    expect(prepaid.habits).toHaveLength(0);
    expect(prepaid.ignored).toHaveLength(1);
  });

  it('uses bank category values to classify recurring bills', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Currency', 'Direction', 'Status', 'Category'],
      ['2026-08-01', 'Local Utility', '-42.00', 'EUR', 'OUT', 'COMPLETED', 'Bills'],
      ['2026-09-01', 'Local Utility', '-43.00', 'EUR', 'OUT', 'COMPLETED', 'Bills'],
    ];
    const parsed = transactionsFromRows(rows);
    expect(parsed.transactions.every((transaction) => transaction.bankCategoryHint === 'bill')).toBe(true);
    expect(detect(parsed.transactions, parsed.meta).recurring[0]).toMatchObject({ category: 'bill', frequency: 'monthly' });
  });

  it('asks about at most the three priciest low-confidence single charges', () => {
    const transactions: Transaction[] = [
      { date: '2026-09-01', merchantRaw: 'Northwind Studio subscription charge', amount: 300, currency: 'EUR' },
      { date: '2026-09-02', merchantRaw: 'Cedar Cloud subscription charge', amount: 250, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'River School subscription charge', amount: 200, currency: 'EUR' },
      { date: '2026-09-04', merchantRaw: 'Small Atelier subscription charge', amount: 20, currency: 'EUR' },
    ];
    const candidates = detect(transactions, meta).possibleRecurring;
    expect(candidates.filter((candidate) => candidate.askBilling)).toHaveLength(3);
    expect(candidates.find((candidate) => candidate.name === 'Small Atelier Charge')).toMatchObject({ frequency: 'monthly', estimate: true });
  });

  it('sums same-day bill entries before averaging monthly charges', () => {
    const transactions: Transaction[] = [
      { date: '2026-08-01', merchantRaw: 'mts Mobile', amount: 20, currency: 'EUR' },
      { date: '2026-08-01', merchantRaw: 'mts Mobile', amount: 15, currency: 'EUR' },
      { date: '2026-09-01', merchantRaw: 'mts Mobile', amount: 36, currency: 'EUR' },
    ];
    const found = detect(transactions, meta);
    expect(found.recurring.find((item) => item.merchantKey === 'mts')?.price).toBe(35.5);
    expect(found.possibleDoubleCharges).toHaveLength(0);
  });

  it('ignores unrecognized single purchases but keeps known habits', () => {
    const singlePurchases: Transaction[] = [
      { date: '2026-09-01', merchantRaw: 'MOL fuel', amount: 46, currency: 'EUR' },
      { date: '2026-09-02', merchantRaw: 'City parking', amount: 4, currency: 'EUR' },
      { date: '2026-09-03', merchantRaw: 'Zeffy donation', amount: 12, currency: 'EUR' },
      { date: '2026-09-04', merchantRaw: 'Bex courier', amount: 5, currency: 'EUR' },
      { date: '2026-09-05', merchantRaw: 'Faturamati', amount: 8, currency: 'EUR' },
    ];
    const found = detect(singlePurchases, meta);
    expect(found.possibleRecurring).toHaveLength(0);
    expect(found.habits.map((item) => item.merchantKey)).toEqual(['bex courier']);
    expect(found.ignored.map((item) => item.merchantKey)).toEqual(expect.arrayContaining(['mol fuel', 'city parking', 'zeffy donation', 'faturamati']));
    expect(found.habits.find((item) => item.merchantKey === 'bex courier')?.category).toBe('habit');
  });

  it('requires three purchases per month before unknown shopping becomes a habit', () => {
    const two = detect([
      { date: '2026-09-01', merchantRaw: 'Cafe Central', amount: 8, currency: 'EUR', bankCategoryHint: 'eatingOut' },
      { date: '2026-09-05', merchantRaw: 'Cafe Central', amount: 10, currency: 'EUR', bankCategoryHint: 'eatingOut' },
    ], meta);
    expect(two.habits).toHaveLength(0);
    expect(two.ignored.some((item) => item.merchantKey === 'cafe central')).toBe(true);

    const three = detect([
      { date: '2026-09-01', merchantRaw: 'Cafe Central', amount: 8, currency: 'EUR', bankCategoryHint: 'eatingOut' },
      { date: '2026-09-05', merchantRaw: 'Cafe Central', amount: 10, currency: 'EUR', bankCategoryHint: 'eatingOut' },
      { date: '2026-09-09', merchantRaw: 'Cafe Central', amount: 12, currency: 'EUR', bankCategoryHint: 'eatingOut' },
    ], meta);
    expect(three.habits.find((item) => item.merchantKey === 'cafe central')).toMatchObject({ charges: 3, category: 'habit' });
  });

  it('separates an unknown merchant’s stable plan price from variable add-on purchases', () => {
    const found = detect([
      { date: '2026-06-01', merchantRaw: 'Upwork', amount: 19.99, currency: 'EUR' },
      { date: '2026-06-08', merchantRaw: 'Upwork', amount: 8, currency: 'EUR' },
      { date: '2026-07-01', merchantRaw: 'Upwork', amount: 19.99, currency: 'EUR' },
      { date: '2026-07-18', merchantRaw: 'Upwork', amount: 12, currency: 'EUR' },
      { date: '2026-08-01', merchantRaw: 'Upwork', amount: 19.99, currency: 'EUR' },
      { date: '2026-08-04', merchantRaw: 'Upwork', amount: 5, currency: 'EUR' },
    ], meta);
    expect(found.recurring.find((item) => item.merchantKey === 'upwork')).toMatchObject({
      price: 19.99, frequency: 'monthly', charges: 3, extraPurchases: { charges: 3, total: 25 },
    });
  });

  it('treats regional shops and variable monthly shopping as spending, not subscriptions', () => {
    const shops: Transaction[] = [
      { date: '2026-06-01', merchantRaw: 'Maxi', amount: 31, currency: 'EUR' },
      { date: '2026-07-01', merchantRaw: 'Maxi', amount: 42, currency: 'EUR' },
      { date: '2026-08-01', merchantRaw: 'Maxi', amount: 26, currency: 'EUR' },
      { date: '2026-06-03', merchantRaw: 'Apoteka Central', amount: 12, currency: 'EUR' },
      { date: '2026-07-03', merchantRaw: 'Apoteka Central', amount: 15, currency: 'EUR' },
      { date: '2026-08-03', merchantRaw: 'Apoteka Central', amount: 9, currency: 'EUR' },
      { date: '2026-06-04', merchantRaw: 'MOL fuel', amount: 50, currency: 'EUR' },
      { date: '2026-07-04', merchantRaw: 'MOL fuel', amount: 65, currency: 'EUR' },
      { date: '2026-08-04', merchantRaw: 'MOL fuel', amount: 42, currency: 'EUR' },
    ];
    const found = detect(shops, meta);
    expect(found.recurring).toHaveLength(0);
    expect(found.possibleRecurring).toHaveLength(0);
    expect(found.spendingByCategory).toMatchObject({ Groceries: 135, Transport: 157 });
  });

  it('keeps a single utility charge identified as a bill and never annualizes it', () => {
    const found = detect([{ date: '2026-08-01', merchantRaw: 'Infostan', amount: 45, currency: 'EUR' }], meta);
    expect(found.possibleRecurring.find((item) => item.merchantKey === 'infostan')).toMatchObject({
      category: 'bill', billingModel: 'monthly', frequency: 'monthly', charges: 1,
    });
  });
});

describe('known plan + add-ons', () => {
  it('keeps the plan price and moves other charges from the same merchant to extras', () => {
    const meta: ImportMeta = { displayCurrency: 'USD', dateFormat: 'iso', dateAmbiguous: false, monthsSpan: 3, redactedCategories: [], columnQuestions: [], columnCount: 3 };
    const rows = [
      { date: '2026-07-07', merchantRaw: 'Upwork', amount: 19.99, currency: 'USD' },
      { date: '2026-07-20', merchantRaw: 'Upwork', amount: 27.49, currency: 'USD' },
      { date: '2026-08-07', merchantRaw: 'Upwork', amount: 19.99, currency: 'USD' },
      { date: '2026-09-07', merchantRaw: 'Upwork', amount: 19.99, currency: 'USD' },
      { date: '2026-09-13', merchantRaw: 'Upwork', amount: 3, currency: 'USD' },
    ];
    const result = detect(rows, meta);
    const upwork = result.recurring.find((item) => item.merchantKey === 'upwork');
    expect(upwork?.frequency).toBe('monthly');
    expect(upwork?.price).toBe(19.99);
    expect(upwork?.extraPurchases).toEqual({ charges: 2, total: 30.49, label: 'Connects' });
  });
});
