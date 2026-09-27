// Enough — date and amount parsing. Section 6 of ENOUGH_BRIEF.md.
// Pure helpers, no I/O. Dates come back as ISO yyyy-mm-dd; amounts as numbers.

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'ambiguous';

/**
 * Convert non-Latin digits and separators to ASCII. Runs before any date or
 * amount parsing (§6 addendum): Arabic-Indic, Persian, Devanagari, Thai and
 * full-width digits, plus the Arabic decimal (٫) and thousands (٬) signs.
 */
export function normalizeDigits(input: string): string {
  if (input == null) return '';
  return String(input)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50)) // Thai
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)) // full-width
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ','); // Arabic thousands separator
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  oct: 10, nov: 11, dec: 12,
  januar: 1, februar: 2, mart: 3, april: 4, maj: 5, juni: 6, juli: 7,
  avgust: 8, septembar: 9, oktobar: 10, novembar: 11, decembar: 12,
  marz: 3, mai: 5, okt: 10, dez: 12,
};

/** Split a raw date into [a, b, year] numbers, or null if not a numeric date. */
function numericParts(raw: string): { a: number; b: number; year: number; yearFirst: boolean } | null {
  const s = normalizeDigits(raw).trim().replace(/\.$/, ''); // trailing dot (RS: 27.09.2026.)
  const datePart = s.split(/[ T]/)[0] ?? s; // drop any time component
  const m = datePart.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const p1 = Number(m[1]);
  const p2 = Number(m[2]);
  const p3 = Number(m[3]);
  if (m[1]!.length === 4) {
    return { a: p2, b: p3, year: p1, yearFirst: true }; // yyyy-mm-dd
  }
  return { a: p1, b: p2, year: normYear(p3), yearFirst: false };
}

function normYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Decide the date format for a whole file from all its date strings.
 * Dot-separated dates are treated as day-first (European). Slash dates are
 * resolved by the values: a value above 12 settles it; if every row works both
 * ways the file is 'ambiguous' and the UI must ask once.
 */
export function detectDateFormat(rawDates: string[]): DateFormat {
  const parsed = rawDates.map(numericParts).filter((p): p is NonNullable<typeof p> => p !== null);
  if (parsed.length === 0) return 'ambiguous';

  if (parsed.every((p) => p.yearFirst)) return 'iso';

  const sepDot = rawDates.some((d) => /\d[.]\d/.test(d) && !/\d[/]\d/.test(d));

  let canDMY = true;
  let canMDY = true;
  for (const p of parsed) {
    if (p.yearFirst) continue;
    if (!(p.a >= 1 && p.a <= 31 && p.b >= 1 && p.b <= 12)) canDMY = false;
    if (!(p.a >= 1 && p.a <= 12 && p.b >= 1 && p.b <= 31)) canMDY = false;
  }

  if (canDMY && !canMDY) return 'dmy';
  if (canMDY && !canDMY) return 'mdy';
  if (!canDMY && !canMDY) return 'dmy'; // malformed — default, still parse best-effort
  // both still work:
  if (sepDot) return 'dmy'; // dot convention is day-first in these locales
  return 'ambiguous';
}

/** Parse a raw date to ISO yyyy-mm-dd given the file's format. */
export function parseDate(raw: string, format: DateFormat): string | null {
  // Month-name dates, e.g. "14 October 2026" or "Renews 14 Oct".
  const named = raw.toLowerCase().match(/(\d{1,2})\s+([a-zä]+)\.?\s*(\d{4})?/);
  if (named && MONTHS[named[2]!.slice(0, named[2]!.length >= 3 ? undefined : 3)] === undefined) {
    // fall through unless a month word matches below
  }
  const monthWord = raw.toLowerCase().match(/([a-zä]{3,})/);
  if (monthWord && MONTHS[monthWord[1]!.slice(0, 3)] !== undefined && /\d/.test(raw)) {
    const day = Number((raw.match(/\b(\d{1,2})\b/) ?? [])[1] ?? NaN);
    const yr = Number((raw.match(/\b(\d{4})\b/) ?? [])[1] ?? NaN);
    const mo = MONTHS[monthWord[1]!.slice(0, 3)]!;
    if (day >= 1 && day <= 31) return iso(Number.isNaN(yr) ? new Date().getFullYear() : yr, mo, day);
  }

  const p = numericParts(raw);
  if (!p) return null;
  if (p.yearFirst || format === 'iso') return iso(p.year, p.a, p.b);
  if (format === 'mdy') return iso(p.year, p.a, p.b);
  // dmy and ambiguous default to day-first
  return iso(p.year, p.b, p.a);
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const g = toGregorian(year, month, day);
  return `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
}

/**
 * Convert a non-Gregorian year to Gregorian before detection (§6 addendum).
 * Heuristic by year range: 1300–1500 → Hijri (Umm al-Qura, arithmetic
 * approximation, ±1–2 days); ≥ 2400 → Thai Buddhist Era (year − 543). No real
 * statement is dated in those Gregorian ranges, so the ranges are unambiguous.
 */
function toGregorian(year: number, month: number, day: number): { year: number; month: number; day: number } {
  if (year >= 1300 && year <= 1500) return hijriToGregorian(year, month, day);
  if (year >= 2400) return { year: year - 543, month, day };
  return { year, month, day };
}

/** Tabular Islamic (civil) calendar → Gregorian via Julian Day Number. */
function hijriToGregorian(y: number, m: number, d: number): { year: number; month: number; day: number } {
  const jd =
    Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 386;
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return { year, month, day };
}

/**
 * Parse a money string into a number. Handles comma or dot decimals, thousand
 * separators (1.234,56 and 1,234.56), currency symbols, signs and parentheses.
 * Returns the signed value as printed.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = normalizeDigits(raw).trim();
  if (!s) return null;

  // Negative if parenthesised or a minus appears anywhere (before OR after the
  // currency symbol: "R$ -17,94", "-119,60 TL", "(30.00)", "30.00-").
  const negative = /\(.*\)/.test(s) || s.includes('-') || /\bDR\b/i.test(s);

  // Drop currency symbols, letters (R$, TL, ₹, ¥, €, $, £, kr, zł, ISO codes)
  // and Swiss apostrophe thousands. Keep digits, . , spaces.
  s = s
    .replace(/[()]/g, '')
    .replace(/[\p{L}\p{Sc}]/gu, '')
    .replace(/['’]/g, '')
    .replace(/[+\-]/g, '')
    .replace(/\s/g, '')
    .trim();

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // The rightmost separator is the decimal point; the other groups thousands.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot || hasComma) {
    const sep = hasComma ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      // Repeated separator → grouping (Indian "5,19,730", Swiss handled above).
      s = parts.join('');
    } else {
      const after = parts[1]?.length ?? 0;
      // A single group of exactly 3 digits is thousands (JPY "899,516");
      // 1–2 or 4+ digits after the separator is a decimal.
      if (after === 3) s = parts.join('');
      else s = `${parts[0]}.${parts[1] ?? ''}`;
    }
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}
