import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detect } from './detect';
import { transactionsFromPdfPages, type PdfPage } from './pdf';

const ROOT = join(__dirname, '..', '..');
const layoutExpectations = JSON.parse(readFileSync(join(ROOT, 'fixtures/pdf/layout-twins/expected.json'), 'utf8')) as Record<string, {
  mustRedact?: string[]; mustSkipRows?: string[]; mustSkipTables?: string[]; mustFindOut: string[]; mustAsk?: string[];
}>;

async function parseFixture(path: string) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, disableFontFace: true }).promise;
  const pages: PdfPage[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const content = await (await pdf.getPage(pageNo)).getTextContent();
    pages.push(content.items.flatMap((item) => 'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
  }
  return transactionsFromPdfPages(pages);
}

function parsedText(transactions: Array<{ merchantRaw: string }>): string {
  return JSON.stringify(transactions).toLowerCase();
}

afterEach(() => vi.unstubAllGlobals());

describe('PDF import stays on device', () => {
  it('extracts the bundled PDF worker and does not require network access', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected network request'))));
    const parsed = await parseFixture(join(ROOT, 'fixtures/pdf/layout-twins/emoney_multitable_layout.pdf'));
    expect(parsed.transactions.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('PDF layout-twins fixtures', () => {
  for (const [filename, expected] of Object.entries(layoutExpectations)) {
    it(`${filename}: redacts personal data, skips non-transaction content, and keeps outgoing rows`, async () => {
      const { transactions } = await parseFixture(join(ROOT, 'fixtures/pdf/layout-twins', filename));
      const text = parsedText(transactions);
      for (const forbidden of expected.mustRedact ?? []) expect(text).not.toContain(forbidden.toLowerCase());
      for (const skipped of [...(expected.mustSkipRows ?? []), ...(expected.mustSkipTables ?? [])]) expect(text).not.toContain(skipped.toLowerCase());
      for (const merchant of expected.mustFindOut) expect(text, `expected outgoing merchant: ${merchant}`).toContain(merchant.toLowerCase());
      if (filename.includes('emoney')) expect(text).not.toContain('shell');
      if (expected.mustAsk?.length) expect(detect(transactions, meta(transactions)).mustAsk.some((item) => item.name.toLowerCase().includes('transfer to a person'))).toBe(true);
    });
  }
});

describe('PDF external fixtures', () => {
  const cases = [
    { file: 'northstar-business-current-mar-2026.pdf', merchants: ['adobe creative cloud'], ignored: ['aurelia retail group', 'vista hotels india'], expectedRows: 16 },
    { file: 'meridian-salary-account-feb-2026.pdf', merchants: ['urban grocers powai', 'house of dosa', 'card bill autopay', 'powergrid billpay'], ignored: ['skyline health systems'], expectedRows: 16 },
    { file: 'astra-premier-checking-jan-2026.pdf', merchants: ['freshmart indiranagar', 'home rent january', 'citycab mobility'], ignored: ['acme analytics', 'client northbridge'], expectedRows: 8 },
  ];
  for (const item of cases) {
    it(`${item.file}: parses generic debit columns and excludes credits`, async () => {
      const { transactions } = await parseFixture(join(ROOT, 'fixtures/pdf/external', item.file));
      const text = parsedText(transactions);
      for (const merchant of item.merchants) expect(text).toContain(merchant);
      for (const credit of item.ignored) expect(text).not.toContain(credit);
      expect(transactions).toHaveLength(item.expectedRows);
    });
  }

  it('finds recurring Adobe Creative Cloud when enough statement months are present', async () => {
    const { transactions } = await parseFixture(join(ROOT, 'fixtures/pdf/external/northstar-business-current-mar-2026.pdf'));
    const expanded = [...transactions, ...transactions.filter((row) => row.merchantRaw.toLowerCase().includes('adobe')).map((row) => ({ ...row, date: '2026-04-07' }))];
    const result = detect(expanded, meta(expanded), '2026-04-10');
    expect([...result.recurring, ...result.habits].some((item) => item.merchantKey.includes('adobe'))).toBe(true);
  });
});

function meta(transactions: Array<{ date: string; currency: string }>) {
  const dates = transactions.map((item) => item.date).sort();
  const monthsSpan = dates.length > 1 ? (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / 86_400_000 / 30 : 0;
  return {
    displayCurrency: transactions[0]?.currency ?? 'EUR', dateFormat: 'dmy' as const,
    dateAmbiguous: false, monthsSpan, redactedCategories: [], columnQuestions: [], columnCount: 0,
  };
}
