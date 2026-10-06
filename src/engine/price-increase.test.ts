import { describe, expect, it } from 'vitest';
import { detect, type ImportMeta } from './detect';
import { toReportSummary } from './report';
import type { Item, Transaction } from './types';

const meta: ImportMeta = {
  displayCurrency: 'EUR', dateFormat: 'iso', dateAmbiguous: false, monthsSpan: 6,
  redactedCategories: [], columnQuestions: [], columnCount: 4,
};

describe('price increase visibility and email summaries', () => {
  it('detects a monthly increase, calculates the annual impact, and includes it in the report/reminder item', () => {
    const amounts = [15.99, 15.99, 15.99, 17.99, 17.99, 17.99];
    const transactions: Transaction[] = amounts.map((amount, index) => ({
      date: `2026-0${index + 1}-01`, merchantRaw: 'Netflix', amount, currency: 'EUR',
    }));
    const found = detect(transactions, meta, '2026-06-01').recurring.find((item) => item.name === 'Netflix');
    expect(found?.priceIncrease).toEqual({ from: 15.99, to: 17.99, yearlyIncrease: 24 });

    const item: Item = {
      id: 'netflix', name: 'Netflix', category: 'digital', displayCategory: 'Entertainment',
      price: found!.price, frequency: 'monthly', source: 'statement', estimate: false, currency: 'EUR',
      lastCharge: found!.lastCharge, nextCharge: found!.nextCharge, flaggedForReminder: true,
      priceIncrease: found!.priceIncrease,
    };
    const line = toReportSummary([item], [{
      itemId: item.id, verdict: 'keep', action: 'keep', reason: 'Keep', yearlyCost: 215.88, potentialYearlySaving: 0,
    }])[0];
    expect(line).toMatchObject({
      priceIncrease: { from: 15.99, to: 17.99, yearlyIncrease: 24 },
      nextCharge: found!.nextCharge,
    });
  });
});
