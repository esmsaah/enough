// Build the quick-start GLOBAL CORE from researched CSV (research/global.csv).
//   npx vite-node scripts/buildGlobalCore.ts
// Emits src/app/globalCore.data.json consumed by src/app/tapList.ts.
// Applies our curation rules: collapse plan variants to the base brand, map the
// research taxonomy to the app's groups/categories, keep verified prices.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

type Row = Record<string, string>;

const CSV = join(__dirname, '..', 'research', 'global.csv');
const OUT = join(__dirname, '..', 'src', 'app', 'globalCore.data.json');

// Collapse plan tiers to one base brand: CSV name -> [merchantKey, display].
const RENAME: Record<string, [string, string]> = {
  'ChatGPT Plus': ['chatgpt', 'ChatGPT'],
  'Claude Pro': ['claude', 'Claude'],
  'Perplexity Pro': ['perplexity', 'Perplexity'],
  'Canva Pro': ['canva', 'Canva'],
  'Duolingo Super': ['duolingo', 'Duolingo'],
  'Coursera Plus': ['coursera', 'Coursera'],
  'Amazon Music Unlimited': ['amazon music', 'Amazon Music'],
  'Google Health Premium': ['fitbit premium', 'Fitbit Premium'],
  'Max': ['max', 'HBO Max'],
};

// Research "category" is already close to our tap-list group names.
const GROUP = (c: string): string => c;
// Map a group to the engine DisplayCategory (results grouping).
const DISPLAY: Record<string, string> = {
  Entertainment: 'Entertainment', Music: 'Entertainment', Social: 'Entertainment', Gaming: 'Entertainment',
  'AI & Software': 'AI & Software', 'Work & Freelance': 'AI & Software',
  'Cloud & Storage': 'Cloud & Storage', 'News & Media': 'News & Media', Learning: 'Learning',
  'Fitness & Health': 'Fitness & Health', 'Shopping & Delivery': 'Shopping & Delivery',
  Dating: 'Other', 'VPN & Security': 'Other', Finance: 'Other',
};

const VIDEO = new Set(['netflix', 'disney+', 'max', 'apple tv+', 'paramount+', 'crunchyroll', 'dazn']);
const AI_ASSISTANT = new Set(['chatgpt', 'claude', 'perplexity', 'gemini']);

// Starting-estimate prices (USD/mo) for brands whose official page hid the price
// from research. The tap list shows these only as an editable starting point —
// not as verified data. Anything not listed falls back to 9.99.
const FALLBACK: Record<string, number> = {
  netflix: 15.99, 'disney+': 9.99, spotify: 11.99, 'youtube premium': 13.99,
  'x premium': 8, 'snapchat+': 3.99, 'telegram premium': 4.99, 'meta verified': 14.99,
  duolingo: 6.99, canva: 12.99, tinder: 19.99, bumble: 16.99, hinge: 29.99,
  '1password': 2.99, dashlane: 4.99, proton: 9.99, surfshark: 2.99, lastpass: 4.99,
  babbel: 9.99, 'bloomberg digital': 34.99, medium: 5, mega: 9.99, midjourney: 10,
  'google play pass': 5.99, pcloud: 4.99, crunchyroll: 7.99, 'the wall street journal': 19.99,
  'the washington post': 12, 'the new york times': 12, 'fitbit premium': 9.99, vimeo: 12,
};
const FALLBACK_DEFAULT = 9.99;

const slug = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim();
const num = (s: string) => { const n = Number(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const rows = (Papa.parse(readFileSync(CSV, 'utf-8'), { header: true, skipEmptyLines: 'greedy' }).data as Row[])
  .filter((r) => r.name && r.name.trim());

const byKey = new Map<string, any>();
for (const r of rows) {
  const rename = RENAME[r.name.trim()];
  const merchantKey = rename ? rename[0] : slug(r.name);
  const name = rename ? rename[1] : r.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const group = GROUP(r.category.trim());
  const displayCategory = DISPLAY[group] ?? 'Other';

  const monthly = num(r.typical_monthly_price);
  const yearly = num(r.yearly_plan_price);
  const verified = monthly ?? (yearly ? round2(yearly / 12) : undefined);
  const price = verified ?? FALLBACK[merchantKey] ?? FALLBACK_DEFAULT;

  let overlapGroup: string | undefined;
  if (group === 'Music') overlapGroup = 'music';
  else if (group === 'Cloud & Storage') overlapGroup = 'cloud';
  else if (VIDEO.has(merchantKey)) overlapGroup = 'video';
  else if (AI_ASSISTANT.has(merchantKey)) overlapGroup = 'ai';

  const pick: any = {
    merchantKey, name, group, displayCategory,
    category: 'digital', // every global-core service is digital; gyms are added in tapList
    price, currency: 'USD', frequency: 'monthly',
  };
  if (yearly) pick.yearlyPrice = yearly;
  if (overlapGroup) pick.overlapGroup = overlapGroup;
  if (r.cancel_url && r.cancel_url.trim()) pick.cancelUrl = r.cancel_url.trim();

  // Keep the higher-popularity row if a brand appears twice after collapsing.
  const prev = byKey.get(merchantKey);
  const pop = Number(r.popularity_rank) || 0;
  if (!prev || pop > (prev.__pop ?? 0)) byKey.set(merchantKey, { ...pick, __pop: pop });
}

const out = [...byKey.values()]
  .sort((a, b) => b.__pop - a.__pop || a.name.localeCompare(b.name))
  .map(({ __pop, ...p }) => p);

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${out.length} global-core services to ${OUT}`);
console.log('with verified price:', out.filter((p) => !p.priceUnknown).length, ' | price unknown:', out.filter((p) => p.priceUnknown).length);
