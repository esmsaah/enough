import type { DetectionResult } from '../engine/detect';
import type { DateFormat } from '../engine/parse';
import type { PdfPage } from '../engine/pdf';

type Reply = { id: number; result?: DetectionResult; error?: string };
type Pending = { resolve: (value: DetectionResult) => void; reject: (reason: Error) => void };

const worker = new Worker(new URL('../engine/import.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, Pending>();
let nextId = 0;

worker.onmessage = (event: MessageEvent<Reply>) => {
  const task = pending.get(event.data.id);
  if (!task) return;
  pending.delete(event.data.id);
  if (event.data.error) task.reject(new Error(event.data.error));
  else if (event.data.result) task.resolve(event.data.result);
  else task.reject(new Error('This statement could not be read.'));
};

type WorkerFile = { name: string; bytes?: ArrayBuffer; pages?: PdfPage[] };

function send(message: { type: 'files'; files: WorkerFile[] } | { type: 'dateFormat'; format: DateFormat }, transfer: Transferable[] = []): Promise<DetectionResult> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
}

const IMAGE = /\.(png|jpe?g|webp|heic|heif|bmp|gif)$/i;

/** True when a file needs reading from pixels (photo, screenshot). */
export function isImageFile(file: File): boolean {
  return IMAGE.test(file.name) || file.type.startsWith('image/');
}

/**
 * File contents are transferred directly to the on-device parsing worker.
 * Photos and scanned PDFs are first read with on-device OCR (lazy-loaded).
 */
export async function importStatement(files: File[], onStatus?: (s: string) => void): Promise<DetectionResult> {
  const prepared: WorkerFile[] = [];
  const transfer: ArrayBuffer[] = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    if (isImageFile(file)) {
      onStatus?.('Reading the photo on this device…');
      const { ocr } = await import('./ocr');
      const [page] = await ocr([file]);
      prepared.push({ name: file.name, pages: [page!.items] });
      continue;
    }
    if (/\.pdf$/i.test(file.name)) {
      const { renderPdf, ocr } = await import('./ocr');
      const rendered = await renderPdf(bytes);
      if (!rendered.hasText) {
        onStatus?.('Scanned PDF. Reading it on this device…');
        const pages = await ocr(rendered.canvases, (d, t) => onStatus?.(`Reading page ${d} of ${t} on this device…`));
        prepared.push({ name: file.name, pages: pages.map((p) => p.items) });
        continue;
      }
    }
    prepared.push({ name: file.name, bytes });
    transfer.push(bytes);
  }
  return send({ type: 'files', files: prepared }, transfer);
}

export function resolveStatementDates(format: DateFormat): Promise<DetectionResult> {
  return send({ type: 'dateFormat', format });
}

/** Forget every statement file held by the parsing worker (new audit / delete everything). */
export function resetStatements(): void {
  worker.postMessage({ id: ++nextId, type: 'reset' });
}
