// Enough — redaction. Section 6 & 11 of ENOUGH_BRIEF.md.
// Runs before anything is stored or shown. The promise "We never see your
// statement" is enforced here and by tests, not by good intentions.

export const MASK = '•••';

/**
 * Redact personal data from a transaction description: IBANs, card numbers,
 * emails, phone numbers and long digit runs. Merchant text is kept.
 */
export function redactDescription(input: string): string {
  let s = input;

  // Emails first (before digit rules chew them up).
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, MASK);

  // IBAN: two letters, two check digits, then up to ~30 grouped alphanumerics.
  s = s.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g, MASK);

  // Card numbers: 13–19 digits, optionally in groups of 4 separated by space/dash.
  s = s.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => (m.replace(/[ -]/g, '').length >= 13 ? MASK : m));

  // Phone numbers: +country and 7+ digits with separators.
  s = s.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => (m.replace(/\D/g, '').length >= 8 ? MASK : m));

  // Any remaining long digit run (10+).
  s = s.replace(/\b\d{10,}\b/g, MASK);

  return s.replace(/\s+/g, ' ').trim();
}

/** Personal-data categories the "What we keep" screen shows as REMOVED bars. */
export const REDACTED_CATEGORIES = ['name', 'IBAN', 'address', 'balance', 'card number'] as const;

/**
 * True if a string still contains anything that looks personal after
 * redaction. Used by the privacy test as a belt-and-braces check.
 */
export function looksRedacted(s: string): boolean {
  const ibanLeft = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,}\b/.test(s);
  const cardLeft = /\b(?:\d[ -]?){13,19}\b/.test(s);
  const emailLeft = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(s);
  const longDigits = /\b\d{10,}\b/.test(s);
  return !(ibanLeft || cardLeft || emailLeft || longDigits);
}
