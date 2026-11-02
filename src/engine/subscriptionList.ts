// Enough — reading the phone's own subscription list (brief §6). The safest input:
// a screenshot of iPhone Settings › your name › Subscriptions or Google Play ›
// Payments & subscriptions holds no bank data. OCR gives text lines; each entry is a
// service name, a price with its period, and a renewal date. Works across languages,
// scripts, currencies and date styles; anything unsure is left for the person to fix.

import { matchMerchant } from './merchants';
import { normalizeDigits, parseAmount } from './parse';
import { RATES_PER_EUR } from './rates';
import type { Frequency } from './types';

export type PhoneSubscription = { name: string; price: number; currency: string; frequency: Frequency; nextCharge?: string };

// ---------------------------------------------------------------------------
// Currencies: symbols and local spellings, then any ISO code we have a rate for.
// ---------------------------------------------------------------------------
const SYMBOLS: Array<[string, string]> = [
  ['us$', 'USD'], ['a$', 'AUD'], ['au$', 'AUD'], ['c$', 'CAD'], ['ca$', 'CAD'], ['nz$', 'NZD'], ['hk$', 'HKD'], ['s$', 'SGD'], ['r$', 'BRL'], ['mx$', 'MXN'],
  ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'], ['₩', 'KRW'], ['₺', 'TRY'], ['₽', 'RUB'], ['₴', 'UAH'], ['₪', 'ILS'], ['₫', 'VND'], ['฿', 'THB'], ['₱', 'PHP'],
  ['zł', 'PLN'], ['kč', 'CZK'], ['ft', 'HUF'], ['lei', 'RON'], ['лв', 'BGN'], ['ден', 'MKD'], ['дин', 'RSD'], ['din', 'RSD'], ['km', 'BAM'], ['lek', 'ALL'],
  ['rp', 'IDR'], ['rm', 'MYR'], ['chf', 'CHF'], ['د.إ', 'AED'], ['درهم', 'AED'], ['ر.س', 'SAR'], ['﷼', 'SAR'], ['ريال', 'SAR'], ['ج.م', 'EGP'], ['руб', 'RUB'],
  ['грн', 'UAH'], ['円', 'JPY'], ['元', 'CNY'], ['원', 'KRW'], ['บาท', 'THB'], ['tl', 'TRY'], ['kn', 'EUR'],
];
const KR_BY_COUNTRY: Record<string, string> = { SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK' };
const DOLLAR_BY_COUNTRY: Record<string, string> = { AU: 'AUD', CA: 'CAD', NZ: 'NZD', HK: 'HKD', SG: 'SGD', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', TW: 'TWD' };
const YEN_BY_COUNTRY: Record<string, string> = { CN: 'CNY', HK: 'CNY' };
const ISO = Object.keys(RATES_PER_EUR).concat('EUR');

function currencyIn(line: string, country: string): string | undefined {
  const low = line.toLowerCase();
  const iso = line.match(/\b([A-Z]{3})\b/g)?.find((c) => ISO.includes(c));
  if (iso) return iso;
  for (const [sym, code] of SYMBOLS) {
    const isWord = /^[a-zа-я]+$/i.test(sym);
    if (isWord ? new RegExp(`(^|[^\\p{L}])${sym}(?![\\p{L}])`, 'iu').test(low) : low.includes(sym)) return code;
  }
  if (/\bkr\.?(?![\p{L}])/iu.test(low)) return KR_BY_COUNTRY[country] ?? 'SEK';
  if (low.includes('¥') || low.includes('￥')) return YEN_BY_COUNTRY[country] ?? 'JPY';
  if (low.includes('$')) return DOLLAR_BY_COUNTRY[country] ?? 'USD';
  return undefined;
}

function priceIn(line: string, country: string): { price: number; currency: string } | undefined {
  const text = normalizeDigits(line);
  const currency = currencyIn(text, country);
  if (!currency) return undefined;
  // A number with optional grouping and decimals, not part of a date like 14.10.2026.
  const nums = text.match(/\d{1,3}(?:[ .,' ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  for (const n of nums) {
    if (/^\d{1,2}[.]\d{1,2}$/.test(n) && /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(text)) continue; // a date
    const v = parseAmount(n);
    if (v !== null && Math.abs(v) > 0 && Math.abs(v) < 1_000_000) return { price: Math.abs(v), currency };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Periods and renewal words in many languages.
// ---------------------------------------------------------------------------
const YEARLY = /(year|yearly|annual|annually|\/\s?(y|yr)\b|jahr|jährlich|année|annuel|an\b|año|anual|ano\b|anno|annuale|jaar|jaarlijks|rok|roczn|ročn|év|éves|anual|yıl|yıllık|год|годов|рік|річн|година|годишн|έτος|ετήσι|år\b|årlig|vuosi|vuosittain|godiš|godin|letno|vjetor|سنة|سنوي|שנה|שנתי|سال|वर्ष|年|연간|매년|\/년|ปี|năm|tahun|tahunan)/i;
const WEEKLY = /(week|weekly|woche|semaine|semana|settimana|week|tydzień|týden|hét|hafta|недел|тиж|εβδομάδα|vecka|uke|uge|viikko|tjedan|nedelj|sedmic|أسبوع|שבוע|週|주|สัปดาห์|tuần|minggu)/i;
const MONTHLY = /(month|monthly|\/\s?mo\b|monat|monatlich|mois|mensuel|mes\b|mensual|mês|mensal|mese|mensile|maand|maandelijks|miesiąc|miesięczn|měsíc|měsíčn|hónap|havi|lună|lunar|ay\b|aylık|месяц|месяч|місяць|місячн|месец|месечн|μήνα|μηνιαί|månad|måned|månedlig|kuukausi|kuukausittain|mjesec|mjesečn|mesec|mesečn|muaj|شهر|شهري|חודש|ماه|महीना|\/月|月額|每月|매월|\/월|เดือน|tháng|bulan|bulanan)/i;
const RENEW = /(renew|renewal|next (payment|billing|charge)|billed on|expires|ends on|verlängert|nächste zahlung|erneuert|läuft ab|renouvel|prochain paiement|expire|renueva|próximo pago|vence|renova|próximo pagamento|expira|rinnov|prossimo pagamento|scade|verlengd|volgende betaling|verloopt|odnawia|odnowienie|następna płatność|wygasa|obnoví|další platba|vyprší|megújul|következő fizetés|lejár|reînnoi|următoarea plată|expiră|yenilen|sonraki ödeme|sona er|продлева|продление|следующий платеж|следующий платёж|истекает|продовжу|наступний платіж|закінчу|подновява|следващо плащане|изтича|обнавља|следећа|ανανεών|επόμενη πληρωμή|λήγει|förnyas|nästa betalning|upphör|fornyes|neste betaling|utløper|næste betaling|udløber|uusiutuu|seuraava maksu|päättyy|obnavlja|obnova|sljedeć|sledeć|naplata|istič|podaljša|naslednje plačilo|poteče|се обновува|следно плаќање|rinovohet|pagesa e radhës|يتجدد|تجديد|الدفعة التالية|ينتهي|מתחדש|חידוש|החיוב הבא|התשלום הבא|תמדיד|تمدید|پرداخت بعدی|नवीनीकरण|अगला भुगतान|更新|次回|有効期限|갱신|다음\s*결제|만료|续订|续费|下次|到期|續訂|續費|ต่ออายุ|ชำระครั้งถัดไป|หมดอายุ|gia hạn|thanh toán tiếp theo|hết hạn|diperpanjang|pembayaran berikutnya|berakhir|diperbaharui|pembayaran seterusnya)/i;
const NOISE = /^(subscriptions?|abonnements?|abonnemente?|suscripciones|assinaturas|abbonamenti|abonnementen|subskrypcje|předplatné|előfizetések|abonamente|abonelikler|подписки|підписки|абонаменти|pretplate|претплате|συνδρομές|prenumerationer|abonnementer|tilaukset|naročnine|الاشتراكات|מינויים|サブスクリプション|구독|订阅|訂閱|การสมัครรับ|gói đăng ký|langganan|active|aktiv|aktivno|actif|activa|ativa|attivo|actief|aktywne|inactive|expired|see all|manage|edit|cancel|settings|google play|apple id|\d{1,2}:\d{2}.*)$/i;

// Month names in many languages, built from the platform's own calendar data.
const MONTH_LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'tr', 'ru', 'uk', 'sv', 'nb', 'da', 'fi', 'hr', 'bs', 'sr', 'sr-Latn', 'sl', 'mk', 'sq', 'ar', 'he', 'fa', 'hi', 'vi', 'id', 'ms', 'th'];
const MONTH_NAMES: Array<[string, number]> = (() => {
  const out = new Map<string, number>();
  for (const loc of MONTH_LOCALES) {
    for (const style of ['long', 'short'] as const) {
      try {
        const f = new Intl.DateTimeFormat(loc, { month: style, timeZone: 'UTC' });
        for (let m = 0; m < 12; m++) {
          const name = f.format(new Date(Date.UTC(2026, m, 15))).toLowerCase().replace(/\./g, '').trim();
          if (name.length >= 3 && !/^\d+$/.test(name)) out.set(name, m + 1);
        }
        // genitive forms ("14 октября", "14. listopadu") come with a day
        const g = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' });
        for (let m = 0; m < 12; m++) {
          const word = g.format(new Date(Date.UTC(2026, m, 15))).toLowerCase().replace(/[\d.\s]+/g, ' ').trim();
          if (word.length >= 3) out.set(word, m + 1);
        }
      } catch { /* locale not available */ }
    }
  }
  return [...out].sort((a, b) => b[0].length - a[0].length);
})();

/** "Renews 14 October", "Next payment: Nov 14, 2026", "14.10.2026", "2026年11月20日", "11월 20일" → next ISO date on/after today. */
export function parseRenewalDate(line: string, today: string): string | undefined {
  const t = normalizeDigits(line).toLowerCase();
  let d: number | undefined, m: number | undefined, y: number | undefined;
  const cjk = t.match(/(?:(\d{4})\s*[年년]\s*)?(\d{1,2})\s*[月월]\s*(\d{1,2})\s*[日일]?/);
  const ymd = t.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
  const dmy = t.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (cjk) { y = cjk[1] ? +cjk[1] : undefined; m = +cjk[2]!; d = +cjk[3]!; }
  else if (ymd) { y = +ymd[1]!; m = +ymd[2]!; d = +ymd[3]!; }
  else {
    const hit = MONTH_NAMES.find(([name]) => t.includes(name));
    if (hit) {
      m = hit[1];
      const at = t.indexOf(hit[0]);
      const before = t.slice(0, at).match(/(\d{1,2})\D*$/); const after = t.slice(at + hit[0].length).match(/^\D*?(\d{1,2})(?!\d)/);
      d = before ? +before[1]! : after ? +after[1]! : undefined;
      const yr = t.match(/\b(20\d{2})\b/); if (yr) y = +yr[1]!;
    } else if (dmy) {
      d = +dmy[1]!; m = +dmy[2]!; if (dmy[3]) y = +dmy[3]!.padStart(4, '20');
      if (m > 12 && d <= 12) [d, m] = [m, d]; // US style 11/20
    }
  }
  if (!d || !m || m > 12 || d > 31) return undefined;
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let year = y ?? ty;
  if (!y && (m < tm || (m === tm && d < td))) year += 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const CJK_GAP = new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'gu');

/** OCR quirks: spaces between CJK characters, the yen sign read as a backslash. */
export function cleanOcrLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(CJK_GAP, '').replace(/\\(?=\s?\d)/g, '¥').trim();
}

const periodOf = (line: string): Frequency | undefined => (YEARLY.test(line) ? 'yearly' : WEEKLY.test(line) ? 'weekly' : MONTHLY.test(line) ? 'monthly' : undefined);
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Turn the OCR text lines of one or more screenshots into subscriptions. */
export function parseSubscriptionList(lines: string[], today: string, country = ''): PhoneSubscription[] {
  const out: PhoneSubscription[] = [];
  let name: string | undefined;
  let periodHint: Frequency | undefined;
  let current: PhoneSubscription | undefined;
  let pendingRenew: string | undefined;
  const flush = () => { if (current) out.push(current); current = undefined; };
  const C = country.toUpperCase();
  for (const raw of lines) {
    const line = cleanOcrLine(raw);
    if (!line || NOISE.test(line)) continue;
    const renew = RENEW.test(line) ? parseRenewalDate(line, today) : undefined;
    const price = renew && !currencyIn(normalizeDigits(line), C) ? undefined : priceIn(line, C);
    if (price && name) {
      if (current && current.name !== name) flush();
      current = { name, price: price.price, currency: price.currency, frequency: periodOf(line) ?? periodHint ?? 'monthly' };
      const date = renew ?? pendingRenew;
      if (date) current.nextCharge = date;
      pendingRenew = undefined;
      continue;
    }
    if (renew) { if (current) current.nextCharge = renew; else pendingRenew = renew; continue; }
    if (!hasLetters(line) || line.length > 48 || /^\d/.test(line)) continue;
    if (current) { flush(); name = line; periodHint = periodOf(line); pendingRenew = undefined; continue; }
    const nameUsed = name !== undefined && out.some((s) => s.name === name);
    if (name === undefined || nameUsed) { name = line; periodHint = periodOf(line); pendingRenew = undefined; }
    else if (!matchMerchant(name) && matchMerchant(line)) { name = line; periodHint = periodOf(line); }
    else periodHint = periodOf(line) ?? periodHint;
  }
  flush();
  return out.filter((s, i) => out.findIndex((o) => o.name.toLowerCase() === s.name.toLowerCase()) === i);
}
