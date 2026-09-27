// Enough — fixture-driven detection tests. Section 6 & 11 of ENOUGH_BRIEF.md.
// Runs the real pipeline over the anonymized statements in /fixtures and
// compares against expected/*.json. The privacy assertion is the important
// one: no personal data may survive into the stored transactions.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsvBytes } from './csv';
import { detect, transactionsFromRows, type DetectedItem } from './detect';

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

type Expected = {
  currency: string;
  recurring: Array<{ merchantKey: string; analysis: string; frequency: string; price: number | string }>;
  habits: Array<{ merchantKey: string }>;
  mustAsk: Array<{ merchantKey: string }>;
  mustIgnore: string[];
  mustRedact?: string[];
  forbiddenAfterRedaction?: string[];
};

// Per-file encoding (from the manifest notes). Everything else is UTF-8.
const ENCODING: Record<string, string> = {
  'de_sparkasse_style.csv': 'iso-8859-1',
  'ba_modeled.csv': 'windows-1250',
  'rs_latin_modeled.csv': 'windows-1250',
};

// CSV fixtures that carry the shared six-month persona and a matching
// expected/<name>.json. Edge files are tested separately below.
const PERSONA_FILES = [
  'revolut_en.csv',
  'wise.csv',
  'n26_en.csv',
  'de_sparkasse_style.csv',
  'uk_monzo_style.csv',
  'us_generic.csv',
  'ba_modeled.csv',
  'rs_latin_modeled.csv',
  'rs_cyrillic_modeled.csv',
  'hr_modeled.csv',
];

// Literal personal values that appear in the persona fixtures and must NEVER survive.
const FORBIDDEN = ['Ana', 'Testić', 'Testic', 'Тестић', 'BA39', 'RS35', 'Primjera', '4111'];

// Global format fixtures (§6 addendum): non-Latin digits, calendars, formats.
const GLOBAL_FILES = [
  'ae_arabic_digits.csv', 'sa_hijri.csv', 'jp_yen.csv', 'in_inr.csv',
  'ch_chf.csv', 'tr_try.csv', 'br_brl.csv', 'th_buddhist.csv',
];

function loadExpected(name: string): Expected {
  const base = name.replace(/\.csv$/, '');
  return JSON.parse(readFileSync(join(FIXTURES, 'expected', `${base}.json`), 'utf-8'));
}

function runFile(name: string, subdir = 'csv') {
  const bytes = readFileSync(join(FIXTURES, subdir, name));
  const rows = parseCsvBytes(new Uint8Array(bytes), ENCODING[name]);
  const exp = loadExpected(name);
  const { transactions, meta } = transactionsFromRows(rows, exp.currency);
  const result = detect(transactions, meta);
  return { transactions, meta, result, exp };
}

describe('fixtures — detection over the shared persona', () => {
  for (const name of PERSONA_FILES) {
    describe(name, () => {
      const { transactions, result, exp } = runFile(name);
      const all: DetectedItem[] = [...result.recurring, ...result.habits];
      const byKey = new Map(all.map((i) => [i.merchantKey, i]));

      it('extracts transactions', () => {
        expect(transactions.length).toBeGreaterThan(20);
      });

      it('never lets personal data survive into stored transactions (privacy)', () => {
        const dump = JSON.stringify(transactions);
        for (const bad of FORBIDDEN) {
          expect(dump, `"${bad}" leaked into stored data`).not.toContain(bad);
        }
        // no raw IBAN or full card number anywhere
        expect(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,}\b/.test(dump)).toBe(false);
        expect(/\b(?:\d[ -]?){13,19}\b/.test(dump)).toBe(false);
      });

      it('finds every expected recurring item with the right frequency and analysis type', () => {
        for (const want of exp.recurring) {
          const got = byKey.get(want.merchantKey);
          expect(got, `missing recurring ${want.merchantKey} in ${name}`).toBeDefined();
          if (!got) continue;
          expect(got.frequency, `${want.merchantKey} frequency`).toBe(want.frequency);
          expect(got.category, `${want.merchantKey} analysis type`).toBe(want.analysis);
          // Exact price only when expected gives a number (bills give a sentence).
          if (typeof want.price === 'number') {
            expect(got.price, `${want.merchantKey} price`).toBeCloseTo(want.price, 0);
          }
        }
      });

      it('classifies habits as habits', () => {
        for (const want of exp.habits) {
          const got = result.habits.find((h) => h.merchantKey === want.merchantKey);
          expect(got, `missing habit ${want.merchantKey} in ${name}`).toBeDefined();
        }
      });

      it('ignores supermarkets / fuel (mustIgnore)', () => {
        for (const key of exp.mustIgnore) {
          const short = key.split(' (')[0]!; // "konzum market (supermarket)" → "konzum market"
          expect(byKey.has(short), `${short} should be ignored`).toBe(false);
        }
      });

      it('never auto-classifies a private transfer (mustAsk)', () => {
        // the transfer must appear in mustAsk, and never in recurring/habits
        const asked = result.mustAsk.some((a) => a.merchantKey.includes('maja maric'));
        expect(asked, `private transfer not flagged in ${name}`).toBe(true);
        expect([...byKey.keys()].some((k) => k.includes('maja maric'))).toBe(false);
      });
    });
  }
});

describe('fixtures — global formats (digits, calendars, number formats)', () => {
  for (const name of GLOBAL_FILES) {
    describe(name, () => {
      const { transactions, result, exp } = runFile(name, 'csv/global');
      const all: DetectedItem[] = [...result.recurring, ...result.habits];
      const byKey = new Map(all.map((i) => [i.merchantKey, i]));

      it('parses non-Latin digits and calendars into transactions', () => {
        expect(transactions.length).toBeGreaterThan(20);
        // every stored date is a valid Gregorian ISO date in the persona window
        for (const t of transactions) {
          expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(Number(t.date.slice(0, 4))).toBeGreaterThan(2020);
        }
      });

      it('never lets personal data survive redaction (forbiddenAfterRedaction)', () => {
        const dump = JSON.stringify(transactions);
        for (const bad of exp.forbiddenAfterRedaction ?? []) {
          expect(dump, `"${bad}" leaked into stored data in ${name}`).not.toContain(bad);
        }
      });

      it('finds expected recurring items with the right frequency and analysis type', () => {
        for (const want of exp.recurring) {
          const got = byKey.get(want.merchantKey);
          expect(got, `missing recurring ${want.merchantKey} in ${name}`).toBeDefined();
          if (!got) continue;
          expect(got.frequency, `${want.merchantKey} frequency`).toBe(want.frequency);
          expect(got.category, `${want.merchantKey} analysis`).toBe(want.analysis);
        }
      });

      it('classifies habits, ignores supermarkets, flags the transfer', () => {
        for (const want of exp.habits) {
          expect(result.habits.find((h) => h.merchantKey === want.merchantKey), `missing habit ${want.merchantKey}`).toBeDefined();
        }
        for (const key of exp.mustIgnore) {
          expect(byKey.has(key.split(' (')[0]!), `${key} should be ignored`).toBe(false);
        }
        expect(result.mustAsk.some((a) => a.merchantKey.includes('maja maric')), `transfer not flagged in ${name}`).toBe(true);
      });
    });
  }
});
