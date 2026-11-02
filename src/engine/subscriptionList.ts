// Enough — reading the phone's own subscription list (brief §6). The safest input:
// a screenshot of iPhone Settings › your name › Subscriptions or Google Play ›
// Payments & subscriptions holds no bank data. OCR gives text lines; each entry is
// a service name, a price with its period, and a renewal date.

import { matchMerchant } from './merchants';
import type { Frequency } from './types';

export type PhoneSubscription = {
  name: string;
  price: number;
  currency: string;
  frequency: Frequency;
  nextCharge?: string; // ISO
};

const CUR: Record<string, string> = { '€': 'EUR', eur: 'EUR', '$': 'USD', usd: 'USD', us$: 'USD', '£': 'GBP', gbp: 'GBP', km: 'BAM', bam: 'BAM', rsd: 'RSD', din: 'RSD', 'din.': 'RSD', chf: 'CHF', kn: 'EUR', zł: 'PLN', pln: 'PLN' };
const CUR_RE = '(€|\\$|£|us\\$|eur|usd|gbp|km|bam|rsd|din\\.?|chf|zł|pln)';
const NUM_RE = '(\\d{1,5}(?:[.,]\\d{3})*[.,]\\d{2}|\\d{1,5})';
const PRICE = new RegExp(`${CUR_RE}\\s?${NUM_RE}|${NUM_RE}\\s?${CUR_RE}`, 'i');
const YEARLY = /\b(year|yearly|annual|annually|yr|godi[sš]nje|godina|jahr|jährlich|jahrlich|ann[ée]e)\b|\/\s?(y|yr|year)\b/i;
const WEEKLY = /\b(week|weekly|tjedno|nedeljno|sedmi[cč]no|woche)\b/i;
const RENEW = /\b(renews?|renewal|next (payment|billing|charge)|expires?|ends|obnavlja|obnova|isti[cč]e|sljede[cć]a|slede[cć]a|verl[äa]ngert|n[äa]chste|naplata)\b/i;
const NOISE = /^(subscriptions?|pretplate|abonnements?|active|aktivno|inactive|expired|see all|manage|edit|cancel|settings|postavke|payments? (&|and) subscriptions|google play|apple id|\d+:\d+)$/i;

const MONTHS: Array<[RegExp, number]> = [
  [/^(jan|januar|january|siječ|sijec|janv)/i, 1], [/^(feb|februar|february|velj|févr|fevr)/i, 2], [/^(mar|mär|marz|march|ožu|ozu|mars)/i, 3],
  [/^(apr|april|tra|avr)/i, 4], [/^(may|mai|maj|svib)/i, 5], [/^(jun|june|juni|lip|juin)/i, 6], [/^(jul|july|juli|srp|juil)/i, 7],
  [/^(aug|august|avg|kol|août|aout)/i, 8], [/^(sep|september|sept|ruj)/i, 9], [/^(oct|okt|october|oktobar|oktober|lis)/i, 10],
  [/^(nov|november|novembar|stu)/i, 11], [/^(dec|dez|december|decembar|dezember|pro|déc)/i, 12],
];

function monthOf(word: string): number | undefined {
  return MONTHS.find(([re]) => re.test(word))?.[1];
}

/** "Renews 14 October", "Next payment: Nov 14, 2026", "Obnavlja se 14.10.2026." → next ISO date on/after today. */
export function parseRenewalDate(line: string, today: string): string | undefined {
  const t = line.replace(RENEW, ' ').replace(/[:,]/g, ' ');
  let d: number | undefined, m: number | undefined, y: number | undefined;
  const num = t.match(/(\d{1,2})[./-](\d{1,2})[./-]?(\d{2,4})?/);
  if (num) { d = +num[1]!; m = +num[2]!; if (num[3]) y = +num[3]!.padStart(4, '20'); }
  else {
    const words = t.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const mm = monthOf(words[i]!.replace(/\./g, ''));
      if (!mm) continue;
      m = mm;
      const before = words[i - 1]?.replace(/\D/g, ''); const after = words[i + 1]?.replace(/\D/g, '');
      if (before && +before >= 1 && +before <= 31) d = +before; else if (after && +after >= 1 && +after <= 31) d = +after;
      const yr = words.slice(i + 1, i + 3).map((w) => w.replace(/\D/g, '')).find((w) => w.length === 4);
      if (yr) y = +yr;
      break;
    }
  }
  if (!d || !m || m > 12 || d > 31) return undefined;
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let year = y ?? ty;
  if (!y && (m < tm || (m === tm && d < td))) year += 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parsePrice(line: string): { price: number; currency: string } | undefined {
  const m = line.match(PRICE);
  if (!m) return undefined;
  const cur = (m[1] ?? m[4] ?? '').toLowerCase();
  const raw = (m[2] ?? m[3] ?? '').replace(/\s/g, '');
  const normalized = /,\d{2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const price = Number(normalized);
  return price > 0 ? { price, currency: CUR[cur] ?? 'EUR' } : undefined;
}

/** Turn the OCR text lines of one or more screenshots into subscriptions. */
export function parseSubscriptionList(lines: string[], today: string): PhoneSubscription[] {
  const out: PhoneSubscription[] = [];
  let name: string | undefined;
  let periodHint: Frequency | undefined; // "Standard (Yearly)" on the line under the name
  let current: PhoneSubscription | undefined;
  let pendingRenew: string | undefined; // the date can come before the price
  const flush = () => { if (current) out.push(current); current = undefined; };
  const periodOf = (line: string): Frequency | undefined => (YEARLY.test(line) ? 'yearly' : WEEKLY.test(line) ? 'weekly' : /month|monthly|mjese|mese|monat/i.test(line) ? 'monthly' : undefined);
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || NOISE.test(line)) continue;
    const price = parsePrice(line);
    const renew = RENEW.test(line) ? parseRenewalDate(line, today) : undefined;
    if (price && name) {
      if (current && current.name !== name) flush();
      current = { name, price: price.price, currency: price.currency, frequency: periodOf(line) ?? periodHint ?? 'monthly' };
      const date = renew ?? pendingRenew;
      if (date) current.nextCharge = date;
      pendingRenew = undefined;
      continue;
    }
    if (renew) { if (current) current.nextCharge = renew; else pendingRenew = renew; continue; }
    if (!/[A-Za-zÀ-žА-я]/.test(line) || line.length > 48 || /^\d/.test(line)) continue;
    // A text line without a price or date: a new service name, or the plan line under it.
    if (current) { flush(); name = line; periodHint = periodOf(line); pendingRenew = undefined; continue; }
    const nameUsed = name !== undefined && out.some((s) => s.name === name);
    if (name === undefined || nameUsed) { name = line; periodHint = periodOf(line); pendingRenew = undefined; }
    else if (!matchMerchant(name) && matchMerchant(line)) { name = line; periodHint = periodOf(line); }
    else periodHint = periodOf(line) ?? periodHint;
  }
  flush();
  return out.filter((s, i) => out.findIndex((o) => o.name.toLowerCase() === s.name.toLowerCase()) === i);
}
