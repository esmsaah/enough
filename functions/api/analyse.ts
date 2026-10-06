// POST /api/analyse  { items: AnalystItem[] }
// → AnalystAnswer (notes per ref, max 3 questions). No money figures come back.

import { validateAnalystAnswer, type AnalystItem } from '../../src/engine/analyst';
import { askClaude, json, overBudget, readJson, type Env } from '../_lib/ai';

const SYSTEM = `You are a calm, practical personal finance reviewer. You receive an anonymous list of things a person pays for, already detected from their bank statement.
For each item decide if it is in the right place and write one short, human sentence explaining what to do with it and why.
Return ONLY JSON: {"notes": {"<ref>": {"reason": "...", "moveTo": "subscription"|"bill"|"spending" (only if misplaced), "displayCategory": "..." (only if wrong)}},
 "questions": [{"ref": "...", "question": "...", "options": ["...","..."]}]}
Rules:
- Never write numbers or amounts. The app computes every figure.
- Shops, supermarkets, cafes and fuel are spending, never subscriptions. Utilities, phone, internet, rent and insurance are bills.
- Say when two services do the same job, when a membership is used too little, when a plan is clearly worth it.
- Ask at most 3 questions, only where the answer changes the advice (e.g. "Do you earn money through Upwork?"). Options are short answers.
- Plain English, no jargon, max 20 words per reason.`;

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 30_000);
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const items = Array.isArray((body as { items?: unknown }).items) ? ((body as { items: AnalystItem[] }).items).slice(0, 60) : [];
  const refs = items.map((item) => item?.ref).filter((ref): ref is string => typeof ref === 'string' && /^i\d{1,3}$/.test(ref));
  if (!refs.length || await overBudget(env)) return json({ notes: {}, questions: [] });
  const safe = items.filter((item) => refs.includes(item.ref)).map((item) => ({
    ref: item.ref, merchant: String(item.merchant).slice(0, 48), type: item.type, displayCategory: item.displayCategory,
    price: Number(item.price), interval: item.interval, currency: String(item.currency).slice(0, 3),
    usage: item.usage, visitsPerMonth: item.visitsPerMonth, extras: item.extras,
  }));
  const raw = await askClaude(env, { system: SYSTEM, user: JSON.stringify({ items: safe }), maxTokens: 3000, kind: 'analyse' });
  return json(validateAnalystAnswer(raw, refs));
};
