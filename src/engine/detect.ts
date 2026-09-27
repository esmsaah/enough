// Enough — recurring detection. Section 6 of ENOUGH_BRIEF.md.
// Rows (already parsed from CSV/Excel/PDF text) → redacted transactions →
// grouped by merchant → recurring / bill / habit, or flagged to ask.
// Pure: no I/O, no network. Detection needs no understanding of language.

import { classifyHeader, foldHeader, looksLikeHeaderRow, type ColumnRole } from './headers';
import { classifyByKeyword, isIgnoredMerchant, isPrivateTransfer } from './keywords';
import { matchMerchant, normalizeMerchant } from './merchants';
import { detectDateFormat, normalizeDigits, parseAmount, parseDate, type DateFormat } from './parse';
import { redactDescription } from './redact';
import type { Category, DisplayCategory, Frequency, OverlapGroup, Transaction } from './types';

export type ImportMeta = {
  displayCurrency: string;
  dateFormat: DateFormat;
  dateAmbiguous: boolean;
  monthsSpan: number;
  redactedCategories: string[];
};

export type DetectedItem = {
  merchantKey: string;
  name: string;
  category: Category;
  displayCategory: DisplayCategory;
  overlapGroup?: OverlapGroup;
  frequency: Frequency;
  price: number; // per period, in display currency
  currency: string;
  approxConverted?: boolean;
  lastCharge: string;
  nextCharge?: string;
  charges: number;
};

export type DetectionResult = {
  meta: ImportMeta;
  recurring: DetectedItem[];
  habits: DetectedItem[];
  mustAsk: Array<{ merchantKey: string; name: string; reason: string }>;
  ignored: string[];
  needMoreData: boolean; // fewer than 2 months of data
};

const INTERVALS: Array<{ freq: Frequency; days: number; tol: number }> = [
  { freq: 'weekly', days: 7, tol: 4 },
  { freq: 'monthly', days: 30, tol: 4 },
  { freq: 'quarterly', days: 91, tol: 10 },
  { freq: 'yearly', days: 365, tol: 10 },
];

// ---------------------------------------------------------------------------
// Rows → redacted transactions
// ---------------------------------------------------------------------------

type RawRow = { date: string; description: string; out: number | null; currency: string };

/** Map already-split rows (arrays of cells) to redacted Transactions. */
export function transactionsFromRows(
  rows: string[][],
  fallbackCurrency = 'EUR',
): { transactions: Transaction[]; meta: ImportMeta } {
  const headerIdx = rows.findIndex((r) => looksLikeHeaderRow(r));
  const redactedCategories = new Set<string>();
  if (headerIdx === -1) {
    return {
      transactions: [],
      meta: { displayCurrency: fallbackCurrency, dateFormat: 'ambiguous', dateAmbiguous: true, monthsSpan: 0, redactedCategories: [] },
    };
  }

  const header = rows[headerIdx]!;
  const roles: ColumnRole[] = header.map(classifyHeader);
  const col = (role: ColumnRole) => roles.indexOf(role);
  const dateCol = col('date') !== -1 ? col('date') : col('valueDate');
  // All clean merchant columns, exact "merchant" header first (Wise has both a
  // "Merchant" and a beneficiary column; either may be the filled one per row).
  const merchantCols = roles
    .map((r, i) => (r === 'merchant' ? i : -1))
    .filter((i) => i !== -1)
    .sort((a, b) => (foldHeader(header[b]!) === 'merchant' ? 1 : 0) - (foldHeader(header[a]!) === 'merchant' ? 1 : 0));
  const descCol = col('description'); // fallback / used when no merchant cell is filled
  const amountCol = col('amount');
  const debitCol = col('debit');
  const creditCol = col('credit');
  const currencyCol = col('currency');
  void creditCol; // credits (money in) are intentionally ignored

  // Note which personal columns we are dropping (for the "What we keep" screen).
  roles.forEach((r) => {
    if (r === 'balance') redactedCategories.add('balance');
    if (r === 'holder') redactedCategories.add('name');
  });
  header.forEach((h) => {
    const f = h.toLowerCase();
    if (/iban|account number|racun|rachunek|konto/.test(f)) redactedCategories.add('IBAN');
    if (/holder|name|ime|primatelj|payer|payee/.test(f)) redactedCategories.add('name');
    if (/address|adresa|adresse/.test(f)) redactedCategories.add('address');
  });

  // Currency may be embedded in the amount header, e.g. "Amount (EUR)".
  const headerCurrency = header.map((h) => h.match(/\(([A-Z]{3})\)/)?.[1]).find(Boolean);

  // First pass: collect raw rows and the date strings for format detection.
  const raws: RawRow[] = [];
  const dateStrings: string[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (dateCol === -1 || !r[dateCol]) continue;
    const rawDate = normalizeDigits((r[dateCol] ?? '').trim()); // Arabic/Thai digits → ASCII
    if (!/\d/.test(rawDate)) continue; // footer/blank lines
    // Prefer the clean merchant column; fall back to the description when the
    // merchant cell is empty (e.g. Wise transfers have no Merchant value).
    let merchantCell = '';
    for (const mc of merchantCols) {
      const v = (r[mc] ?? '').trim();
      if (v) { merchantCell = v; break; }
    }
    const rawDesc = merchantCell || (descCol !== -1 ? (r[descCol] ?? '') : '');
    let out: number | null = null;
    if (amountCol !== -1) {
      const v = parseAmount(r[amountCol] ?? '');
      if (v !== null && v < 0) out = Math.abs(v); // single signed column: out = negative
    }
    if (out === null && debitCol !== -1) {
      const v = parseAmount(r[debitCol] ?? '');
      if (v !== null && v !== 0) out = Math.abs(v);
    }
    // ignore credits (money in): if only a credit is present, out stays null
    const cur = (currencyCol !== -1 ? (r[currencyCol] ?? '').trim().toUpperCase() : '') || headerCurrency || fallbackCurrency;
    if (redactDescription(rawDesc) !== rawDesc) redactedCategories.add('card number');
    raws.push({ date: rawDate, description: redactDescription(rawDesc), out, currency: cur });
    dateStrings.push(rawDate);
  }

  const dateFormat = detectDateFormat(dateStrings);

  const transactions: Transaction[] = [];
  for (const r of raws) {
    if (r.out === null) continue; // only money going out is kept
    const iso = parseDate(r.date, dateFormat);
    if (!iso) continue;
    transactions.push({ date: iso, merchantRaw: r.description, amount: r.out, currency: r.currency });
  }

  const displayCurrency = mostCommon(transactions.map((t) => t.currency)) ?? headerCurrency ?? fallbackCurrency;
  const monthsSpan = spanMonths(transactions.map((t) => t.date));

  return {
    transactions,
    meta: {
      displayCurrency,
      dateFormat,
      dateAmbiguous: dateFormat === 'ambiguous',
      monthsSpan,
      redactedCategories: [...redactedCategories],
    },
  };
}

// ---------------------------------------------------------------------------
// Transactions → detected items
// ---------------------------------------------------------------------------

export function detect(transactions: Transaction[], meta: ImportMeta): DetectionResult {
  const groups = new Map<string, Transaction[]>();
  const nameFor = new Map<string, string>();

  for (const t of transactions) {
    const normalized = normalizeMerchant(t.merchantRaw);
    // A private transfer is never matched to a merchant, even if a person's
    // name coincides with a brand ("Transfer to Claude Dupont" is not Claude).
    const info = isPrivateTransfer(normalized) ? undefined : matchMerchant(t.merchantRaw);
    const key = info?.merchantKey ?? normalized;
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
      nameFor.set(key, info?.name ?? titleCase(normalized));
    }
    groups.get(key)!.push(t);
  }

  const recurring: DetectedItem[] = [];
  const habits: DetectedItem[] = [];
  const mustAsk: DetectionResult['mustAsk'] = [];
  const ignored: string[] = [];

  for (const [key, txs] of groups) {
    const normalized = normalizeMerchant(txs[0]!.merchantRaw);

    // Transfers to private people are never auto-classified.
    if (isPrivateTransfer(normalized)) {
      mustAsk.push({ merchantKey: key, name: nameFor.get(key)!, reason: 'transfer to a private person, never auto-classified' });
      continue;
    }
    const info = matchMerchant(txs[0]!.merchantRaw);
    // Supermarkets and fuel are ignored as habits unless the person adds them.
    if (!info && isIgnoredMerchant(normalized)) {
      ignored.push(key);
      continue;
    }

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((t) => t.date);
    const amounts = sorted.map((t) => t.amount);
    const gaps = dayGaps(dates);
    const last = dates[dates.length - 1]!;
    const currency = meta.displayCurrency;

    const cat = categoryOf(info, normalized);

    const base = {
      merchantKey: key,
      name: nameFor.get(key)!,
      category: cat.category,
      displayCategory: cat.displayCategory,
      overlapGroup: info?.overlapGroup,
      currency,
      lastCharge: last,
    };

    // Habit: same merchant 3+ times a month at irregular amounts.
    if (cat.category === 'habit' || perMonthCount(dates) >= 3) {
      if (sorted.length >= 3 && !isRegular(gaps)) {
        habits.push({ ...base, category: 'habit', frequency: 'monthly', price: round2(monthlyAverage(amounts, dates)), charges: sorted.length });
        continue;
      }
    }

    if (sorted.length < 2) continue; // can't confirm a rhythm from one charge

    const freq = frequencyFromGaps(gaps);
    if (!freq) {
      // 2+ charges but no clean rhythm and not a habit → skip (surfaced later)
      continue;
    }

    const fixed = amountsWithin(amounts, 0.05);
    // A bill is either a known/keyword bill, or an UNKNOWN merchant whose
    // monthly amount varies. A known digital/membership item with varying
    // amounts is a price increase, not a bill — keep it and use the latest price.
    const isBill = base.category === 'bill' || (base.category === 'other' && !fixed && freq === 'monthly');
    const price = isBill ? mean(amounts) : amounts[amounts.length - 1]!; // bills: average; else latest price
    recurring.push({
      ...base,
      category: isBill ? 'bill' : base.category,
      displayCategory: isBill && base.category !== 'bill' ? 'Bills & Utilities' : base.displayCategory,
      frequency: freq,
      price: round2(price),
      nextCharge: addDays(last, INTERVALS.find((i) => i.freq === freq)!.days),
      charges: sorted.length,
    });
  }

  return {
    meta,
    recurring,
    habits,
    mustAsk,
    ignored,
    needMoreData: meta.monthsSpan < 2,
  };
}

/** Convenience: rows → full detection result. */
export function runDetection(rows: string[][], fallbackCurrency = 'EUR'): DetectionResult {
  const { transactions, meta } = transactionsFromRows(rows, fallbackCurrency);
  return detect(transactions, meta);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function categoryOf(
  info: ReturnType<typeof matchMerchant>,
  normalized: string,
): { category: Category; displayCategory: DisplayCategory } {
  if (info) return { category: info.category, displayCategory: info.displayCategory };
  const kw = classifyByKeyword(normalized);
  if (kw) return kw;
  return { category: 'other', displayCategory: 'Other' };
}

function dayGaps(sortedDates: string[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push(daysBetween(sortedDates[i - 1]!, sortedDates[i]!));
  }
  return gaps;
}

function frequencyFromGaps(gaps: number[]): Frequency | null {
  if (gaps.length === 0) return null;
  const m = median(gaps);
  for (const { freq, days, tol } of INTERVALS) {
    if (Math.abs(m - days) <= tol) return freq;
  }
  return null;
}

function isRegular(gaps: number[]): boolean {
  return frequencyFromGaps(gaps) !== null && cv(gaps) < 0.25;
}

function amountsWithin(amounts: number[], pct: number): boolean {
  if (amounts.length < 2) return true;
  const avg = mean(amounts);
  if (avg === 0) return true;
  return amounts.every((a) => Math.abs(a - avg) / avg <= pct);
}

function perMonthCount(dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return dates.length / Math.max(1, months.size);
}

function monthlyAverage(amounts: number[], dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7))).size || 1;
  return amounts.reduce((s, a) => s + a, 0) / months;
}

function spanMonths(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  return daysBetween(sorted[0]!, sorted[sorted.length - 1]!) / 30;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function cv(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m;
}

function mostCommon(xs: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [x, n] of counts) if (n > bestN) [best, bestN] = [x, n];
  return best;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
