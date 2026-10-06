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
