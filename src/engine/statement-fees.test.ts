import { describe, expect, it } from 'vitest';
import { computeStatementFees, type ImportMeta } from './detect';
import type { Transaction } from './types';

const meta = (monthsSpan: number): ImportMeta => ({
  displayCurrency: 'EUR', dateFormat: 'iso', dateAmbiguous: false, monthsSpan,
  redactedCategories: [], columnQuestions: [], columnCount: 4,
});

function tx(merchantRaw: string, amount: number, currency = 'EUR'): Transaction {
  return { date: '2026-01-01', merchantRaw, amount, currency };
}

describe('statement fees — exact fee rows, annualized (§7)', () => {
  it('sums foreign-exchange fee rows', () => {
    const rows = [tx('Wise FX fee', 3.5), tx('Currency conversion fee', 2.5), tx('Netflix', 13.99)];
    const fees = computeStatementFees(rows, meta(12));
    expect(fees.fxYearly).toBeCloseTo(6, 2);
    expect(fees.bankYearly).toBeUndefined();
  });

  it('sums bank fee rows in several languages', () => {
    const rows = [tx('Naknada za vođenje računa', 2), tx('Kontoführungsgebühr', 4), tx('Groceries', 40)];
    const fees = computeStatementFees(rows, meta(12));
    expect(fees.bankYearly).toBeCloseTo(6, 2);
  });

  it('annualizes a short statement up to a year', () => {
    const rows = [tx('account fee', 5)];
    const fees = computeStatementFees(rows, meta(6)); // one €5 fee over 6 months → ~€10/yr
    expect(fees.bankYearly).toBeCloseTo(10, 2);
  });

  it('ignores refunds (money in) and non-fee rows', () => {
    const rows = [tx('fx fee refund', -3), tx('Spotify', 10.99)];
    expect(computeStatementFees(rows, meta(12))).toEqual({});
  });
});
