// Enough — fixed currency conversion table. Section 6 of ENOUGH_BRIEF.md.
// Updated at each release. Rates are "to 1 EUR" and conversions are marked
// "approx." wherever they are used. Not a live feed on purpose: the engine
// makes no network calls.

/**
 * Units of the currency per 1 EUR. As of 2026-09-27. Covers the ~40 most
 * traded currencies plus regional ones Enough needs (BAM, RSD). Approximate
 * and fixed at release; an unknown currency is shown unconverted, never guessed.
 */
export const RATES_PER_EUR: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  JPY: 161.0,
  GBP: 0.85,
  CNY: 7.68,
  AUD: 1.63,
  CAD: 1.47,
  CHF: 0.94,
  HKD: 8.43,
  SGD: 1.45,
  SEK: 11.3,
  KRW: 1470.0,
  NOK: 11.6,
  NZD: 1.78,
  INR: 90.2,
  MXN: 19.8,
  TWD: 34.8,
  ZAR: 19.6,
  BRL: 5.9,
  DKK: 7.46,
  PLN: 4.28,
  THB: 39.0,
  ILS: 4.0,
  IDR: 17300.0,
  CZK: 25.2,
  AED: 3.97,
  TRY: 36.5,
  HUF: 395.0,
  CLP: 1010.0,
  SAR: 4.05,
  PHP: 61.0,
  MYR: 5.05,
  COP: 4400.0,
  RUB: 100.0,
  RON: 4.97,
  // Regional currencies Enough serves directly:
  BAM: 1.95583, // Bosnia — pegged to EUR
  RSD: 117.2, // Serbian dinar
  BGN: 1.95583, // Bulgaria — pegged to EUR
  UAH: 45.0,
  HRK: 7.5345, // legacy; HR is on EUR since 2023
};

/** Convert an amount from `from` currency into `to` currency. Returns undefined
 *  if either currency is unknown (caller keeps the original, unconverted). */
export function convert(amount: number, from: string, to: string): number | undefined {
  const f = RATES_PER_EUR[from.toUpperCase()];
  const t = RATES_PER_EUR[to.toUpperCase()];
  if (f === undefined || t === undefined) return undefined;
  const inEur = amount / f;
  return Math.round((inEur * t + Number.EPSILON) * 100) / 100;
}
