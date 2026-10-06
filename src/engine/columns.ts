// Generic statement-column inference. It deliberately combines header meaning
// with value patterns so it works when a bank renames or reorders its columns.
import { classifyHeader, foldHeader, type ColumnRole } from './headers';
import { detectDateFormat, normalizeDigits, parseAmount, parseDate, type DateFormat } from './parse';

export type ColumnPurpose = 'date' | 'amount' | 'merchant' | 'direction' | 'status' | 'currency';
export type ColumnOverrides = Partial<Record<ColumnPurpose, number>>;
export type ColumnQuestion = { role: ColumnPurpose; candidates: number[] };
export type ColumnSelection = {
  date?: number;
  amount?: number;
  merchant?: number;
  currency?: number;
  direction?: number;
  status?: number;
  holderColumns: number[];
  questions: ColumnQuestion[];
};

const OUT = new Set([
  'out', 'outgoing', 'debit', 'withdrawal', 'withdraw', 'expense', 'sent', 'send', 'payment out',
  'outbound', 'exit', 'izlaz', 'odliv', 'isplata', 'zaduzenje', 'ausgang', 'auszahlung',
  'sortie', 'debito', 'salida', 'cargo', 'uscita', 'addebito', 'saida', 'spesa',
  'исходящий', 'списание', 'расход', 'مدين', 'صادر', 'გარეთ',
]);
const IN = new Set([
  'in', 'incoming', 'credit', 'deposit', 'received', 'receive', 'income', 'inbound', 'entry',
  'priliv', 'uplata', 'odobrenje', 'eingang', 'einzahlung', 'entree', 'credito', 'entrada',
  'ingreso', 'entrata', 'accredito', 'receita', 'приход', 'зачисление', 'доверенный', 'دائن', 'وارد',
]);
const COMPLETE = new Set([
  'completed', 'complete', 'finished', 'done', 'settled', 'successful', 'success', 'posted',
  'confirmed', 'executed', 'booked', 'processed', 'paid', 'cleared', 'valid',
  'zavrseno', 'zavrsen', 'izvrseno', 'realizovano', 'knjizeno', 'uspesno',
  'abgeschlossen', 'ausgefuehrt', 'erledigt', 'termine', 'effectue', 'acheve', 'valide',
  'completado', 'finalizado', 'realizado', 'completato', 'eseguito', 'concluido',
  'выполнено', 'завершено', 'успешно', 'مكتمل', 'تم',
]);

type Candidate = { index: number; score: number };

export function inferColumns(
  header: string[],
  rows: string[][],
  overrides: ColumnOverrides = {},
): ColumnSelection {
  const width = Math.max(header.length, ...rows.map((row) => row.length), 0);
  const roles = Array.from({ length: width }, (_, index) => classifyHeader(header[index] ?? ''));
  const labels = Array.from({ length: width }, (_, index) => foldHeader(header[index] ?? ''));
  const questions: ColumnQuestion[] = [];

  const direction = selectSemantic('direction', roles, rows, overrides.direction);
  const status = selectSemantic('status', roles, rows, overrides.status);
  if (direction.ask) questions.push({ role: 'direction', candidates: direction.options });
  if (status.ask) questions.push({ role: 'status', candidates: status.options });

  const holderColumns = rows.length > 0 ? Array.from({ length: width }, (_, index) => index).filter((index) => {
    if (['direction', 'status', 'currency', 'date', 'valueDate', 'amount', 'debit', 'credit', 'balance'].includes(roles[index]!)) return false;
    const values = nonEmpty(rows, index);
    if (values.length < 3) return false;
    const counts = countValues(values);
    const topShare = Math.max(...counts.values()) / values.length;
    const uniqueShare = counts.size / values.length;
    const label = labels[index] ?? '';
    const personHeader = /\b(holder|owner|account|customer|created by|payer|source name|user)\b/.test(label);
    const nameOnlyHeader = label === 'name';
    const repeatsName = values.filter((v) => /\p{L}[\p{L}'’-]*\s+\p{L}/u.test(v)).length / values.length >= 0.7;
    return (topShare >= 0.7 && uniqueShare <= 0.12 && (personHeader || repeatsName || nameOnlyHeader));
  }) : [];

  const directionIndex = direction.index;
  const statusIndex = status.index;
  const outgoingRows = directionIndex === undefined ? rows : rows.filter((row) => isOutgoing(row[directionIndex] ?? ''));
  const completeRows = statusIndex === undefined ? outgoingRows : outgoingRows.filter((row) => isComplete(row[statusIndex] ?? ''));
  const activeRows = completeRows.length ? completeRows : rows;

  const dateScores = scoreColumns(roles, labels, rows, 'date');
  const date = choose('date', dateScores, overrides.date, questions, 0.56);
  const amountScores = scoreColumns(roles, labels, activeRows, 'amount', holderColumns, direction.index === undefined ? undefined : outgoingRows);
  const amount = choose('amount', amountScores, overrides.amount, questions, 0.58);
  const merchantScores = scoreColumns(roles, labels, activeRows, 'merchant', holderColumns);
  const merchant = choose('merchant', merchantScores, overrides.merchant, questions, 0.45);
  const currencyScores = scoreColumns(roles, labels, activeRows, 'currency', holderColumns, undefined, amount.index);
  const currency = choose('currency', currencyScores, overrides.currency, questions, 0.55, false);

  return {
    date: date.index,
    amount: amount.index,
    merchant: merchant.index,
    currency: currency.index,
    direction: direction.index,
    status: status.index,
    holderColumns,
    questions,
  };
}

function selectSemantic(
  purpose: 'direction' | 'status',
  roles: ColumnRole[],
  rows: string[][],
  forced?: number,
): { index?: number; ask: boolean; options: number[] } {
  if (forced !== undefined) return { index: forced, ask: false, options: [forced] };
  const candidates = roles.map((_, index) => {
    const values = nonEmpty(rows, index);
    const known = values.filter((value) => purpose === 'direction' ? classifyDirection(value) !== undefined : classifyStatus(value) !== undefined).length;
    const share = values.length ? known / values.length : 0;
    const header = roles[index] === purpose ? 0.28 : 0;
    const score = share * 0.72 + header;
    return { index, score, header, knownShare: share };
  }).filter((candidate) => candidate.score >= 0.25 || candidate.header > 0);
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best) return { ask: false, options: [] };
  const hasHeader = best.header > 0;
  const uncertain = best.score < 0.58 || (sorted[1] !== undefined && best.score - sorted[1].score < 0.06);
  return {
    index: uncertain && !hasHeader ? undefined : best.index,
    ask: uncertain && (hasHeader || best.knownShare > 0.25),
    options: sorted.slice(0, 8).map((candidate) => candidate.index),
  };
}

function scoreColumns(
  roles: ColumnRole[],
  labels: string[],
  rows: string[][],
  purpose: 'date' | 'amount' | 'merchant' | 'currency',
  holders: number[] = [],
  amountRows?: string[][],
  pairedAmount?: number,
): Candidate[] {
  return roles.map((role, index) => {
    const header = labels[index] ?? '';
    const values = nonEmpty(rows, index);
    const count = values.length || 1;
    const uniqueShare = new Set(values.map((v) => v.toLowerCase())).size / count;
    const parsedAmounts = values.filter((value) => /\d/.test(normalizeDigits(value))).map(parseAmount).filter((v): v is number => v !== null);
    const numberShare = parsedAmounts.length / count;
    const numericVariation = parsedAmounts.length ? new Set(parsedAmounts).size / parsedAmounts.length : 0;
    const format: DateFormat = detectDateFormat(values);
    const dateShare = values.filter((v) => parseDate(v, format) !== null).length / count;
    const textShare = values.filter((v) => !/\d/.test(normalizeDigits(v)) && !/\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/.test(normalizeDigits(v))).length / count;
    const semanticAmount = role === 'amount' || role === 'debit';
    const semanticDate = role === 'date' || role === 'valueDate';
    const semanticCurrency = role === 'currency';
    let score = 0;

    if (purpose === 'date') {
      score = dateShare * 0.72 + (semanticDate ? 0.2 : 0);
      if (role === 'date') score += 0.1;
      if (/\b(finished|completed|transaction|booking|value date)\b/.test(header)) score += 0.12;
      if (/\b(created|opened|initiated)\b/.test(header)) score -= 0.08;
      if (/balance|birth|expiry|renewal/.test(header)) score -= 0.5;
    } else if (purpose === 'amount') {
      score = numberShare * 0.55 + numericVariation * 0.35 + (semanticAmount ? 0.2 : 0);
      if (role === 'credit') score -= 0.8;
      if (/\b(fee|fees|commission|tax|rate|balance|exchange)\b/.test(header) && !/\bamount\b.*\b(after|including|net)\b.*\bfees\b/.test(header)) score -= 0.85;
      if (pairedAmount !== undefined) {
        const amountHeader = labels[pairedAmount] ?? '';
        const amountSide = side(amountHeader);
        const thisSide = side(header);
        if (amountSide && thisSide === amountSide) score += 0.1;
        else if (amountSide && thisSide && thisSide !== amountSide) score -= 0.1;
      } else if (amountRows) {
        const outgoingRatio = amountRows.length / Math.max(1, rows.length);
        if (/\bsource\b/.test(header) && outgoingRatio > 0.5) score += 0.08;
        if (/\btarget\b/.test(header) && outgoingRatio > 0.5) score -= 0.08;
      }
      if (semanticDate || role === 'balance' || role === 'currency') score -= 0.7;
    } else if (purpose === 'merchant') {
      score = textShare * 0.22 + uniqueShare * 0.48;
      if (role === 'merchant') score += 0.26 + (header === 'merchant' ? 0.25 : 0);
      else if (role === 'description') score += 0.3;
      if (/\b(merchant|payee|recipient|beneficiary|counterparty|name|description|partner)\b/.test(header)) score += 0.12;
      if (/\b(id|type|product|state|reference|batch|note|category|status|direction|currency|fee|rate|account|source|method)\b/.test(header)) score -= 0.5;
      if (holders.includes(index)) score -= 1;
      if (role === 'status' || role === 'direction' || role === 'currency' || role === 'balance' || semanticAmount || semanticDate) score -= 0.6;
    } else {
      score = (semanticCurrency ? 0.28 : 0) + textShare * 0.12 + uniqueShare * 0.08;
      if (/\b(currency|ccy|valuta|währung)\b/.test(header)) score += 0.18;
      if (/\b(fee|target)\b/.test(header)) score -= 0.12;
      if (pairedAmount !== undefined) {
        const amountSide = side(labels[pairedAmount] ?? '');
        if (amountSide && side(header) === amountSide) score += 0.48;
        else if (amountSide && side(header) && side(header) !== amountSide) score -= 0.2;
      }
    }
    return { index, score };
  }).sort((a, b) => b.score - a.score);
}

function choose(
  purpose: ColumnPurpose,
  scores: Candidate[],
  forced: number | undefined,
  questions: ColumnQuestion[],
  minimum: number,
  askIfMissing = true,
): { index?: number } {
  if (forced !== undefined) return { index: forced };
  const best = scores[0];
  const second = scores[1];
  const uncertain = !best || best.score < minimum || (second !== undefined && best.score - second.score < 0.045);
  if (uncertain && askIfMissing) {
    questions.push({ role: purpose, candidates: scores.filter((candidate) => candidate.score > 0).slice(0, 8).map((candidate) => candidate.index) });
  }
  return { index: uncertain ? undefined : best.index };
}

function nonEmpty(rows: string[][], index: number): string[] {
  return rows.map((row) => (row[index] ?? '').trim()).filter(Boolean);
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value.toLowerCase(), (counts.get(value.toLowerCase()) ?? 0) + 1);
  return counts;
}

function side(header: string): 'source' | 'target' | undefined {
  if (/\b(source|from|origin|sender|debit)\b/.test(header)) return 'source';
  if (/\b(target|to|destination|recipient|beneficiary|credit)\b/.test(header)) return 'target';
  return undefined;
}

function normalizedToken(raw: string): string {
  return foldHeader(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function classifyDirection(raw: string): 'out' | 'in' | undefined {
  const value = normalizedToken(raw);
  if (OUT.has(value)) return 'out';
  if (IN.has(value)) return 'in';
  return undefined;
}

function classifyStatus(raw: string): 'complete' | 'other' | undefined {
  const value = normalizedToken(raw);
  if (COMPLETE.has(value)) return 'complete';
  if (/cancel|refund|reject|fail|pending|processing|void|annul|rembours|storn|abbruch|отмен|возврат|معلق/.test(value)) return 'other';
  return undefined;
}

export function isOutgoing(raw: string): boolean {
  return classifyDirection(raw) === 'out';
}

export function isComplete(raw: string): boolean {
  return classifyStatus(raw) === 'complete';
}
