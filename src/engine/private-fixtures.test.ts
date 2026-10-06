import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { parseCsvBytes } from './csv';
import { detect, transactionsFromRows } from './detect';
import { inferColumns } from './columns';
import { transactionsFromPdfPages, type PdfPage } from './pdf';

const PRIVATE = join(__dirname, '..', '..', 'private-fixtures');
const WISE = join(PRIVATE, 'wise_real.csv');
const OTP = join(PRIVATE, 'otp_rs_real_p1.pdf');

describe('local private statement regressions (private files are never committed)', () => {
  it.skipIf(!existsSync(WISE))('parses Wise transactions and never uses repeated account-holder columns as merchants', () => {
    const rows = parseCsvBytes(new Uint8Array(readFileSync(WISE)));
    const headerIndex = rows.findIndex((row) => row.some((cell) => /date|created|finished/i.test(cell)) && row.length > 3);
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    const header = rows[headerIndex]!;
    const body = rows.slice(headerIndex + 1);
    const inferred = inferColumns(header, body);
    const { transactions, meta } = transactionsFromRows(rows);
    const result = detect(transactions, meta);
    const upworkRows = transactions.filter((transaction) => /upwork/i.test(transaction.merchantRaw));
    expect(transactions.length).toBeGreaterThan(0);
    expect(result.transactions).toHaveLength(transactions.length);
    const holderValues = inferred.holderColumns.flatMap((index) => body.map((row) => row[index]?.trim()).filter((value): value is string => !!value));
    for (const holder of holderValues) expect(transactions.some((transaction) => transaction.merchantRaw === holder)).toBe(false);
    const subscriptions = [...result.recurring, ...result.possibleRecurring];
    expect(upworkRows.length).toBeGreaterThan(1);
    // This statement only repeats one Upwork amount on adjacent days, so it
    // must not extrapolate that cluster as a regular subscription.
    expect(subscriptions.some((item) => item.merchantKey.includes('upwork'))).toBe(false);
    expect(subscriptions.some((item) => item.merchantKey.includes('outscraper'))).toBe(false);
    for (const shop of ['maxi', 'idea', 'lidl', 'konzum', 'mercator', 'bingo', 'aman']) {
      expect(subscriptions.some((item) => item.merchantKey.includes(shop))).toBe(false);
    }
    for (const bill of ['infostan', 'mts']) {
      const item = subscriptions.find((candidate) => candidate.merchantKey.includes(bill));
      expect(item?.category, `${bill} must stay in bills`).toBe('bill');
    }
    console.info('Private Wise review', `rows=${transactions.length}`, `possibleRecurring=${result.possibleRecurring.length}`, `bills=${[...result.recurring, ...result.possibleRecurring].filter((item) => item.category === 'bill').length}`);
  });

  it.skipIf(!existsSync(OTP))('parses OTP PDF transactions and reports its generic balance-check coverage', async () => {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(OTP)), useSystemFonts: true, disableFontFace: true }).promise;
    const pages: PdfPage[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const content = await (await pdf.getPage(pageNo)).getTextContent();
      pages.push(content.items.flatMap((item) => 'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
    }
    const parsed = transactionsFromPdfPages(pages);
    expect(parsed.transactions.length).toBeGreaterThan(0);
    const text = JSON.stringify(parsed.transactions).toLowerCase();
    expect(text).not.toMatch(/account holder|iban|account number|private street|date and time of print/);
    const rate = parsed.balanceCheck.checked ? `${parsed.balanceCheck.passed}/${parsed.balanceCheck.checked}` : 'n/a';
    console.info('Private OTP review', `rows=${parsed.transactions.length}`, `balanceCheck=${rate}`, 'redaction=pass');
  });
});
