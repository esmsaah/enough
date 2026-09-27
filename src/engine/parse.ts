// Enough — date and amount parsing. Section 6 of ENOUGH_BRIEF.md.
// Pure helpers, no I/O. Dates come back as ISO yyyy-mm-dd; amounts as numbers.

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'ambiguous';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  oct: 10, nov: 11, dec: 12,
  januar: 1, februar: 2, mart: 3, april: 4, maj: 5, juni: 6, juli: 7,
  avgust: 8, septembar: 9, oktobar: 10, novembar: 11, decembar: 12,
  marz: 3, mai: 5, okt: 10, dez: 12,
};

/** Split a raw date into [a, b, year] numbers, or null if not a numeric date. */
function numericParts(raw: string): { a: number; b: number; year: number; yearFirst: boolean } | null {
  const s = raw.trim().replace(/\.$/, ''); // trailing dot (RS: 27.09.2026.)
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
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a money string into a number. Handles comma or dot decimals, thousand
 * separators (1.234,56 and 1,234.56), currency symbols, signs and parentheses.
 * Returns the signed value as printed.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  const negative = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^-/.test(s) || /\bDR\b/i.test(s);
  s = s.replace(/[()]/g, '');
  // strip currency symbols, ISO codes and spaces
  s = s.replace(/[€$£]/g, '').replace(/\b[A-Z]{3}\b/g, '').replace(/[A-Za-z]/g, '').trim();
  s = s.replace(/\s/g, '');
  s = s.replace(/^[+-]/, '').replace(/[+-]$/, '');

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // rightmost separator is the decimal point
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // multiple commas → thousands; single comma → decimal
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    if ((s.match(/\./g)?.length ?? 0) > 1) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}
