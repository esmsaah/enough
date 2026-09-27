// Enough — multilingual column-header matching. Section 6 of ENOUGH_BRIEF.md.
// Maps a raw header cell to the role the engine needs. Matching is
// accent-insensitive, case-insensitive, and by whole-word / contains.

export type ColumnRole =
  | 'date'
  | 'valueDate'
  | 'merchant' // clean payee/merchant name — preferred over description
  | 'description'
  | 'holder' // account/card holder — personal, dropped
  | 'amount' // single signed amount column
  | 'debit' // money out
  | 'credit' // money in
  | 'currency'
  | 'balance'
  | 'other';

/** Header keywords per role, lowercased and accent-stripped. Order matters:
 *  more specific roles (valueDate, debit/credit, balance) are tested before
 *  the generic ones so "datum valute" is not mistaken for "datum". */
const HEADER_KEYWORDS: Array<[ColumnRole, string[]]> = [
  ['valueDate', ['datum valute', 'value date', 'valuta', 'valutadatum', 'datum knjizenja', 'wertstellung']],
  ['balance', ['balance', 'saldo', 'stanje', 'kontostand', 'running balance', 'balans', 'стање', 'салдо']],
  ['debit', ['debit', 'isplata', 'zaduzenje', 'soll', 'paid out', 'withdrawal', 'duguje', 'terecenje', 'задужење', 'исплата', 'дуговање']],
  ['credit', ['credit', 'uplata', 'odobrenje', 'haben', 'paid in', 'deposit', 'potrazuje', 'priliv', 'одобрење', 'уплата', 'потраживање']],
  ['currency', ['currency', 'valuta iso', 'waehrung', 'wahrung', 'ccy', 'devpos', 'валута']],
  // Personal names — dropped, never used as the merchant. Tested before merchant
  // so "Card Holder Full Name" is not mistaken for a payee.
  ['holder', ['card holder', 'holder', 'vlasnik', 'klijent', 'account holder', 'kontoinhaber', 'karteninhaber', 'payer name', 'payee name', 'payer', 'payee', 'klijent racuna']],
  // Clean payee/merchant column — preferred over a verbose description.
  ['merchant', ['merchant', 'beneficiary', 'beguenstigter', 'primatelj', 'partner name', 'recipient', 'empfaenger', 'naziv primatelja', 'name']],
  ['description', [
    'description', 'opis', 'opis transakcije', 'opis promjene', 'opis promene',
    'verwendungszweck', 'buchungstext', 'reference', 'namjena', 'memo', 'narrative',
    'concepto', 'libelle', 'name / description',
    'опис', 'опис промета', 'sadrzaj', 'sadrzaj naloga', 'purpose',
  ]],
  ['amount', [
    'amount', 'iznos', 'betrag', 'importe', 'montant', 'suma', 'value', 'promet',
    'znos', 'umsatz', 'износ',
  ]],
  ['date', [
    'date', 'datum', 'fecha', 'data', 'started date', 'completed date',
    'datum prometa', 'transaction date', 'booking date', 'buchungstag',
    'datum transakcije', 'датум', 'датум промета', 'buchungstag',
  ]],
];

/** Strip diacritics and lowercase, so "Zaduženje" matches "zaduzenje". */
export function foldHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[."'’]+/g, '')
    .trim();
}

/** Whole-word (Unicode-aware) match, so "promet" ≠ "prometa" and Cyrillic
 *  headers keep their word boundaries. */
function wordIn(haystack: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'u').test(haystack);
}

export function classifyHeader(raw: string): ColumnRole {
  const h = foldHeader(raw);
  if (!h) return 'other';
  for (const [role, words] of HEADER_KEYWORDS) {
    for (const w of words) {
      if (h === w || wordIn(h, w)) return role;
    }
  }
  return 'other';
}

/** A row looks like a header if two or more cells classify to distinct roles
 *  and at least one is a date-ish column and one is an amount-ish column. */
export function looksLikeHeaderRow(cells: string[]): boolean {
  const roles = cells.map(classifyHeader);
  const set = new Set(roles.filter((r) => r !== 'other'));
  const hasDate = set.has('date') || set.has('valueDate');
  const hasMoney = set.has('amount') || set.has('debit') || set.has('credit');
  return hasDate && hasMoney;
}
