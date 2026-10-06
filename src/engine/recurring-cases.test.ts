import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detect, type ImportMeta } from './detect';
import type { Transaction } from './types';

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
    expect(result.ignored).toContain('aroma marketi');
    expect(result.ignored).toContain('idea');
  });

  it('surfaces known one-charge subscriptions and bills as possible recurring', () => {
    for (const transaction of fixture.singleCharges) {
      const candidate = detect([transaction], meta, fixture.asOf).possibleRecurring[0];
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
    expect(result.ignored).toEqual(['lidl']);
    expect(result.ignored.every((merchantKey) => merchantKey.trim().length > 0)).toBe(true);
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
});
