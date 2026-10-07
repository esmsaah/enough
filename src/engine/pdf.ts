// Generic text-PDF table reconstruction. Uses row geometry and semantic column
// headings, never institution names or per-bank layout branches.
import { parseAmount, parseDate, type DateFormat } from './parse';
import { redactDescription } from './redact';
import type { Transaction } from './types';

export type PdfTextItem = { str: string; x: number; y: number; width?: number };
export type PdfPage = PdfTextItem[];
type Line = { y: number; cells: PdfTextItem[]; text: string };
type TableHeader = { page: number; line: number; dateX: number; fallbackDateX?: number; descriptionX: number; outX?: number; inX?: number; balanceX?: number; singleAmountX?: number; genericLayout: boolean };
export type PdfColumnQuestion = { role: 'date' | 'amount' | 'merchant'; candidates: number[] };
export type PdfBalanceCheck = { checked: number; passed: number };
export type PdfParseResult = { transactions: Transaction[]; redactedCategories: string[]; balanceCheck: PdfBalanceCheck; columnQuestions: PdfColumnQuestion[]; columnCount: number };

const DATE = /(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b|\b(?:\d{1,2}\s+)?[A-Za-z]{3,9}[,.]?\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?\b)/;
const AMOUNT = /(?:[€£$₹]|\b(?:INR|USD|EUR|GBP|RSD|BAM)\b)?\s*\(?[-+]?\d[\d,.'’ ]*(?:[.,]\d{2})\)?[-+]?/g;

/** PDF.js text items → page cells. Rotated text (diagonal watermarks such as
 *  "This is not an official statement") is dropped. */
export function pdfItemsFromTextContent(items: unknown[]): PdfPage {
  return items.flatMap((raw) => {
    const item = raw as { str?: string; transform?: number[]; width?: number };
    if (typeof item.str !== 'string' || !item.transform) return [];
    if (Math.abs(item.transform[1] ?? 0) > 0.01 || Math.abs(item.transform[2] ?? 0) > 0.01) return [];
    return [{ str: item.str, x: item.transform[4]!, y: item.transform[5]!, width: item.width }];
  });
}

export function transactionsFromPdfPages(pages: PdfPage[]): PdfParseResult {
  const pageLines = pages.map(groupLines);
  const columnXs = clusterXs(pageLines.flatMap((lines) => lines.flatMap((line) => line.cells.map((cell) => cell.x))));
  const questions = (): PdfColumnQuestion[] => ['date', 'amount', 'merchant'].map((role) => ({ role: role as PdfColumnQuestion['role'], candidates: columnXs.map((_, index) => index) }));
  const headers: TableHeader[] = [];
  for (let p = 0; p < pageLines.length; p++) {
    const lines = pageLines[p]!;
    lines.forEach((line, i) => {
      const descriptionX = headingX(line, /description|narrative|details|opis|libelle|verwendungszweck|erlauterung|erläuterung|buchungstext|beschreibung|descripcion|concepto|omschrijving|descrizione|causale|descricao|aciklama|popis|tresc|szczegoly/i);
      const h = compactHeader(line.text);
      if (descriptionX === undefined || !/(?:moneyout|moneyin|paidout|paidin|withdraw|deposit|debit|credit|amount|iznos|betrag|haben|soll|duguje|potrazuje|rashod|prihod|uplate|isplate|uplata|isplata|priliv|odliv)/.test(h)) return;
      // A date caption can be split across multiple nearby text lines. Treat
      // captions as hints and bind them to columns by x position.
      const nearby = lines.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
        .filter(({ candidate }) => Math.abs(candidate.y - line.y) <= 48);
      const nearbyCells = nearby.flatMap(({ candidate }) => candidate.cells.map((cell) => ({ cell, y: candidate.y })));
      const dateLabels = nearbyCells.filter(({ cell }) => /(?:date|datum|fecha|data|tarih)/.test(compactHeader(cell.str)))
        .map(({ cell, y }) => {
          const sublabel = nearbyCells.filter(({ cell: sibling, y: siblingY }) =>
            sibling !== cell && Math.abs(sibling.x - cell.x) <= 70 && Math.abs(siblingY - y) <= 18
            && /(?:valute|knjizen|booking|posted|posting|booked|value|valeur|valor|valuta|wert)/.test(compactHeader(sibling.str)),
          ).sort((a, b) => Math.abs(a.cell.x - cell.x) - Math.abs(b.cell.x - cell.x))[0]?.cell.str;
          return { x: cell.x, label: compactHeader(`${cell.str} ${sublabel ?? ''}`) };
        });
      const valueDate = dateLabels.find(({ label }) => /(?:valute|value|valeur|valor|valuta)/.test(label));
      const postingDate = dateLabels.find(({ label }) => /(?:knjizen|booking|posted|posting|booked|schrift)/.test(label));
      const directDateX = headingX(line, /date|datum|fecha|data|tarih/i);
      const dateX = valueDate?.x ?? directDateX ?? postingDate?.x;
      const fallbackDateX = valueDate && postingDate ? postingDate.x : undefined;
      if (dateX === undefined) return;
      const outX = headingX(line, /moneyout|paidout|withdrawal|withdrawn|debit|soll|duguje|rashod|isplate|isplata|odliv|teret|出金/i);
      const inX = headingX(line, /moneyin|paidin|deposit|credit|haben|potrazuje|prihod|uplate|uplata|priliv|入金/i);
      const balanceX = headingX(line, /balance|saldo|stanje/i);
      const singleAmountX = headingX(line, /amount|transactionamount|iznos|betrag/i);
      if (outX === undefined && inX === undefined && singleAmountX === undefined) return;
      const finalHeaderLine = Math.max(i, ...nearby.filter(({ candidate }) => candidate.cells.some((cell) => /(?:date|datum|fecha|data|tarih)/.test(compactHeader(cell.str)))).map(({ candidateIndex }) => candidateIndex));
      const genericLayout = fallbackDateX !== undefined || [outX, inX, singleAmountX].some((x) => x !== undefined && x < descriptionX);
      headers.push({ page: p, line: finalHeaderLine, dateX, fallbackDateX, descriptionX, outX, inX, balanceX, singleAmountX, genericLayout });
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
  if (!active.length) {
    // No column header at all: many app-made statements list each payment as a
    // small block instead of a table row. Try that before asking the person.
    const blocks = transactionsFromBlocks(pageLines);
    if (blocks.length) return { transactions: blocks, redactedCategories: [], balanceCheck: { checked: 0, passed: 0 }, columnQuestions: [], columnCount: columnXs.length };
    return { transactions: [], redactedCategories: [], balanceCheck: { checked: 0, passed: 0 }, columnQuestions: questions(), columnCount: columnXs.length };
  }

  const allText = pageLines.flat().map((line) => line.text).join('\n');
  const year = Number(allText.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear());
  const rows: Array<{ date: string; description: string; amount: number; x: number; y: number; nums: Array<{ x: number; value: number }>; header: TableHeader; page: number }> = [];
  const categories = new Set<string>();
  let carriedDate = '';
  let precedingDescription = '';
  let continuationTarget: ParsedRowForBalance | undefined;
  let counterpartyTarget: ParsedRowForBalance | undefined;
  let datedMoneyLines = 0; // table rows seen, in or out
  const standingOrders = new Set<object>(); // standing orders are bills (rent, loans), a channel signal
  let balanceCheck: PdfBalanceCheck = { checked: 0, passed: 0 };

  for (const header of active) {
    const lines = pageLines[header.page]!;
    // A single amount column with explicit signs (12,99- / 400,00+ / -12.99):
    // positive values there are money in, never spending.
    const signedSingleColumn = header.outX === undefined && header.inX === undefined && header.singleAmountX !== undefined
      && lines.slice(header.line + 1).some((line) => line.cells.some((cell) => !DATE.test(cell.str.trim()) && extractAmounts(cell.str).some((amount) => amount.explicitSign)));
    for (let i = header.line + 1; i < lines.length; i++) {
      const line = lines[i]!;
      const normalized = normalizeHeader(line.text);
      if (isTableHeader(normalized)) break;
      if (/\b(?:page\s+\d+\s+of\s+\d+|\d+\s+od\s+\d+|customer care|customer service|synthetic test document|this page is synthetic|continued statement|datum i vreme stampe|bank contact|kontakt centar)\b/i.test(normalized)) continue;
      const dateCells = line.cells.filter((cell) => cell.x < header.descriptionX && DATE.test(cell.str.trim()));
      const dateText = dateCells.find((cell) => Math.abs(cell.x - header.dateX) <= 45)?.str
        ?? (header.fallbackDateX === undefined ? undefined : dateCells.find((cell) => Math.abs(cell.x - header.fallbackDateX!) <= 45)?.str)
        ?? dateCells[0]?.str ?? '';
      const explicitDate = dateText ? completeDate(dateText, year) : '';
      const followingAmountX = [header.outX, header.inX, header.singleAmountX]
        .filter((x): x is number => x !== undefined && x > header.descriptionX)
        .sort((a, b) => a - b)[0];
      const amountBeforeDescription = [header.outX, header.inX, header.singleAmountX].some((x) => x !== undefined && x < header.descriptionX);
      const descriptionEndX = header.genericLayout && amountBeforeDescription
        ? (header.balanceX !== undefined && header.balanceX > header.descriptionX ? header.balanceX : Infinity)
        : followingAmountX ?? Math.min(header.balanceX ?? Infinity, Infinity);
      const beforeDate = line.cells.filter((cell) => cell.x >= header.descriptionX - 15 && cell.x < descriptionEndX && cell.str.trim() && !DATE.test(cell.str)).map((cell) => cell.str.trim()).join(' ');
      const moneyCells = line.cells.filter((cell) => !DATE.test(cell.str.trim())).flatMap((cell) => extractAmounts(cell.str).map((amount) => ({ ...amount, x: cell.x })));
      if (!moneyCells.length) {
        if (beforeDate && !explicitDate && counterpartyTarget && Math.abs(counterpartyTarget.y - line.y) <= 30) {
          counterpartyTarget.description = cleanMerchant(beforeDate);
          counterpartyTarget = undefined;
          continue;
        }
        if (beforeDate && !isSubline(beforeDate) && !isOpeningOrSummary(beforeDate)) {
          const isContinuation = header.genericLayout && !explicitDate && continuationTarget && Math.abs(continuationTarget.y - line.y) <= 18;
          if (isContinuation && continuationTarget) continuationTarget.description = appendText(continuationTarget.description, cleanMerchant(beforeDate));
          else if (!header.genericLayout && (explicitDate || /(?:\/\s*(?:dr|cr|debit|credit)\s*\/|\b(?:debit|credit|transfer|card transaction|online transaction)\b)/i.test(beforeDate))) precedingDescription = appendText(precedingDescription, beforeDate);
          else if (header.genericLayout && !explicitDate) precedingDescription = appendText(precedingDescription, beforeDate);
        }
        continue;
      }
      if (explicitDate) carriedDate = explicitDate;
      if (explicitDate) datedMoneyLines++;
      const date = explicitDate || carriedDate;
      if (!date) {
        if (beforeDate && !isSubline(beforeDate) && /(?:\/\s*(?:dr|cr|debit|credit)\s*\/|\b(?:debit|credit|transfer|card transaction)\b)/i.test(beforeDate)) precedingDescription = appendText(precedingDescription, beforeDate);
        continuationTarget = undefined;
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
        if (cell.x < (header.singleAmountX ?? header.descriptionX) - 40) return false;
        return !signedSingleColumn || cell.value < 0;
      });
      if (!candidates.length) {
        // Keep incoming rows as balance evidence even though imports only
        // return outgoing transactions.
        const incomingDate = date ? parseDate(date, date.includes('/') ? 'ambiguous' : 'dmy') : null;
        if (header.balanceX !== undefined && incomingDate) {
          rows.push({ date: incomingDate, description: '', amount: 0, x: 0, y: line.y, nums: moneyCells, header, page: header.page });
        }
        precedingDescription = '';
        continuationTarget = undefined;
        counterpartyTarget = undefined;
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
        const parsedRow = { date: parsedDate, description, amount, x: candidate.x, y: line.y, nums: moneyCells, header, page: header.page };
        rows.push(parsedRow);
        continuationTarget = parsedRow;
        counterpartyTarget = isBookingType(description) ? parsedRow : undefined;
        if (/^(?:dauerauftrag|standing order|trajni nalog|ordre permanent|orden permanente|ordine permanente)$/i.test(normalizeHeader(description))) standingOrders.add(parsedRow);
        if (/[•]/.test(description) || /\b(?:[\dX*]{4,})\b/.test(description)) categories.add('card number');
      }
    }
  }

  // Collapse duplicate page extraction artifacts while retaining legitimate
  // same-day/same-value transactions with different descriptions.
  const seen = new Set<string>();
  balanceCheck = validateBalances(rows);
  const safeRows = rows.filter((row) => row.amount > 0).map((row) => ({ ...row, standing: standingOrders.has(row), description: redactDescription(cleanMerchant(row.description)) }));
  const transactions = safeRows.filter((row) => {
    const key = `${row.date}\0${row.description}\0${row.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ date, description, amount, standing }) => ({ date, merchantRaw: description, amount, currency: currencyFromDescription(description, allText), ...(standing ? { bankCategoryHint: 'bill' as const } : {}) }));
  const columnCount = columnXs.length;
  // A readable table with only money in (no spending) needs no column question.
  const columnQuestions = transactions.length || datedMoneyLines > 0 ? [] : questions();
  return { transactions, redactedCategories: [...categories], balanceCheck, columnQuestions, columnCount };
}


// Some PDF producers merge "02.01.2026 02.01.2026 Lastschrift ... 13,99-" into
// one text item. Split leading numeric dates and a trailing amount into their
// own cells, with x estimated from character position, so columns still work.
const LEADING_DATE = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\.?|\d{4}[./-]\d{1,2}[./-]\d{1,2})\s+/;
const TRAILING_AMOUNT = /\s+([-+]?\(?\d[\d.,'’]*[.,]\d{2}\)?[-+]?)$/;
function splitCell(item: PdfTextItem): PdfTextItem[] {
  const text = item.str;
  const width = item.width ?? 0;
  if (!width || text.trim().split(/\s+/).length < 2) return [item];
  const at = (index: number) => item.x + width * index / Math.max(1, text.length);
  const out: PdfTextItem[] = [];
  let start = 0;
  let rest = text;
  for (let match = LEADING_DATE.exec(rest); match; match = LEADING_DATE.exec(rest)) {
    out.push({ ...item, str: match[1]!, x: at(start), width: width * match[1]!.length / text.length });
    start += match[0].length;
    rest = text.slice(start);
  }
  const tail = TRAILING_AMOUNT.exec(rest);
  const middle = tail ? rest.slice(0, tail.index) : rest;
  if (middle.trim()) out.push({ ...item, str: middle, x: at(start), width: width * middle.length / text.length });
  if (tail) out.push({ ...item, str: tail[1]!, x: at(start + tail.index + tail[0].length - tail[1]!.length), width: width * tail[1]!.length / text.length });
  return out.length ? out : [item];
}

// ---------------------------------------------------------------------------
// Block layout (fintech exports such as Wise, Revolut, N26 PDFs):
//   "<status> | <counterparty>            <original amount CUR>"
//   "<full date> | Transaction: <TYPE> | Category: <label>   <fee CUR>  <amount CUR>"
// Amounts carry a currency code; the last one in the block is the account amount.
// ---------------------------------------------------------------------------
const CODED_AMOUNT = /(?:^|\s)([-+−]?\d[\d,' ]*(?:\.\d+)?)\s*([A-Z]{3})\b/g;
const SKIP_STATUS = /^(?:moved|cancelled|canceled|declined|card checked|refunded|received|added|topped up|converted|reverted|failed)\b/i;
const PERSON_STATUS = /^(?:sent|transfer|paid to)\b/i;
const CASH_STATUS = /^(?:withdrawn|cash withdrawal|atm)\b/i;
const SKIP_CATEGORY = /\b(?:money added|cash|transfers?|savings|exchange|income|salary|refund)\b/i;

function codedAmounts(text: string): Array<{ value: number; currency: string }> {
  return [...text.matchAll(CODED_AMOUNT)].flatMap((match) => {
    const value = parseAmount(match[1]!.replace(/[ ']/g, '').replace('−', '-'));
    return value === null ? [] : [{ value: Math.abs(value), currency: match[2]! }];
  });
}

function bankCategoryFromLabel(label: string): Transaction['bankCategoryHint'] {
  const l = label.toLowerCase();
  if (/\b(bills?|utilities|subscriptions?)\b/.test(l)) return 'bill';
  if (/\b(eating out|restaurants?|cafes?|food and drink)\b/.test(l)) return 'eatingOut';
  if (/\b(groceries|shopping|personal care|health)\b/.test(l)) return 'shopping';
  return undefined;
}

function transactionsFromBlocks(pageLines: Line[][]): Transaction[] {
  const out: Transaction[] = [];
  for (const lines of pageLines) {
    for (let i = 0; i < lines.length; i++) {
      const anchor = lines[i]!;
      const dateMatch = anchor.text.match(/^\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})\b/);
      if (!dateMatch || !anchor.text.includes('|')) continue;
      const date = parseDate(dateMatch[1]!, dateMatch[1]!.includes('/') ? 'ambiguous' : 'dmy');
      if (!date) continue;
      // Counterparty: the nearest earlier line with a "|" that is not itself an anchor.
      let head: Line | undefined;
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
        if (/^\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(lines[k]!.text)) break;
        if (lines[k]!.text.includes('|')) { head = lines[k]; break; }
      }
      if (!head) continue;
      const [statusRaw, ...rest] = head.text.split('|');
      const status = (statusRaw ?? '').trim();
      const counterparty = rest.join(' ').replace(CODED_AMOUNT, ' ').replace(/\s+/g, ' ').trim();
      // Category label may wrap onto a following line.
      let category = anchor.text.match(/category:\s*([A-Za-z &]+?)(?=\s+[-+]?\d|$)/i)?.[1]?.trim() ?? '';
      const tail: Line[] = [];
      for (let k = i + 1; k < Math.min(lines.length, i + 5); k++) {
        if (lines[k]!.text.includes('|')) break;
        tail.push(lines[k]!);
      }
      if (!category) category = tail.find((line) => /^[A-Za-z &]+$/.test(line.text.trim()))?.text.trim() ?? '';
      if (SKIP_STATUS.test(status) || CASH_STATUS.test(status) || SKIP_CATEGORY.test(category)) continue;
      const amounts = [...codedAmounts(anchor.text.replace(/^.*?category:[^0-9]*/i, '')), ...tail.flatMap((line) => codedAmounts(line.text))];
      const amount = amounts[amounts.length - 1];
      if (!amount || !(amount.value > 0)) continue;
      const merchantRaw = PERSON_STATUS.test(status) ? 'Transfer to a person' : redactDescription(cleanMerchant(counterparty));
      if (!merchantRaw) continue;
      const hint = bankCategoryFromLabel(category);
      out.push({ date, merchantRaw, amount: amount.value, currency: amount.currency, ...(hint ? { bankCategoryHint: hint } : {}) });
    }
  }
  return out;
}

function groupLines(items: PdfPage): Line[] {
  const sorted = items.flatMap(splitCell).filter((item) => item.str.trim()).map((item) => ({ ...item, y: Number(item.y.toFixed(1)) })).sort((a, b) => b.y - a.y || a.x - b.x);
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
  return /(?:description|narrative|details|opis|libelle|verwendungszweck|erlauterung|erläuterung|buchungstext|beschreibung|descripcion|concepto|omschrijving|descrizione|causale|descricao|aciklama|popis|tresc|szczegoly)/.test(compact)
    && /(?:moneyout|moneyin|paidout|paidin|withdraw|deposit|debit|credit|haben|soll|duguje|potrazuje|rashod|prihod|uplate|isplate|uplata|isplata|odliv|priliv)/.test(compact);
}

function completeDate(raw: string, year: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (/\b\d{1,2}\s+[A-Za-z]{3,9}\b/.test(normalized) && !/\b20\d{2}\b/.test(normalized)) return normalized.replace(/\b([A-Za-z]{3,9})\b/, '$1') + ` ${year}`;
  if (/\b[A-Za-z]{3,9}\s+\d{1,2},?\s*$/.test(normalized)) return `${normalized} ${year}`;
  return normalized;
}

function extractAmounts(text: string): Array<{ value: number; explicitSign: boolean }> {
  const matches = [...text.matchAll(AMOUNT)];
  return matches.map((match) => {
    const raw = match[0]!.trim();
    const plus = /^\+|\+$/.test(raw);
    const value = parseAmount(raw.replace(/^\+|\+$/g, '')) ?? 0;
    return { value, explicitSign: plus || value < 0 || /^\(.*\)$/.test(raw) };
  }).filter((item) => item.value !== 0);
}

/** Booking-type words some banks print on the date line, with the counterparty on the next line. */
function isBookingType(value: string): boolean {
  return /^(?:sepa\s+)?(?:lastschrift|folgelastschrift|erstlastschrift|kartenzahlung(?:\s+girocard)?|dauerauftrag|gutschrift(?:\s*uberweisung)?|uberweisung|umbuchung|bargeldauszahlung|entgelt|abschluss|direct debit|standing order|card payment|debit card|faster payment|bank transfer|virement|prelevement|paiement carte|adeudo|recibo|transferencia|bonifico|addebito|pagamento|overboeking|incasso|betaalautomaat|przelew|platba kartou|prenos|placanje|uplata|isplata)$/i
    .test(normalizeHeader(value));
}

function appendText(a: string, b: string): string { return [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }

type ParsedRowForBalance = { date: string; description: string; amount: number; y: number; nums: Array<{ x: number; value: number }>; header: TableHeader; page: number };

/** Try every x-column role assignment; labels only break ties after arithmetic validation. */
function validateBalances(rows: ParsedRowForBalance[]): PdfBalanceCheck {
  const groups = new Map<TableHeader, ParsedRowForBalance[]>();
  for (const row of rows) {
    const group = groups.get(row.header) ?? [];
    group.push(row);
    groups.set(row.header, group);
  }
  let checked = 0;
  let passed = 0;
  for (const [header, tableRows] of groups) {
    const centers = clusterXs(tableRows.flatMap((row) => row.nums.map((number) => number.x)));
    if (centers.length < 2) continue;
    let best: { balanceX: number; outX: number; inX?: number; checked: number; passed: number; hintScore: number } | undefined;
    const possibleIncomingColumns: Array<number | undefined> = [...centers, undefined];
    for (const balanceX of centers) for (const outX of centers) for (const inX of possibleIncomingColumns) {
      if (balanceX === outX || balanceX === inX || outX === inX) continue;
      let assignments = 0;
      let valid = 0;
      const chronological = [...tableRows].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < chronological.length; i++) {
        const previous = valueAt(chronological[i - 1]!, balanceX);
        const current = valueAt(chronological[i]!, balanceX);
        if (previous === undefined || current === undefined) continue;
        const out = valueAt(chronological[i]!, outX) ?? 0;
        const incoming = inX === undefined ? 0 : valueAt(chronological[i]!, inX) ?? 0;
        if (out === 0 && incoming === 0) continue;
        assignments++;
        // Separate out/in columns (positive values) or one signed column (+ in, - out).
        if (Math.abs(previous - out + incoming - current) <= 0.03 || (inX === undefined && Math.abs(previous + out - current) <= 0.03)) valid++;
      }
      const hintScore = (header.balanceX !== undefined && Math.abs(balanceX - header.balanceX) < 40 ? 3 : 0)
        + (header.outX !== undefined && Math.abs(outX - header.outX) < 40 ? 2 : 0)
        + (inX !== undefined && header.inX !== undefined && Math.abs(inX - header.inX) < 40 ? 2 : 0);
      if (!assignments) continue;
      if (!best || valid > best.passed || (valid === best.passed && hintScore > best.hintScore)) {
        best = { balanceX, outX, inX, checked: assignments, passed: valid, hintScore };
      }
    }
    if (!best) continue;
    checked += best.checked;
    passed += best.passed;
    // If a hinted amount assignment disagreed with the running balance, keep
    // the columns which satisfy the balance equation for this table.
    if (header.genericLayout && best.passed / best.checked >= 0.8) for (const row of tableRows) {
      const out = valueAt(row, best.outX);
      if (out !== undefined) row.amount = Math.abs(out);
    }
  }
  return { checked, passed };
}

function clusterXs(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of sorted) {
    const cluster = clusters.find((values) => Math.abs(mean(values) - x) <= 30);
    if (cluster) cluster.push(x);
    else clusters.push([x]);
  }
  return clusters.map(mean);
}

function mean(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function valueAt(row: ParsedRowForBalance, x: number): number | undefined {
  const match = row.nums.reduce<{ distance: number; value: number } | undefined>((best, cell) => {
    const distance = Math.abs(cell.x - x);
    return distance <= 35 && (!best || distance < best.distance) ? { distance, value: cell.value } : best;
  }, undefined);
  return match?.value;
}

function isSubline(value: string): boolean { return /^(?:vpa|utr|ref|rrn|auth|to|mobile|customer id|folio|txn)\b\s*[:#-]?|^card\s*:/i.test(value); }

function isOpeningOrSummary(value: string): boolean { return /\b(brought forward|carried forward|opening balance|closing balance|balance summary|pending|stanje na racunu|pocetno stanje|prethodno stanje|kontostand|alter kontostand|neuer kontostand|saldo anterior|solde)\b/i.test(normalizeHeader(value)); }

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
  const code = text.match(/\b(?:Currency\s+)?(INR|USD|EUR|GBP|CAD|AUD|NZD|CHF|JPY|RSD|BAM)\b/i)?.[1];
  if (code) return code.toUpperCase();
  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('$')) return 'USD';
  return 'EUR';
}

// Expose format type through this module without making consumers depend on
// PDF.js internals.
export type PdfDateFormat = DateFormat;
