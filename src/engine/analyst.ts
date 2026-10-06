// Enough — anonymous audit for the AI analyst, and validation of its answer.
// The analyst explains and corrects. It never produces money figures: every
// amount on screen is computed by the engine.

import { sanitizeResearchName } from './research';
import type { DisplayCategory, Item } from './types';

export type AnalystItem = {
  ref: string; // short opaque id, never the item id
  merchant: string;
  type: Item['category'];
  displayCategory: DisplayCategory;
  price: number;
  interval: Item['frequency'];
  currency: string;
  usage?: Item['usage'];
  visitsPerMonth?: number;
  extras?: { label?: string; charges: number };
};

export type AnalystNote = {
  reason?: string; // one short sentence, no numbers
  moveTo?: 'subscription' | 'bill' | 'spending';
  displayCategory?: DisplayCategory;
};

export type AnalystAnswer = {
  notes: Record<string, AnalystNote>; // by ref
  questions: Array<{ ref: string; question: string; options: string[] }>;
};

/** Build the anonymous audit. Items whose name may be a person are dropped. */
export function analystPayload(items: Item[]): { items: AnalystItem[]; refs: Record<string, string> } {
  const refs: Record<string, string> = {};
  const out: AnalystItem[] = [];
  items.forEach((item, index) => {
    const merchant = sanitizeResearchName(item.name);
    if (!merchant || item.redactNameOutbound) return;
    const ref = `i${index + 1}`;
    refs[ref] = item.id;
    out.push({
      ref,
      merchant,
      type: item.category,
      displayCategory: item.displayCategory,
      price: Math.round(item.price * 100) / 100,
      interval: item.frequency,
      currency: item.currency,
      ...(item.usage ? { usage: item.usage } : {}),
      ...(item.visitsPerMonth !== undefined ? { visitsPerMonth: item.visitsPerMonth } : {}),
      ...(item.extraPurchases ? { extras: { label: item.extraPurchases.label, charges: item.extraPurchases.charges } } : {}),
    });
  });
  return { items: out, refs };
}

const DISPLAY: DisplayCategory[] = ['Entertainment', 'AI & Software', 'Cloud & Storage', 'News & Media', 'Learning', 'Fitness & Health', 'Kids & Family', 'Shopping & Delivery', 'Bills & Utilities', 'Transport', 'Other'];

/** Plain sentence, no digits (so no invented amounts), short. */
function cleanSentence(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s || s.length > max || /\d/.test(s)) return undefined;
  return s;
}

export function validateAnalystAnswer(raw: unknown, refs: Iterable<string>): AnalystAnswer {
  const allowed = new Set(refs);
  const answer: AnalystAnswer = { notes: {}, questions: [] };
  if (!raw || typeof raw !== 'object') return answer;
  const r = raw as Record<string, unknown>;
  if (r.notes && typeof r.notes === 'object') {
    for (const [ref, value] of Object.entries(r.notes as Record<string, unknown>)) {
      if (!allowed.has(ref) || !value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const note: AnalystNote = {};
      const reason = cleanSentence(v.reason);
      if (reason) note.reason = reason;
      if (v.moveTo === 'subscription' || v.moveTo === 'bill' || v.moveTo === 'spending') note.moveTo = v.moveTo;
      const display = DISPLAY.find((d) => d === v.displayCategory);
      if (display) note.displayCategory = display;
      if (Object.keys(note).length) answer.notes[ref] = note;
    }
  }
  if (Array.isArray(r.questions)) {
    for (const q of r.questions.slice(0, 3)) {
      if (!q || typeof q !== 'object') continue;
      const v = q as Record<string, unknown>;
      const question = cleanSentence(v.question, 120);
      const options = Array.isArray(v.options) ? v.options.map((o) => cleanSentence(o, 40)).filter((o): o is string => !!o).slice(0, 4) : [];
      if (typeof v.ref === 'string' && allowed.has(v.ref) && question && options.length >= 2) answer.questions.push({ ref: v.ref, question, options });
    }
  }
  return answer;
}
