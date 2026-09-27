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

/** Parse CSV text into rows of cells. Delimiter auto-detected. */
export function parseCsvText(text: string): string[][] {
  const res = Papa.parse<string[]>(text, {
    delimiter: '', // auto-detect (comma/semicolon/tab)
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  return (res.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => (c ?? '').trim() !== ''));
}

export function parseCsvBytes(bytes: Uint8Array, encoding?: string): string[][] {
  return parseCsvText(decodeBytes(bytes, encoding));
}
