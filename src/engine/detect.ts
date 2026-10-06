// Enough — recurring detection. Section 6 of ENOUGH_BRIEF.md.
// Rows (already parsed from CSV/Excel/PDF text) → redacted transactions →
// grouped by merchant → recurring / bill / habit, or flagged to ask.
// Pure: no I/O, no network. Detection needs no understanding of language.

import { classifyHeader, foldHeader, looksLikeHeaderRow, type ColumnRole } from './headers';
import { classifyByKeyword, isIgnoredMerchant, isPrivateTransfer } from './keywords';
import { inferColumns, isComplete as isCompletedValue, isOutgoing as isOutgoingValue, type ColumnOverrides, type ColumnQuestion } from './columns';
import { matchMerchant, normalizeMerchant } from './merchants';
import { detectDateFormat, normalizeDigits, parseAmount, parseDate, type DateFormat } from './parse';
import { redactDescription, redactedDescriptionCategories } from './redact';
import type { Category, DisplayCategory, Frequency, OverlapGroup, Transaction } from './types';

export type ImportMeta = {
  displayCurrency: string;
  dateFormat: DateFormat;
  dateAmbiguous: boolean;
  monthsSpan: number;
  redactedCategories: string[];
  columnQuestions: ColumnQuestion[];
  columnCount: number;
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
  transactions: Transaction[]; // redacted rows only; safe for the on-device preview
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

function findHeaderRow(rows: string[][]): number {
  const known = rows.findIndex(looksLikeHeaderRow);
  if (known !== -1) return known;
  for (let index = 0; index < Math.min(rows.length - 1, 8); index++) {
    const candidate = rows[index]!.filter((cell) => cell.trim());
    if (candidate.length < 3 || candidate.some((cell) => parseAmount(cell) !== null || /\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/.test(cell))) continue;
    const sample = rows.slice(index + 1, index + 6);
    const hasDateLikeValues = sample.some((row) => row.some((cell) => /\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/.test(cell)));
    const hasNumericValues = sample.some((row) => row.some((cell) => parseAmount(cell) !== null));
    if (hasDateLikeValues && hasNumericValues) return index;
  }
  return -1;
}

function requiredColumnQuestions(selection: ReturnType<typeof inferColumns>, count: number): ColumnQuestion[] {
  const columns = Array.from({ length: count }, (_, index) => index);
  const questions: ColumnQuestion[] = [];
  if (selection.date === undefined) questions.push({ role: 'date', candidates: columns });
  if (selection.amount === undefined) questions.push({ role: 'amount', candidates: columns });
  if (selection.merchant === undefined) questions.push({ role: 'merchant', candidates: columns });
  return questions;
}


/** Map already-split rows (arrays of cells) to redacted Transactions. */
export function transactionsFromRows(
  rows: string[][],
  fallbackCurrency = 'EUR',
  dateFormatOverride?: DateFormat,
  columnOverrides: ColumnOverrides = {},
): { transactions: Transaction[]; meta: ImportMeta } {
  const headerIdx = findHeaderRow(rows);
  const redactedCategories = new Set<string>();
  const header = headerIdx === -1 ? [] : rows[headerIdx]!;
  const dataRows = headerIdx === -1 ? rows : rows.slice(headerIdx + 1);
  const roles: ColumnRole[] = header.map(classifyHeader);
  const col = (role: ColumnRole) => roles.indexOf(role);
  const inferred = inferColumns(header, dataRows, columnOverrides);
  const columnCount = Math.max(header.length, ...dataRows.map((row) => row.length), 0);

  // Note which personal columns are always dropped, even when their contents
  // would otherwise look like a merchant name.
  roles.forEach((role) => {
    if (role === 'balance') redactedCategories.add('balance');
    if (role === 'holder') redactedCategories.add('name');
  });
  if (inferred.holderColumns.length) redactedCategories.add('name');
  header.forEach((h) => {
    const f = foldHeader(h);
    if (/iban|account number|racun|rachunek|konto/.test(f)) redactedCategories.add('IBAN');
    if (/holder|owner|account name|payer|payee|created by/.test(f)) redactedCategories.add('name');
    if (/address|adresa|adresse/.test(f)) redactedCategories.add('address');
  });

  const headerCurrency = header.map((h) => h.match(/\(([A-Z]{3})\)/)?.[1]).find(Boolean);
  if (inferred.questions.length || inferred.date === undefined || inferred.amount === undefined || inferred.merchant === undefined) {
    const dateFormat = dateFormatOverride ?? 'ambiguous';
    return {
      transactions: [],
      meta: {
        displayCurrency: headerCurrency ?? fallbackCurrency,
        dateFormat,
        dateAmbiguous: inferred.questions.some((question) => question.role === 'date') || dateFormat === 'ambiguous',
        monthsSpan: 0,
        redactedCategories: [...redactedCategories],
        columnQuestions: inferred.questions.length ? inferred.questions : requiredColumnQuestions(inferred, columnCount),
        columnCount,
      },
    };
  }

  const dateCol = inferred.date;
  const merchantCol = inferred.merchant;
  const descCol = col('description');
  const amountCol = inferred.amount;
  const currencyCol = inferred.currency;
  const directionCol = inferred.direction;
  const statusCol = inferred.status;

  // First pass: collect raw rows and the date strings for format detection.
  const raws: RawRow[] = [];
  const dateStrings: string[] = [];
  for (const r of dataRows) {
    if (directionCol !== undefined && !isOutgoingValue(r[directionCol] ?? '')) continue;
    if (statusCol !== undefined && !isCompletedValue(r[statusCol] ?? '')) continue;
    if (!r[dateCol]) continue;
    const rawDate = normalizeDigits((r[dateCol] ?? '').trim()); // Arabic/Thai digits → ASCII
    if (!/\d/.test(rawDate)) continue; // footer/blank lines
    let rawDesc = (r[merchantCol] ?? '').trim() || (descCol !== -1 ? (r[descCol] ?? '') : '');
    const fullDescription = descCol !== -1 ? (r[descCol] ?? '').trim() : '';
    if (fullDescription && isPrivateTransfer(normalizeMerchant(fullDescription))) rawDesc = fullDescription;
    let out: number | null = null;
    if (amountCol !== undefined) {
      const v = parseAmount(r[amountCol] ?? '');
      if (v !== null && (directionCol !== undefined ? v !== 0 : roles[amountCol] === 'debit' ? v > 0 : v < 0)) out = Math.abs(v);
    }
    const cur = (currencyCol !== undefined ? (r[currencyCol] ?? '').trim().toUpperCase() : '') || headerCurrency || fallbackCurrency;
    for (const category of redactedDescriptionCategories(rawDesc)) redactedCategories.add(category);
    raws.push({ date: rawDate, description: redactDescription(rawDesc), out, currency: cur });
    dateStrings.push(rawDate);
  }

  const dateFormat = dateFormatOverride && detectDateFormat(dateStrings) === 'ambiguous'
    ? dateFormatOverride
    : detectDateFormat(dateStrings);

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
      columnQuestions: [],
      columnCount,
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
    transactions,
    recurring,
    habits,
    mustAsk,
    ignored,
    needMoreData: meta.monthsSpan < 2,
  };
}

/** Convenience: rows → full detection result. */
export function runDetection(rows: string[][], fallbackCurrency = 'EUR', dateFormatOverride?: DateFormat, columnOverrides: ColumnOverrides = {}): DetectionResult {
  const { transactions, meta } = transactionsFromRows(rows, fallbackCurrency, dateFormatOverride, columnOverrides);
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
