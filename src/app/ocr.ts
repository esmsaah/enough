// Enough — reading photos, screenshots and scanned PDFs ON THE DEVICE.
// tesseract.js runs in its own worker; the engine and language data are served
// from our own /ocr folder (scripts/copy-ocr-assets.mjs), never from a CDN.
// Output is the same positioned-text shape the PDF table reader already uses,
// so scanned statements go through the exact same rules as text PDFs.

import type { PdfPage } from '../engine/pdf';
import { ocrLanguages } from './ocrLangs';
import { guessCountry } from './country';

export type OcrPage = { items: PdfPage; lines: string[] };

/** A4 width in PDF points: OCR pixels are scaled to it so line grouping works like text PDFs. */
const PAGE_WIDTH = 595;

async function sourceSize(src: HTMLCanvasElement | Blob): Promise<{ w: number; h: number }> {
  if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
  const bmp = await createImageBitmap(src);
  const size = { w: bmp.width, h: bmp.height };
  bmp.close();
  return size;
}

/** Recognise text on each image/canvas in English plus the person's local languages. */
export async function ocr(sources: Array<HTMLCanvasElement | Blob>, onProgress?: (done: number, total: number) => void, country?: string): Promise<OcrPage[]> {
  const { createWorker } = await import('tesseract.js');
  const langs = ocrLanguages(country ?? guessCountry(), typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
  const worker = await withTimeout(createWorker(langs, 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    errorHandler: () => undefined,
  }), 60_000);
  const pages: OcrPage[] = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!;
      const { w, h } = await sourceSize(src);
      const scale = PAGE_WIDTH / Math.max(1, w);
      const { data } = await withTimeout(worker.recognize(src, {}, { blocks: true, text: true }), 120_000);
      const items: PdfPage = [];
      const lines: string[] = [];
      for (const block of data.blocks ?? []) for (const para of block.paragraphs) for (const line of para.lines) {
        lines.push(line.text.trim());
        // Words close together form one cell ("FIT ZONE SARAJEVO"); a wide gap starts the next
        // column. One baseline per line (the line's box), so descenders don't split a row.
        const lineH = Math.max(1, line.bbox.y1 - line.bbox.y0);
        let cell: { str: string; x0: number; x1: number } | undefined;
        const push = () => { if (cell) items.push({ str: cell.str, x: cell.x0 * scale, y: (h - line.bbox.y1) * scale, width: (cell.x1 - cell.x0) * scale }); };
        for (const word of [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
          if (!word.text.trim() || word.confidence < 30) continue;
          if (cell && word.bbox.x0 - cell.x1 < lineH * 0.9) { cell.str += ` ${word.text}`; cell.x1 = word.bbox.x1; continue; }
          push();
          cell = { str: word.text, x0: word.bbox.x0, x1: word.bbox.x1 };
        }
        push();
      }
      pages.push({ items, lines: lines.filter(Boolean) });
      onProgress?.(i + 1, sources.length);
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

/** Render each page of a PDF to a canvas (for scanned PDFs with no selectable text). */
export async function renderPdf(bytes: ArrayBuffer, maxPages = 12): Promise<{ canvases: HTMLCanvasElement[]; hasText: boolean }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const first = await (await pdf.getPage(1)).getTextContent();
  const hasText = first.items.some((it) => 'str' in it && (it as { str: string }).str.trim().length > 0);
  if (hasText) return { canvases: [], hasText };
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    canvases.push(canvas);
  }
  return { canvases, hasText };
}

/** OCR must never hang the screen: give up with a clear message instead. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Reading the picture took too long. Try a smaller or sharper image, or a CSV export.")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
