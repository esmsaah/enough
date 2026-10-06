// POST /api/merchants  { names: string[], currency?: string }
// → { profiles: ResearchProfile[] }
// Names only. Cached in D1 so each merchant is researched once for everyone.

import { MAX_RESEARCH_NAMES, sanitizeResearchName, validateResearchProfile, type ResearchProfile } from '../../src/engine/research';
import { askClaude, json, overBudget, readJson, type Env } from '../_lib/ai';

const SYSTEM = `You identify merchants from bank statement descriptions for a personal finance app used worldwide.
For each name, say what the business is and how people usually pay it.
Return ONLY a JSON object: {"profiles":[...]} with one entry per input name:
{"key": <the input name exactly>, "name": <clean brand name>, "what": <max 12 words, e.g. "Supermarket chain in Serbia">,
 "kind": "subscription" | "membership" | "bill" | "spending" | "oneTime" | "transfer" | "unknown",
 "displayCategory": one of Entertainment, AI & Software, Cloud & Storage, News & Media, Learning, Fitness & Health, Kids & Family, Shopping & Delivery, Bills & Utilities, Transport, Other,
 "spendingCategory": for kind "spending" only, one of Groceries, Cafes & eating out, Transport, Delivery,
 "billingModel": "monthly" | "yearly" | "usage" | "oneTime",
 "plans": [{"price": number, "currency": "USD", "interval": "monthly"|"yearly"}] only for subscriptions with public list prices,
 "addonsLabel": name of things bought on top of a plan, e.g. "Connects", or omit,
 "cancelUrl": official https page to cancel, or omit,
 "confidence": 0..1, "sources": [urls you used, if any]}
Rules: supermarkets, shops, pharmacies, fuel, cafes, restaurants are "spending". Utilities, phone, internet, rent, insurance are "bill".
Pay-as-you-go or credit top-ups are "usage". If the name could be a private person, use "transfer". If unsure, lower confidence; never guess brands.`;

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const input = body as { names?: unknown; currency?: unknown };
  const currency = typeof input.currency === 'string' && /^[A-Z]{3}$/.test(input.currency) ? input.currency : undefined;
  const names = Array.isArray(input.names)
    ? [...new Set(input.names.map((name) => typeof name === 'string' ? sanitizeResearchName(name) : undefined).filter((name): name is string => !!name))].slice(0, MAX_RESEARCH_NAMES)
    : [];
  if (!names.length) return json({ profiles: [] });

  // 1. Cache.
  const placeholders = names.map(() => '?').join(',');
  const cached = await env.DB.prepare(`SELECT key, profile FROM merchant_profiles WHERE key IN (${placeholders})`).bind(...names).all<{ key: string; profile: string }>();
  const profiles: ResearchProfile[] = [];
  const found = new Set<string>();
  for (const row of cached.results ?? []) {
    const profile = validateResearchProfile(JSON.parse(row.profile));
    if (profile) {
      profiles.push(profile);
      found.add(row.key);
    }
  }
  const missing = names.filter((name) => !found.has(name));
  if (!missing.length || await overBudget(env)) return json({ profiles });

  // 2. Model knowledge first, 3. web search only for what it is unsure about.
  const context = currency ? `Statement currency: ${currency}.\n` : '';
  const learned = new Map<string, ResearchProfile>();
  const first = await askClaude(env, { system: SYSTEM, user: `${context}Names:\n${missing.join('\n')}`, kind: 'research' });
  for (const raw of (first as { profiles?: unknown[] } | undefined)?.profiles ?? []) {
    const profile = validateResearchProfile(raw);
    if (profile && missing.includes(profile.key)) learned.set(profile.key, profile);
  }
  const unsure = missing.filter((name) => (learned.get(name)?.confidence ?? 0) < 0.7).slice(0, 10);
  if (unsure.length && !(await overBudget(env))) {
    const second = await askClaude(env, { system: SYSTEM, user: `${context}Search the web for these names, then answer.\nNames:\n${unsure.join('\n')}`, webSearch: true, kind: 'research-web' });
    for (const raw of (second as { profiles?: unknown[] } | undefined)?.profiles ?? []) {
      const profile = validateResearchProfile(raw);
      if (profile && unsure.includes(profile.key) && profile.confidence >= (learned.get(profile.key)?.confidence ?? 0)) learned.set(profile.key, profile);
    }
  }

  const now = new Date().toISOString();
  const writes = [...learned.values()].filter((profile) => profile.confidence >= 0.5).map((profile) =>
    env.DB.prepare('INSERT INTO merchant_profiles (key, profile, kind, confidence, researched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET profile = excluded.profile, kind = excluded.kind, confidence = excluded.confidence, researched_at = excluded.researched_at')
      .bind(profile.key, JSON.stringify(profile), profile.kind, profile.confidence, now));
  if (writes.length) await env.DB.batch(writes);
  return json({ profiles: [...profiles, ...learned.values()] });
};
