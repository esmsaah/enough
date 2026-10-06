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
      const { transactions, balanceCheck } = await parseFixture(join(ROOT, 'fixtures/pdf/layout-twins', filename));
      const text = parsedText(transactions);
      for (const forbidden of expected.mustRedact ?? []) expect(text).not.toContain(forbidden.toLowerCase());
      for (const skipped of [...(expected.mustSkipRows ?? []), ...(expected.mustSkipTables ?? [])]) expect(text).not.toContain(skipped.toLowerCase());
      for (const merchant of expected.mustFindOut) expect(text, `expected outgoing merchant: ${merchant}`).toContain(merchant.toLowerCase());
      if (filename.includes('emoney')) expect(text).not.toContain('shell');
      if (expected.mustAsk?.length) expect(detect(transactions, meta(transactions)).mustAsk.some((item) => item.name.toLowerCase().includes('transfer to a person'))).toBe(true);
      console.info('PDF audit', filename, `rows=${transactions.length}`, `balance=${balanceCheck.checked ? `${balanceCheck.passed}/${balanceCheck.checked} (${Math.round(balanceCheck.passed / balanceCheck.checked * 100)}%)` : 'n/a'}`, 'redaction=pass');
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
      const { transactions, balanceCheck } = await parseFixture(join(ROOT, 'fixtures/pdf/external', item.file));
      const text = parsedText(transactions);
      for (const merchant of item.merchants) expect(text).toContain(merchant);
      for (const credit of item.ignored) expect(text).not.toContain(credit);
      expect(transactions).toHaveLength(item.expectedRows);
      console.info('PDF audit', item.file, `rows=${transactions.length}`, `balance=${balanceCheck.checked ? `${balanceCheck.passed}/${balanceCheck.checked} (${Math.round(balanceCheck.passed / balanceCheck.checked * 100)}%)` : 'n/a'}`, 'redaction=pass');
    });
  }

  it('finds recurring Adobe Creative Cloud when enough statement months are present', async () => {
    const { transactions } = await parseFixture(join(ROOT, 'fixtures/pdf/external/northstar-business-current-mar-2026.pdf'));
    const expanded = [...transactions, ...transactions.filter((row) => row.merchantRaw.toLowerCase().includes('adobe')).map((row) => ({ ...row, date: '2026-04-07' }))];
    const result = detect(expanded, meta(expanded), '2026-04-10');
    expect([...result.recurring, ...result.habits].some((item) => item.merchantKey.includes('adobe'))).toBe(true);
  });
});

describe('modeled PDF fixtures', () => {
  for (const file of ['ba_modeled_text.pdf', 'de_modeled_text.pdf']) {
    it(`${file}: finds transaction rows and excludes private statement details`, async () => {
      const { transactions, balanceCheck } = await parseFixture(join(ROOT, 'fixtures/pdf', file));
      const text = parsedText(transactions);
      const redactionPass = !/account holder|iban|address:|account number|card number|opening balance|closing balance|ana testi[cć]|ulica primjera|ba39 1290|de89 3704/i.test(text);
      console.info('PDF audit', file, `rows=${transactions.length}`, `balance=${balanceCheck.checked ? `${balanceCheck.passed}/${balanceCheck.checked} (${Math.round(balanceCheck.passed / balanceCheck.checked * 100)}%)` : 'n/a'}`, `redaction=${redactionPass ? 'pass' : 'fail'}`);
      expect(transactions.length).toBeGreaterThan(0);
      expect(redactionPass).toBe(true);
    });
  }
});

describe('generic stacked-header and balance-column layout', () => {
  it('uses value dates, handles amounts before description, joins continuation lines, and validates balances', () => {
    const page: PdfPage = [];
    const add = (y: number, x: number, str: string, width = 70) => page.push({ y, x, str, width });
    add(810, 30, 'Name: Private Account Holder');
    add(795, 30, 'Address: Private Street');
    add(780, 30, 'Račun: XX0000000000000000');
    add(765, 30, 'Stanje na računu');
    add(750, 30, 'Datum /'); add(750, 70, 'knjiženja');
    add(735, 140, 'Datum /'); add(735, 180, 'valute');
    add(720, 230, 'Uplate'); add(720, 310, 'Isplate'); add(720, 400, 'Opis'); add(720, 600, 'Stanje (RSD)');
    add(700, 400, 'Početno stanje'); add(700, 600, '10.000,00');
    add(685, 30, '01.09.2026'); add(685, 140, '02.09.2026'); add(685, 310, '2.000,00'); add(685, 400, 'Komunalna usluga'); add(685, 600, '8.000,00');
    add(675, 400, 'detalj transakcije');
    add(660, 30, '03.09.2026'); add(660, 140, '04.09.2026'); add(660, 230, '3.000,00'); add(660, 400, 'Uplata zarade'); add(660, 600, '11.000,00');
    add(645, 30, '05.09.2026'); add(645, 140, '06.09.2026'); add(645, 310, '1.000,00'); add(645, 400, 'Telefonska usluga'); add(645, 600, '10.000,00');
    add(620, 30, 'Datum i vreme štampe: 06.09.2026');
    add(605, 30, '1 od 6 · Bank contact details');

    const parsed = transactionsFromPdfPages([page]);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions.map((row) => row.date)).toEqual(['2026-09-02', '2026-09-06']);
    expect(parsed.transactions.map((row) => row.amount)).toEqual([2000, 1000]);
    expect(parsed.transactions[0]?.merchantRaw).toContain('detalj transakcije');
    expect(parsed.transactions.map((row) => row.merchantRaw).join(' ')).not.toContain('private account holder');
    expect(parsed.transactions.map((row) => row.merchantRaw).join(' ')).not.toContain('stanje na računu');
    expect(parsed.balanceCheck).toEqual({ checked: 2, passed: 2 });
  });

  it('returns the column-question state when a layout is too ambiguous to infer', () => {
    const parsed = transactionsFromPdfPages([[{ y: 100, x: 20, str: 'Unlabeled statement values 02.09.2026 40.00' }]]);
    expect(parsed.transactions).toEqual([]);
    expect(parsed.columnQuestions.map((question) => question.role)).toEqual(['date', 'amount', 'merchant']);
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
