// Enough — CSV adapter. Section 6 of ENOUGH_BRIEF.md.
// Turns raw CSV bytes/text into rows of cells. Delimiter and encoding are
// auto-handled. This is the only place Papa Parse is used; everything
// downstream works on plain string[][].

import Papa from 'papaparse';

/** Decode bytes to text, honoring a BOM or an explicit encoding hint. */
export function decodeBytes(bytes: Uint8Array, encoding?: string): string {
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  }
  const enc = (encoding ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(enc).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  }
}

/**
 * Sniff the delimiter. Papa's own guesser is fooled by comma-decimal amounts
 * (1.234,56), so we pick the delimiter that splits the most lines into the most
 * columns, preferring ";" and tab over "," on a tie.
 */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const candidates = [';', '\t', '|', ','];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length);
    const multi = counts.filter((c) => c > 1).length; // lines this delimiter actually splits
    const maxCols = Math.max(1, ...counts);
    const score = multi * 100 + maxCols;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Parse CSV text into rows of cells. Delimiter sniffed (decimal-comma safe). */
export function parseCsvText(text: string): string[][] {
  const res = Papa.parse<string[]>(text, {
    delimiter: sniffDelimiter(text),
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  return (res.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => (c ?? '').trim() !== ''));
}

export function parseCsvBytes(bytes: Uint8Array, encoding?: string): string[][] {
  return parseCsvText(decodeBytes(bytes, encoding));
}
