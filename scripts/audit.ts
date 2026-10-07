// Run the engine on one or more statement files from the terminal.
//   npm run audit -- private-fixtures/wise_real.csv private-fixtures/otp_rs_real_p1.pdf
// Everything runs locally. Nothing is uploaded.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCsvBytes } from '../src/engine/csv';
import { detect, transactionsFromRows, type DetectedItem, type ImportMeta } from '../src/engine/detect';
import { pdfItemsFromTextContent, transactionsFromPdfPages, type PdfPage } from '../src/engine/pdf';
import type { Transaction } from '../src/engine/types';

async function read(path: string): Promise<{ transactions: Transaction[]; meta?: ImportMeta; note: string }> {
  const ext = extname(path).toLowerCase();
  const bytes = new Uint8Array(readFileSync(path));
  if (ext === '.pdf') {
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
    const pages: PdfPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(pdfItemsFromTextContent(content.items));
    }
    const parsed = transactionsFromPdfPages(pages);
    const check = parsed.balanceCheck.checked ? `balance check ${parsed.balanceCheck.passed}/${parsed.balanceCheck.checked}` : 'no balance check';
    const ask = parsed.columnQuestions.length ? ', COULD NOT FIND THE TABLE' : '';
    return { transactions: parsed.transactions, note: `${pdf.numPages} pages, ${check}${ask}` };
  }
  const rows = ext === '.xlsx' || ext === '.xls'
    ? XLSX.utils.sheet_to_json<string[]>(XLSX.read(bytes, { type: 'array' }).Sheets[XLSX.read(bytes, { type: 'array' }).SheetNames[0]!]!, { header: 1, raw: false, defval: '' })
    : parseCsvBytes(bytes);
  const result = transactionsFromRows(rows, 'EUR');
  return { transactions: result.transactions, meta: result.meta, note: result.meta.dateAmbiguous ? 'dates ambiguous (dd/mm or mm/dd)' : '' };
}

const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;
const line = (i: DetectedItem) => {
  const extra = i.extraPurchases ? `  + ${i.extraPurchases.label ?? 'extras'} ${i.extraPurchases.charges}x ${money(i.extraPurchases.total, i.currency)}` : '';
  const up = i.priceIncrease ? `  price up ${i.priceIncrease.from} -> ${i.priceIncrease.to}` : '';
  return `  ${i.name.padEnd(28)} ${money(i.price, i.currency).padStart(14)}  ${String(i.frequency).padEnd(9)} ${i.charges}x  last ${i.lastCharge}${i.estimate ? '  estimate' : ''}${extra}${up}`;
};

async function main() {
  const files = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!files.length) {
    console.log('Usage: npm run audit -- <file> [more files]');
    process.exit(1);
  }
  const all: Transaction[] = [];
  for (const file of files) {
    const { transactions, note } = await read(file);
    console.log(`${file}: ${transactions.length} payments out${note ? ` (${note})` : ''}`);
    all.push(...transactions);
  }
  const unique = [...new Map(all.map((t) => [`${t.date}|${t.merchantRaw.toLowerCase()}|${t.amount}|${t.currency}`, t])).values()];
  const dates = unique.map((t) => t.date).sort();
  const currencies = new Map<string, number>();
  for (const t of unique) currencies.set(t.currency, (currencies.get(t.currency) ?? 0) + 1);
  const currency = [...currencies].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  const months = dates.length > 1 ? (Date.parse(dates.at(-1)!) - Date.parse(dates[0]!)) / 86_400_000 / 30 : 0;
  const meta: ImportMeta = { displayCurrency: currency, dateFormat: 'iso', dateAmbiguous: false, monthsSpan: months, redactedCategories: [], columnQuestions: [], columnCount: 0 };
  const r = detect(unique, meta);

  console.log(`\n${dates[0]} to ${dates.at(-1)}, ${months.toFixed(1)} months, shown in ${currency}`);
  const found = [...r.recurring, ...r.possibleRecurring];
  const section = (title: string, items: DetectedItem[]) => {
    console.log(`\n${title} (${items.length})`);
    for (const item of items.sort((a, b) => b.price - a.price)) console.log(line(item));
  };
  section('SUBSCRIPTIONS', found.filter((i) => i.category === 'digital' || i.category === 'membership' || i.category === 'other'));
  section('BILLS', found.filter((i) => i.category === 'bill'));
  section('PAY-AS-YOU-GO AND ONE-TIME', r.habits);
  section('ENDED (no charge for 60+ days)', r.ended);
  console.log('\nSPENDING BY CATEGORY');
  for (const [name, total] of Object.entries(r.spendingByCategory)) console.log(`  ${name.padEnd(28)} ${money(total, currency).padStart(14)}`);
  if (r.possibleDoubleCharges.length) {
    console.log('\nPOSSIBLE DOUBLE CHARGES');
    for (const d of r.possibleDoubleCharges) console.log(`  ${d.name} ${money(d.amount, d.currency)} on ${d.firstCharge} and ${d.secondCharge}`);
  }
  if (r.mustAsk.length) console.log(`\nWILL ASK THE USER ABOUT ${r.mustAsk.length} transfer(s) to people`);
  console.log(`\nIGNORED (${r.ignored.length}): ${r.ignored.map((i) => i.name).join(', ')}`);
}

void main();
