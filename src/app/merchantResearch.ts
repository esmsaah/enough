// Enough — asks the server what unknown merchants are (names only), keeps the
// answers on this device, and teaches them to the engine.

import { get, set } from 'idb-keyval';
import { registerMerchantProfiles } from '../engine/merchants';
import { merchantInfoFromResearch, merchantNamesForResearch, validateResearchProfile, type ResearchProfile } from '../engine/research';
import { analystPayload, validateAnalystAnswer, type AnalystAnswer } from '../engine/analyst';
import type { Item, Transaction } from '../engine/types';

const CACHE_KEY = 'enough-merchant-profiles-v1';
const TIMEOUT_MS = 12_000;

async function loadCache(): Promise<Record<string, ResearchProfile>> {
  try {
    return ((await get(CACHE_KEY)) as Record<string, ResearchProfile> | undefined) ?? {};
  } catch {
    return {};
  }
}

function teach(profiles: ResearchProfile[]): void {
  registerMerchantProfiles(profiles.map(merchantInfoFromResearch).filter((info): info is NonNullable<typeof info> => !!info));
}

/** Call once on app start so earlier answers work offline. */
export async function restoreMerchantProfiles(): Promise<void> {
  teach(Object.values(await loadCache()));
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined; // offline or blocked: rules only
  } finally {
    clearTimeout(timer);
  }
}

/** Research unknown merchant names. Returns how many new profiles were learned. */
export async function researchMerchants(transactions: Transaction[], currency?: string): Promise<number> {
  const cache = await loadCache();
  teach(Object.values(cache));
  const names = merchantNamesForResearch(transactions, (name) => name in cache);
  if (!names.length) return 0;
  const reply = await postJson('/api/merchants', { names, ...(currency ? { currency } : {}) }) as { profiles?: unknown[] } | undefined;
  const learned = (reply?.profiles ?? []).map(validateResearchProfile).filter((p): p is ResearchProfile => !!p && names.includes(p.key));
  for (const profile of learned) cache[profile.key] = profile;
  try {
    await set(CACHE_KEY, cache);
  } catch {
    /* private mode: keep for this session only */
  }
  teach(learned);
  return learned.length;
}

/** AI analyst: notes keyed by item id. Empty when offline or disabled. */
export async function analyseItems(items: Item[]): Promise<{ notes: Record<string, NonNullable<AnalystAnswer['notes'][string]>>; questions: Array<AnalystAnswer['questions'][number] & { itemId: string }> }> {
  const { items: payload, refs } = analystPayload(items);
  if (!payload.length) return { notes: {}, questions: [] };
  const answer = validateAnalystAnswer(await postJson('/api/analyse', { items: payload }), Object.keys(refs));
  const notes: Record<string, NonNullable<AnalystAnswer['notes'][string]>> = {};
  for (const [ref, note] of Object.entries(answer.notes)) if (refs[ref]) notes[refs[ref]!] = note;
  return { notes, questions: answer.questions.flatMap((q) => refs[q.ref] ? [{ ...q, itemId: refs[q.ref]! }] : []) };
}
