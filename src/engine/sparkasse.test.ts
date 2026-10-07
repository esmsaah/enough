import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { detect, type ImportMeta } from './detect';
import { transactionsFromPdfPages, type PdfPage } from './pdf';

async function pages(path: string): Promise<PdfPage[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, disableFontFace: true }).promise;
  const out: PdfPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    out.push(content.items.flatMap((item) => 'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
  }
  return out;
}

const meta: ImportMeta = { displayCurrency: 'EUR', dateFormat: 'dmy', dateAmbiguous: false, monthsSpan: 2, redactedCategories: [], columnQuestions: [], columnCount: 4 };
const TWIN = join(__dirname, '..', '..', 'fixtures', 'pdf', 'layout-twins', 'de_sparkasse_layout.pdf');
const REAL = join(__dirname, '..', '..', 'private-fixtures', 'de_sparkasse_real.pdf');

describe('German savings bank layout (synthetic twin)', () => {
  it('reads merged date cells, trailing +/- signs and the counterparty on the next line', async () => {
    const parsed = transactionsFromPdfPages(await pages(TWIN));
    expect(parsed.transactions).toHaveLength(17); // 19 bookings minus 2 salary credits
    expect(parsed.transactions.map((t) => t.merchantRaw)).toContain('NETFLIX INTERNATIONAL B.V.');
    expect(parsed.transactions.some((t) => /lastschrift|kartenzahlung|dauerauftrag|kontostand|\d,\d{2}/i.test(t.merchantRaw))).toBe(false);
    expect(JSON.stringify(parsed.transactions)).not.toMatch(/Musterfrau|Beispielweg|DE00 1234|9999999999|2\.400/);
    const result = detect(parsed.transactions, meta);
    const byKey = Object.fromEntries(result.recurring.map((item) => [item.merchantKey, item]));
    expect(byKey.netflix?.price).toBe(13.99);
    expect(byKey.spotify?.price).toBe(10.99);
    expect(byKey.telekom?.category).toBe('bill');
    expect(result.recurring.find((item) => /stadtwerke/.test(item.merchantKey))?.category).toBe('bill');
    expect(result.recurring.find((item) => /hausverwaltung/.test(item.merchantKey))?.category).toBe('bill');
  });
});

describe('local private regression (never committed)', () => {
  it.skipIf(!existsSync(REAL))('a statement with only money in yields no spending and no column question', async () => {
    const parsed = transactionsFromPdfPages(await pages(REAL));
    expect(parsed.transactions).toHaveLength(0);
    expect(parsed.columnQuestions).toHaveLength(0);
  });
});

describe('Bosnian bank foreign-currency layout (synthetic twin)', () => {
  it('signed amount column, glued city names, USD price prefix, exchanges skipped', async () => {
    const parsed = transactionsFromPdfPages(await pages(join(__dirname, '..', '..', 'fixtures', 'pdf', 'layout-twins', 'ba_unicredit_layout.pdf')));
    expect(parsed.balanceCheck.checked).toBeGreaterThan(0);
    expect(parsed.balanceCheck.passed).toBe(parsed.balanceCheck.checked);
    expect(JSON.stringify(parsed.transactions)).not.toMatch(/TESTIĆ|BA00 0000/);
    const result = detect(parsed.transactions, meta);
    const keys = result.recurring.map((item) => item.merchantKey);
    expect(keys).toEqual(expect.arrayContaining(['nyt', 'google one', 'telekom']));
    expect(keys.some((key) => /konverzija|exch/.test(key))).toBe(false);
  });
});
