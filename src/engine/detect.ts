// Enough — recurring detection. Section 6 of ENOUGH_BRIEF.md.
// Rows (already parsed from CSV/Excel/PDF text) → redacted transactions →
// grouped by merchant → recurring / bill / habit, or flagged to ask.
// Pure: no I/O, no network. Detection needs no understanding of language.

import { classifyHeader, foldHeader, looksLikeHeaderRow, type ColumnRole } from './headers';
import { classifyByKeyword, isIgnoredMerchant, isPrivateTransfer } from './keywords';
import { inferColumns, isComplete as isCompletedValue, isOutgoing as isOutgoingValue, type ColumnOverrides, type ColumnQuestion } from './columns';
import { matchMerchant, normalizeMerchant } from './merchants';
import { convert } from './rates';
import { detectDateFormat, normalizeDigits, parseAmount, parseDate, type DateFormat } from './parse';
import { redactDescription, redactedDescriptionCategories } from './redact';
import type { BankCategoryHint, BillingModel, Category, DetectedFrequency, DisplayCategory, Frequency, OverlapGroup, Transaction } from './types';

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
  frequency: DetectedFrequency;
  billingModel?: BillingModel;
  bankCategoryHint?: BankCategoryHint;
  confidence: number;
  estimate: boolean;
  askBilling?: boolean;
  possibleDuplicateCharge?: { amount: number; firstCharge: string; secondCharge: string };
  cancelUrl?: string;
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
  possibleRecurring: DetectedItem[];
  ended: DetectedItem[];
  possibleDoubleCharges: PossibleDoubleCharge[];
  mustAsk: Array<{ merchantKey: string; name: string; reason: string }>;
  ignored: Array<{ merchantKey: string; name: string }>;
  needMoreData: boolean; // fewer than 2 months of data
};

export type PossibleDoubleCharge = {
  merchantKey: string;
  name: string;
  amount: number;
  currency: string;
  firstCharge: string;
  secondCharge: string;
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

type RawRow = { date: string; description: string; out: number | null; currency: string; billingModelHint?: BillingModel; bankCategoryHint?: BankCategoryHint };

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
  const categoryCol = header.findIndex((cell) => /\b(category|kategorija|kategorie|categorie|categoria|kategoria|kategori)\b/.test(foldHeader(cell)));

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
    const bankCategoryHint = categoryCol === -1 ? undefined : classifyBankCategory(r[categoryCol] ?? '');
    const billingModelHint = inferBillingModelHint(rawDesc)?.model;
    raws.push({ date: rawDate, description: redactDescription(rawDesc), out, currency: cur, ...(billingModelHint ? { billingModelHint } : {}), ...(bankCategoryHint ? { bankCategoryHint } : {}) });
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
    transactions.push({ date: iso, merchantRaw: r.description, amount: r.out, currency: r.currency, ...(r.billingModelHint ? { billingModelHint: r.billingModelHint } : {}), ...(r.bankCategoryHint ? { bankCategoryHint: r.bankCategoryHint } : {}) });
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

export function detect(transactions: Transaction[], meta: ImportMeta, asOf = latestTransactionDate(transactions)): DetectionResult {
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
  const possibleRecurring: DetectedItem[] = [];
  const ended: DetectedItem[] = [];
  const mustAsk: DetectionResult['mustAsk'] = [];
  const ignored: Array<{ merchantKey: string; name: string }> = [];

  for (const [key, txs] of groups) {
    const normalized = normalizeMerchant(txs[0]!.merchantRaw);

    // Transfers to private people are never auto-classified.
    if (isPrivateTransfer(normalized)) {
      mustAsk.push({ merchantKey: key, name: nameFor.get(key)!, reason: 'transfer to a private person, never auto-classified' });
      continue;
    }
    const info = matchMerchant(txs[0]!.merchantRaw);
    const descriptionGuess = mostCommon(txs.map((transaction) => inferBillingModelHint(transaction.merchantRaw)?.model).filter((value): value is BillingModel => !!value));
    const statementModel = mostCommon(txs.map((transaction) => transaction.billingModelHint).filter((value): value is BillingModel => !!value));
    const bankCategory = mostCommon(txs.map((transaction) => transaction.bankCategoryHint).filter((value): value is BankCategoryHint => !!value));
    // Supermarkets and fuel are ignored as habits unless the person adds them.
    if (!info && isIgnoredMerchant(normalized)) {
      if (key.trim()) ignored.push({ merchantKey: key, name: nameFor.get(key)! });
      continue;
    }

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((t) => t.date);
    const currency = meta.displayCurrency;
    const converted = sorted.map((t) => convert(t.amount, t.currency, currency));
    const amounts = sorted.map((t, index) => converted[index] ?? t.amount);
    const approxConverted = sorted.some((t, index) => t.currency !== currency && converted[index] !== undefined);
    const priceGuess = inferPriceModel(amounts);
    const intervalGuess = frequencyFromGaps(dayGaps(dates));
    const intervalModel: BillingModel | undefined = intervalGuess === 'monthly' ? 'monthly' : intervalGuess === 'yearly' ? 'yearly' : undefined;
    const billingGuess = info?.billingModel ?? statementModel ?? descriptionGuess ?? bankCategoryModel(bankCategory) ?? priceGuess?.model ?? intervalModel;
    const confidence = info ? 0.98 : statementModel ? 0.88 : descriptionGuess ? 0.84 : bankCategory ? 0.78 : intervalModel ? 0.9 : priceGuess?.confidence ?? 0.35;
    const last = dates[dates.length - 1]!;
    const cat = categoryOf(info, normalized, bankCategory, billingGuess);

    // Multiple entries for a utility on one date represent that day's total,
    // not separate observations in the recurring-price average.
    const observations = cat.category === 'bill' ? sumBillDayEntries(dates, amounts) : { dates, amounts };
    const observedDates = observations.dates;
    const observedAmounts = observations.amounts;
    const gaps = dayGaps(observedDates);

    const base = {
      merchantKey: key,
      name: nameFor.get(key)!,
      category: cat.category,
      displayCategory: cat.displayCategory,
      overlapGroup: info?.overlapGroup,
      billingModel: billingGuess,
      cancelUrl: info?.cancelUrl,
      confidence,
      estimate: confidence < 0.8,
      currency,
      approxConverted,
      lastCharge: last,
      possibleDuplicateCharge: findPossibleDoubleCharges(txs).map((charge) => ({ amount: convert(charge.amount, charge.currency, currency) ?? charge.amount, firstCharge: charge.firstCharge, secondCharge: charge.secondCharge }))[0],
    };

    const canBeRecurring = cat.category === 'digital' || cat.category === 'membership' || cat.category === 'bill';
    const fixed = amountsWithin(observedAmounts, 0.05, 0.05) || hasSinglePriceStep(observedAmounts);
    if (billingGuess === 'usage' || billingGuess === 'oneTime') {
      habits.push(transactionalItem(base, observedAmounts, observedDates, billingGuess));
      continue;
    }
    if (sorted.length < 2) {
      if (canBeRecurring || !info) {
        const likelyFrequency: DetectedFrequency = billingGuess === 'monthly' || billingGuess === 'yearly' ? billingGuess : 'unknown';
        possibleRecurring.push(candidateItem(base, observedAmounts, sorted.length, likelyFrequency));
      }
      continue;
    }

    // Transactional merchants are never subscriptions, even when their
    // purchase dates happen to repeat monthly or weekly.
    if (cat.category === 'habit') {
      habits.push({ ...base, category: 'habit', frequency: 'monthly', price: round2(monthlyAverage(observedAmounts, observedDates)), charges: sorted.length });
      continue;
    }

    // Irregular unknown spend at one merchant is useful as a habit when there
    // are several purchases in the same month, but it is never called a bill.
    if (cat.category === 'other' && sorted.length >= 3 && perMonthCount(dates) >= 2 && !fixed) {
      habits.push({ ...base, category: 'habit', frequency: 'monthly', price: round2(monthlyAverage(observedAmounts, observedDates)), charges: sorted.length });
      continue;
    }

    const freq = frequencyFromGaps(gaps);
    if (!freq) {
      if (canBeRecurring && (cat.category === 'bill' || fixed)) possibleRecurring.push(candidateItem(base, observedAmounts, sorted.length, 'unknown'));
      continue;
    }

    if (!fixed && base.category !== 'bill') continue;
    const isBill = base.category === 'bill';
    const price = isBill ? mean(observedAmounts) : observedAmounts[observedAmounts.length - 1]!; // bills: average; else latest price
    const detected: DetectedItem = {
      ...base,
      category: isBill ? 'bill' : base.category,
      displayCategory: isBill && base.category !== 'bill' ? 'Bills & Utilities' : base.displayCategory,
      frequency: freq,
      price: round2(price),
      nextCharge: addDays(last, INTERVALS.find((i) => i.freq === freq)!.days),
      charges: sorted.length,
      confidence: billingGuess ? Math.max(confidence, 0.8) : 0.86,
      estimate: confidence < 0.8,
      approxConverted,
      bankCategoryHint: bankCategory,
    };
    const expectedInterval = INTERVALS.find((interval) => interval.freq === freq)!;
    const endedAfterDays = Math.max(60, expectedInterval.days + expectedInterval.tol);
    if (daysBetween(last, asOf) > endedAfterDays) ended.push(detected);
    else recurring.push(detected);
  }

  const lowConfidenceCandidates = possibleRecurring
    .filter((item) => item.confidence < 0.75)
    .sort((a, b) => predictedYearlyCost(b) - predictedYearlyCost(a));
  const askSet = new Set(lowConfidenceCandidates.slice(0, 3).map((item) => item.merchantKey));
  for (const item of possibleRecurring) {
    if (askSet.has(item.merchantKey)) item.askBilling = true;
    else if (item.frequency === 'unknown') item.frequency = 'monthly';
  }

  return {
    meta,
    transactions,
    recurring,
    habits,
    possibleRecurring,
    ended,
    possibleDoubleCharges: findPossibleDoubleCharges(transactions),
    mustAsk,
    ignored,
    needMoreData: meta.monthsSpan < 2,
  };
}

function latestTransactionDate(transactions: Transaction[]): string {
  return transactions.reduce((latest, transaction) => transaction.date > latest ? transaction.date : latest, '0000-00-00');
}

/** Convenience: rows → full detection result. */
export function runDetection(rows: string[][], fallbackCurrency = 'EUR', dateFormatOverride?: DateFormat, columnOverrides: ColumnOverrides = {}, asOf?: string): DetectionResult {
  const { transactions, meta } = transactionsFromRows(rows, fallbackCurrency, dateFormatOverride, columnOverrides);
  return asOf ? detect(transactions, meta, asOf) : detect(transactions, meta);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function categoryOf(
  info: ReturnType<typeof matchMerchant>,
  normalized: string,
  bankCategory?: BankCategoryHint,
  billingModel?: BillingModel,
): { category: Category; displayCategory: DisplayCategory } {
  if (info) return { category: info.category, displayCategory: info.displayCategory };
  if (billingModel === 'usage' || billingModel === 'oneTime') return { category: 'habit', displayCategory: 'Other' };
  if (bankCategory === 'bill') return { category: 'bill', displayCategory: 'Bills & Utilities' };
  if (bankCategory === 'shopping' || bankCategory === 'eatingOut') return { category: 'habit', displayCategory: bankCategory === 'shopping' ? 'Shopping & Delivery' : 'Other' };
  const kw = classifyByKeyword(normalized);
  if (kw) return kw;
  return { category: 'other', displayCategory: 'Other' };
}

function classifyBankCategory(raw: string): BankCategoryHint | undefined {
  const value = foldHeader(raw);
  if (/\b(bill|bills|utilities|utility|invoice|racun|komunal|telecom|telekom|eating out|dining|restaurant|hrana|restoran|shopping|retail|groceries|kupovina|trgovina|food)\b/.test(value)) {
    if (/\b(bill|bills|utilities|utility|invoice|racun|komunal|telecom|telekom)\b/.test(value)) return 'bill';
    if (/\b(eating out|dining|restaurant|hrana|restoran)\b/.test(value)) return 'eatingOut';
    return 'shopping';
  }
  return undefined;
}

function bankCategoryModel(category?: BankCategoryHint): BillingModel | undefined {
  if (category === 'bill') return 'monthly';
  if (category === 'shopping' || category === 'eatingOut') return 'usage';
  return undefined;
}

function inferBillingModelHint(raw: string): { model: BillingModel; confidence: number } | undefined {
  const value = foldHeader(raw);
  if (/\b(e.?sim|top.?up|one.?time|one time|einmalig|jednorazn|jednokrat|recarga unica|recharge unique)\b/.test(value)) return { model: 'oneTime', confidence: 0.88 };
  if (/\b(pay as you go|usage|prepaid|per use|metered|dopuna|prepaid|aufladung|recarga)\b/.test(value)) return { model: 'usage', confidence: 0.82 };
  if (/\b(annual|annually|yearly|yearly renewal|year plan|jahres|jahrlich|godi[nš]nj[aie]|godisnj[aie]|anual|annuel|annuale|anualidad|roczna|roczne|yillik|ежегодн)\b/.test(value)) return { model: 'yearly', confidence: 0.86 };
  if (/\b(monthly|month plan|mjesecn[aie]|mjese[cč]n[aie]|monatlich|mensual|mensuel|mensile|mensualidad|miesieczn[aie]|aylik|ежемесячн)\b/.test(value)) return { model: 'monthly', confidence: 0.84 };
  if (/\b(subscription|subscr|renewal|membership|pretplata|pretplate|abonnement|abo|abbonamento|suscripcion)\b/.test(value)) return { model: 'monthly', confidence: 0.72 };
  return undefined;
}

function inferPriceModel(amounts: number[]): { model: 'monthly' | 'yearly'; confidence: number } | undefined {
  if (amounts.length !== 1) return undefined;
  const amount = amounts[0]!;
  if (amount >= 40 && (Math.abs(amount - 99.99) < 1 || Math.abs(amount - 119.88) < 2 || Math.abs(amount - 149.99) < 2 || Math.abs(amount - 199.99) < 2 || Math.abs(amount - 59.88) < 1 || Math.abs(amount - 71.88) < 1)) {
    return { model: 'yearly', confidence: 0.7 };
  }
  if (amount > 0 && amount <= 35 && Math.abs((amount * 100) % 1) < 0.01) return { model: 'monthly', confidence: 0.55 };
  return undefined;
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

function amountsWithin(amounts: number[], pct: number, step = 0): boolean {
  if (amounts.length < 2) return true;
  const avg = mean(amounts);
  if (avg === 0) return true;
  const tolerance = Math.max(Math.abs(avg) * pct, step);
  return amounts.every((a) => Math.abs(a - avg) <= tolerance);
}

// A merchant may change its tariff once during the statement window. Treat a
// single transition between two independently stable price levels as one
// price step (for example, Spotify's annual price increase), while rejecting
// the repeated arbitrary amounts typical of shops and cafes.
function hasSinglePriceStep(amounts: number[]): boolean {
  if (amounts.length < 4) return false;
  for (let split = 2; split <= amounts.length - 2; split++) {
    if (amountsWithin(amounts.slice(0, split), 0.05, 0.05)
      && amountsWithin(amounts.slice(split), 0.05, 0.05)) return true;
  }
  return false;
}

function candidateItem(
  base: Omit<DetectedItem, 'frequency' | 'price' | 'charges'>,
  amounts: number[],
  charges: number,
  frequency: DetectedFrequency = 'unknown',
): DetectedItem {
  return { ...base, frequency, price: round2(median(amounts)), charges, confidence: base.confidence ?? 0.35, estimate: (base.confidence ?? 0.35) < 0.8 };
}

function transactionalItem(
  base: Omit<DetectedItem, 'frequency' | 'price' | 'charges'>,
  amounts: number[],
  dates: string[],
  billingModel: 'usage' | 'oneTime',
): DetectedItem {
  return {
    ...base,
    category: 'habit',
    frequency: billingModel === 'oneTime' ? 'oneTime' : 'monthly',
    price: round2(billingModel === 'oneTime' ? mean(amounts) : monthlyAverage(amounts, dates)),
    charges: amounts.length,
  };
}

function findPossibleDoubleCharges(transactions: Transaction[]): PossibleDoubleCharge[] {
  const groups = new Map<string, Array<Transaction & { merchantKey: string; name: string }>>();
  for (const transaction of transactions) {
    const normalized = normalizeMerchant(transaction.merchantRaw);
    const info = isPrivateTransfer(normalized) ? undefined : matchMerchant(transaction.merchantRaw);
    const category = categoryOf(info, normalized, transaction.bankCategoryHint).category;
    if (category !== 'digital' && category !== 'bill') continue;
    const merchantKey = info?.merchantKey ?? normalized;
    if (!merchantKey.trim()) continue;
    const group = groups.get(merchantKey) ?? [];
    group.push({ ...transaction, merchantKey, name: info?.name ?? titleCase(normalized) });
    groups.set(merchantKey, group);
  }
  const found: PossibleDoubleCharge[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const first = sorted[i]!;
        const second = sorted[j]!;
        const gap = daysBetween(first.date, second.date);
        if (gap > 7) break;
        if (gap === 0 && categoryOf(matchMerchant(first.merchantRaw), normalizeMerchant(first.merchantRaw), first.bankCategoryHint).category === 'bill') continue;
        if (gap < 0 || first.currency !== second.currency || Math.abs(first.amount - second.amount) > 0.05) continue;
        found.push({
          merchantKey: first.merchantKey,
          name: first.name,
          amount: round2((first.amount + second.amount) / 2),
          currency: first.currency,
          firstCharge: first.date,
          secondCharge: second.date,
        });
      }
    }
  }
  return found;
}

function perMonthCount(dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return dates.length / Math.max(1, months.size);
}

function monthlyAverage(amounts: number[], dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7))).size || 1;
  return amounts.reduce((s, a) => s + a, 0) / months;
}

function sumBillDayEntries(dates: string[], amounts: number[]): { dates: string[]; amounts: number[] } {
  const byDay = new Map<string, number>();
  dates.forEach((date, index) => byDay.set(date, (byDay.get(date) ?? 0) + amounts[index]!));
  return { dates: [...byDay.keys()].sort(), amounts: [...byDay.keys()].sort().map((date) => round2(byDay.get(date)!)) };
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

function mostCommon<T extends string>(xs: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | undefined;
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

function predictedYearlyCost(item: DetectedItem): number {
  return item.price * (item.frequency === 'yearly' ? 1 : item.frequency === 'quarterly' ? 4 : 12);
}
