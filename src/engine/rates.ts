// Enough — fixed currency conversion table. Section 6 of ENOUGH_BRIEF.md.
// Updated at each release. Rates are "to 1 EUR" and conversions are marked
// "approx." wherever they are used. Not a live feed on purpose: the engine
// makes no network calls.

/** Units of the currency per 1 EUR. As of 2026-09-27. */
export const RATES_PER_EUR: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  RSD: 117.2, // Serbian dinar
  BAM: 1.95583, // Bosnia — pegged to EUR
  HRK: 7.5345, // legacy, HR is on EUR since 2023
  CHF: 0.94,
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
