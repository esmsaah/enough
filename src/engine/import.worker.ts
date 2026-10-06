import { parseCsvBytes } from './csv';
import { detect, transactionsFromRows, type DetectionResult, type ImportMeta } from './detect';
import { transactionsFromPdfPages, type PdfPage } from './pdf';
import type { DateFormat } from './parse';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

let statementFiles: Array<{ rows?: string[][]; pdf?: PdfPage[] }> | undefined;

const scope = self as DedicatedWorkerGlobalScope;

type StatementFile = { name: string; bytes: ArrayBuffer };
scope.onmessage = async (event: MessageEvent<{ id: number; type: 'files'; files: StatementFile[] } | { id: number; type: 'dateFormat'; format: DateFormat }>) => {
  const { id } = event.data;
  try {
    if (event.data.type === 'files') statementFiles = await Promise.all(event.data.files.map(async ({ name, bytes }) => {
      const extension = name.split('.').pop()?.toLowerCase();
      if (extension === 'csv' || extension === 'txt') return { rows: parseCsvBytes(new Uint8Array(bytes)) };
      if (extension === 'xls' || extension === 'xlsx') {
        const workbook = XLSX.read(bytes, { type: 'array', cellDates: false });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
        if (!firstSheet) throw new Error(`No worksheet found in ${name}.`);
        return { rows: XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: '' }) };
      }
      if (extension === 'pdf') {
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
        const pages: PdfPage[] = [];
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          const content = await (await pdf.getPage(pageNo)).getTextContent();
          pages.push(content.items.flatMap((item) => 'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
        }
        return { pdf: pages };
      }
      throw new Error('Choose a CSV, Excel (.xls, .xlsx), or text PDF statement.');
    }));
    if (!statementFiles) throw new Error('Choose a statement file first.');
    const batches = statementFiles.map((file) => {
      if (file.pdf) {
        const parsed = transactionsFromPdfPages(file.pdf);
        if (!parsed.transactions.length) throw new Error('This PDF has no selectable text. Try a CSV or Excel export instead.');
        return {
          transactions: parsed.transactions,
          meta: {
            displayCurrency: parsed.transactions[0]?.currency ?? 'EUR', dateFormat: 'dmy' as const,
            dateAmbiguous: false, monthsSpan: 0, redactedCategories: parsed.redactedCategories,
            columnQuestions: [], columnCount: 0,
          },
        };
      }
      const rows = file.rows ?? [];
      const inferred = transactionsFromRows(rows, 'EUR');
      return event.data.type === 'dateFormat' && inferred.meta.dateAmbiguous
        ? transactionsFromRows(rows, 'EUR', event.data.format)
        : inferred;
    });
    const unique = new Map<string, (typeof batches)[number]['transactions'][number]>();
    for (const batch of batches) for (const transaction of batch.transactions) {
      unique.set(`${transaction.date}\u0000${transaction.merchantRaw}\u0000${transaction.amount}\u0000${transaction.currency}`, transaction);
    }
    const transactions = [...unique.values()];
    const meta = combineMeta(batches.map((batch) => batch.meta), transactions, event.data.type === 'dateFormat' ? event.data.format : undefined);
    const result: DetectionResult = detect(transactions, meta);
    scope.postMessage({ id, result });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : 'This statement could not be read.' });
  }
};

function combineMeta(metas: ImportMeta[], transactions: DetectionResult['transactions'], override?: DateFormat): ImportMeta {
  const counts = new Map<string, number>();
  for (const row of transactions) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
  const displayCurrency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? metas[0]?.displayCurrency ?? 'EUR';
  const dates = transactions.map((row) => row.date).sort();
  const monthsSpan = dates.length > 1 ? Math.max(0, (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / 86_400_000 / 30) : 0;
  const dateAmbiguous = !override && metas.some((meta) => meta.dateAmbiguous);
  const resolvedFormat = override && metas.some((meta) => meta.dateAmbiguous)
    ? override
    : metas.find((meta) => !meta.dateAmbiguous)?.dateFormat ?? 'ambiguous';
  return {
    displayCurrency,
    dateFormat: dateAmbiguous ? 'ambiguous' : resolvedFormat,
    dateAmbiguous,
    monthsSpan,
    redactedCategories: [...new Set(metas.flatMap((meta) => meta.redactedCategories))],
    columnQuestions: metas.flatMap((meta) => meta.columnQuestions),
    columnCount: Math.max(0, ...metas.map((meta) => meta.columnCount)),
  };
}

export {};
