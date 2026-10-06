// Generic text-PDF table reconstruction. Uses row geometry and semantic column
// headings, never institution names or per-bank layout branches.
import { parseAmount, parseDate, type DateFormat } from './parse';
import { redactDescription } from './redact';
import type { Transaction } from './types';

export type PdfTextItem = { str: string; x: number; y: number; width?: number };
export type PdfPage = PdfTextItem[];
type Line = { y: number; cells: PdfTextItem[]; text: string };
type TableHeader = { page: number; line: number; dateX: number; descriptionX: number; outX?: number; inX?: number; balanceX?: number; singleAmountX?: number };

const DATE = /(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b|\b(?:\d{1,2}\s+)?[A-Za-z]{3,9}[,.]?\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?\b)/;
const AMOUNT = /(?:[€£$₹]|\b(?:INR|USD|EUR|GBP)\b)?\s*\(?-?\d[\d,.'’ ]*\.\d{2}\)?-?/g;

export function transactionsFromPdfPages(pages: PdfPage[]): { transactions: Transaction[]; redactedCategories: string[] } {
  const pageLines = pages.map(groupLines);
  const headers: TableHeader[] = [];
  for (let p = 0; p < pageLines.length; p++) {
    const lines = pageLines[p]!;
    lines.forEach((line, i) => {
      const h = compactHeader(line.text);
      if (!h.includes('date') && !h.includes('datum') || !h.includes('description') || !/(?:moneyout|moneyin|paidout|paidin|withdraw|deposit|debit|credit|haben|soll|duguje|potrazuje|rashod|prihod)/.test(h)) return;
      const dateX = headingX(line, /date|datum|fecha|data|tarih/i);
      const descriptionX = headingX(line, /description|narrative|details|opis|libelle|verwendungszweck/i);
      if (dateX === undefined || descriptionX === undefined) return;
      const outX = headingX(line, /moneyout|paidout|withdrawal|withdrawn|debit|soll|duguje|rashod|出金/i);
      const inX = headingX(line, /moneyin|paidin|deposit|credit|haben|potrazuje|prihod|入金/i);
      const balanceX = headingX(line, /balance|saldo|stanje/i);
      const singleAmountX = headingX(line, /amount|transactionamount|iznos|betrag/i);
      if (outX === undefined && inX === undefined && singleAmountX === undefined) return;
      headers.push({ page: p, line: i, dateX, descriptionX, outX, inX, balanceX, singleAmountX });
    });
  }

  const selected = headers.filter((header) => {
    const line = pageLines[header.page]![header.line]!;
    const previous = pageLines[header.page]!.slice(Math.max(0, header.line - 3), header.line).map((item) => item.text).join(' ');
    const context = normalizeHeader(`${previous} ${line.text}`);
    return !/\b(pending|balance summary|summary of balances|opening balance|closing balance)\b/.test(context);
  });
  const transactionHeaders = selected.filter((header) => {
    const previous = pageLines[header.page]!.slice(Math.max(0, header.line - 3), header.line).map((item) => item.text).join(' ');
    return /\b(transactions?|activity|statement entries|account entries)\b/i.test(previous);
  });
  const active = transactionHeaders.length ? transactionHeaders : selected;
  if (!active.length) return { transactions: [], redactedCategories: [] };

  const allText = pageLines.flat().map((line) => line.text).join('\n');
  const year = Number(allText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear());
  const rows: Array<{ date: string; description: string; amount: number; x: number }> = [];
  const categories = new Set<string>();
  let carriedDate = '';
  let precedingDescription = '';

  for (const header of active) {
    const lines = pageLines[header.page]!;
    for (let i = header.line + 1; i < lines.length; i++) {
      const line = lines[i]!;
      const normalized = normalizeHeader(line.text);
      if (isTableHeader(normalized)) break;
      if (/\b(?:page\s+\d+\s+of\s+\d+|customer care|synthetic test document|this page is synthetic|continued statement)\b/i.test(normalized)) continue;
      const dateText = line.cells.filter((cell) => cell.x < header.descriptionX).map((cell) => cell.str).find((cell) => DATE.test(cell.trim())) ?? '';
      const explicitDate = dateText ? completeDate(dateText, year) : '';
      const firstAmountX = Math.min(header.outX ?? Infinity, header.inX ?? Infinity, header.singleAmountX ?? Infinity);
      const beforeDate = line.cells.filter((cell) => cell.x >= header.descriptionX && cell.x < firstAmountX && cell.str.trim() && !DATE.test(cell.str)).map((cell) => cell.str.trim()).join(' ');
      const moneyCells = line.cells.flatMap((cell) => extractAmounts(cell.str).map((amount) => ({ ...amount, x: cell.x })));
      if (!moneyCells.length) {
        if (beforeDate && !isSubline(beforeDate) && (explicitDate || /(?:\/\s*(?:dr|cr|debit|credit)\s*\/|\b(?:debit|credit|transfer|card transaction|online transaction)\b)/i.test(beforeDate))) precedingDescription = appendText(precedingDescription, beforeDate);
        continue;
      }
      if (explicitDate) carriedDate = explicitDate;
      const date = explicitDate || carriedDate;
      if (!date) {
        if (beforeDate && !isSubline(beforeDate) && /(?:\/\s*(?:dr|cr|debit|credit)\s*\/|\b(?:debit|credit|transfer|card transaction)\b)/i.test(beforeDate)) precedingDescription = appendText(precedingDescription, beforeDate);
        continue;
      }

      const candidates = moneyCells.filter((cell) => {
        const outDistance = header.outX === undefined ? Infinity : Math.abs(cell.x - header.outX);
        const inDistance = header.inX === undefined ? Infinity : Math.abs(cell.x - header.inX);
        if (header.outX !== undefined && header.inX !== undefined) {
          const balanceDistance = header.balanceX === undefined ? Infinity : Math.abs(cell.x - header.balanceX);
          return outDistance < inDistance && outDistance < balanceDistance;
        }
        if (header.outX !== undefined && header.inX === undefined) return outDistance < (header.balanceX === undefined ? 35 : Math.abs(cell.x - header.balanceX));
        if (header.inX !== undefined) return false;
        return cell.x >= (header.singleAmountX ?? header.descriptionX);
      });
      if (!candidates.length) {
        precedingDescription = '';
        continue;
      }

      let description = appendText(precedingDescription, beforeDate);
      precedingDescription = '';
      // Card and payment-order prefixes are transport metadata; retain only the
      // counterparty portion, independent of the statement's institution.
      description = cleanMerchant(description || beforeDate || line.text);
      if (isOpeningOrSummary(description)) continue;
      if (isSubline(description) || !description) continue;
      const parsedDate = parseDate(date, date.includes('/') ? 'ambiguous' : 'dmy');
      if (!parsedDate) continue;
      for (const candidate of candidates.slice(0, 1)) {
        const raw = candidate.value;
        const amount = Math.abs(raw);
        if (!(amount > 0)) continue;
        const redacted = redactDescription(description);
        rows.push({ date: parsedDate, description: redacted, amount, x: candidate.x });
        if (/[•]/.test(redacted) || /\b(?:[\dX*]{4,})\b/.test(description)) categories.add('card number');
      }
    }
  }

  // Collapse duplicate page extraction artifacts while retaining legitimate
  // same-day/same-value transactions with different descriptions.
  const seen = new Set<string>();
  const transactions = rows.filter((row) => {
    const key = `${row.date}\0${row.description}\0${row.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ date, description, amount }) => ({ date, merchantRaw: description, amount, currency: currencyFromDescription(description, allText) }));
  return { transactions, redactedCategories: [...categories] };
}

function groupLines(items: PdfPage): Line[] {
  const sorted = items.filter((item) => item.str.trim()).map((item) => ({ ...item, y: Number(item.y.toFixed(1)) })).sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const item of sorted) {
    let group = groups.find((items) => Math.abs(items[0]!.y - item.y) <= 2.5);
    if (!group) groups.push((group = []));
    group.push(item);
  }
  return groups.map((cells) => {
    cells.sort((a, b) => a.x - b.x);
    return { y: cells[0]!.y, cells, text: cells.map((cell) => cell.str.trim()).join(' ') };
  }).sort((a, b) => b.y - a.y);
}

function headingX(line: Line, pattern: RegExp): number | undefined {
  for (const cell of line.cells) {
    const compact = compactHeader(cell.str);
    const match = pattern.exec(compact);
    if (match) return cell.x + (cell.width ?? 0) * match.index / Math.max(1, compact.length);
  }
  return undefined;
}

function compactHeader(value: string): string { return normalizeHeader(value).replace(/\s+/g, ''); }

function normalizeHeader(value: string): string {
  return value.replace(/(?:\p{L}\s){2,}\p{L}/gu, (chunk) => chunk.replace(/\s+/g, '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isTableHeader(value: string): boolean {
  const compact = compactHeader(value);
  return compact.includes('date') && compact.includes('description') && /(?:moneyout|moneyin|paidout|paidin|withdraw|deposit|debit|credit|haben|soll|duguje|potrazuje|rashod|prihod)/.test(compact);
}

function completeDate(raw: string, year: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (/\b\d{1,2}\s+[A-Za-z]{3,9}\b/.test(normalized) && !/\b20\d{2}\b/.test(normalized)) return normalized.replace(/\b([A-Za-z]{3,9})\b/, '$1') + ` ${year}`;
  if (/\b[A-Za-z]{3,9}\s+\d{1,2},?\s*$/.test(normalized)) return `${normalized} ${year}`;
  return normalized;
}

function extractAmounts(text: string): Array<{ value: number }> {
  const matches = [...text.matchAll(AMOUNT)];
  return matches.map((match) => ({ value: parseAmount(match[0]!) ?? 0 })).filter((item) => item.value !== 0);
}

function appendText(a: string, b: string): string { return [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }

function isSubline(value: string): boolean { return /^(?:vpa|utr|ref|rrn|auth|to|mobile|customer id|folio|txn)\b\s*[:#-]?|^card\s*:/i.test(value); }

function isOpeningOrSummary(value: string): boolean { return /\b(brought forward|carried forward|opening balance|closing balance|balance summary|pending)\b/i.test(value); }

function cleanMerchant(value: string): string {
  let result = value.replace(/\s+/g, ' ').trim();
  result = result.replace(/^card transaction\s+\S+\s+\S+(?:\s+(?:cd|d))?\s+/i, '');
  result = result.replace(/^(?:upi|neft|ach|imps|pos|atm|rtgs|sip)\s*\/\s*(?:dr|debit)\s*\/\s*/i, '');
  result = result.replace(/^(?:upi|neft|ach|imps|pos|atm|rtgs|sip)\s+(?:dr|debit)\s+/i, '');
  if (/^online transaction\b/i.test(result)) return 'Transfer to a person';
  result = result.replace(/^(?:standing order|direct debit)\s+/i, '');
  result = result.replace(/^(?:payment|transfer)\s+(?:to|for)\s+/i, 'Transfer to a person ');
  result = result.replace(/\b(?:vpa|utr|ref|rrn|auth|mobile|customer id|folio|txn)\b.*$/i, '').trim();
  // Private beneficiary names are intentionally not carried into display data.
  if (/\btransfer to a person\b/i.test(result)) return 'Transfer to a person';
  return result.replace(/\s+/g, ' ').trim();
}

function currencyFromDescription(_description: string, text: string): string {
  const code = text.match(/\b(?:Currency\s+)?(INR|USD|EUR|GBP|CAD|AUD|NZD|CHF|JPY)\b/i)?.[1];
  if (code) return code.toUpperCase();
  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('$')) return 'USD';
  return 'EUR';
}

// Expose format type through this module without making consumers depend on
// PDF.js internals.
export type PdfDateFormat = DateFormat;
