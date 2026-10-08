// Build the per-country LOCAL tap-list layer from researched CSVs.
//   npx vite-node scripts/buildLocalCore.ts
// Reads every research/local_*.csv and emits src/app/localCore.data.json,
// a flat array of local QuickPicks (each carries its country `region`).
// Used by tapList.ts for countries we have researched; others fall back to the
// big catalog's cleaned local entries.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

type Row = Record<string, string>;

const RESEARCH = join(__dirname, '..', 'research');
const OUT = join(__dirname, '..', 'src', 'app', 'localCore.data.json');

// Research "category" (the tap-list group) -> engine DisplayCategory.
const DISPLAY: Record<string, string> = {
  'Phone & Internet': 'Bills & Utilities', Utilities: 'Bills & Utilities',
  Insurance: 'Bills & Utilities', Housing: 'Bills & Utilities',
  Transport: 'Transport', Entertainment: 'Entertainment',
  'Fitness & Health': 'Fitness & Health', Other: 'Other',
};
const BILL_GROUPS = new Set(['Phone & Internet', 'Utilities', 'Insurance', 'Housing', 'Transport']);
// Starting-estimate price (local currency) when the official page hid a number.
const FALLBACK_BY_GROUP: Record<string, number> = {
  'Phone & Internet': 30, Utilities: 80, Insurance: 30, Housing: 100,
  Transport: 70, Entertainment: 12, 'Fitness & Health': 30, Other: 15,
};

const slug = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim();
const num = (s: string) => { const n = Number(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const normRegion = (r: string) => (r.trim().toUpperCase() === 'GB' ? 'UK' : r.trim().toUpperCase());

function analysis(type: string, group: string): 'digital' | 'membership' | 'bill' {
  if (type === 'bill') return 'bill';
  if (type === 'membership') return 'membership';
  return BILL_GROUPS.has(group) ? 'bill' : 'digital'; // subscription in a bill-ish group = a bill
}

const files = readdirSync(RESEARCH).filter((f) => /^local_.*\.csv$/.test(f));
const byKey = new Map<string, any>(); // region|key -> pick

for (const file of files) {
  const rows = (Papa.parse(readFileSync(join(RESEARCH, file), 'utf-8'), { header: true, skipEmptyLines: 'greedy' }).data as Row[])
    .filter((r) => r.name && r.name.trim());
  for (const r of rows) {
    const group = (r.category || 'Other').trim();
    const region = normRegion(r.regions || '');
    if (!region || region.length !== 2) continue;
    const name = r.name.replace(/\s*\(.*?\)\s*$/g, '').trim();
    const merchantKey = slug(r.name);
    if (!merchantKey) continue;

    const monthly = num(r.typical_monthly_price);
    const yearly = num(r.yearly_plan_price);
    const verified = monthly ?? (yearly ? round2(yearly / 12) : undefined);
    const price = verified ?? FALLBACK_BY_GROUP[group] ?? 12;

    const pick: any = {
      merchantKey, name,
      group,
      displayCategory: DISPLAY[group] ?? 'Other',
      category: analysis((r.type || '').trim(), group),
      price, currency: (r.currency || 'USD').trim().toUpperCase(),
      frequency: 'monthly',
      region,
      pop: Number(r.popularity_rank) || 0,
    };
    // Utilities and housing are fixed, usage-based costs the person can't switch
    // away from — mark them so the engine never recommends cutting them.
    if (group === 'Utilities' || group === 'Housing') pick.billingModel = 'usage';
    if (yearly) pick.yearlyPrice = yearly;
    if (r.cancel_url && r.cancel_url.trim()) pick.cancelUrl = r.cancel_url.trim();

    const id = `${region}|${merchantKey}`;
    const prev = byKey.get(id);
    if (!prev || pick.pop > prev.pop) byKey.set(id, pick);
  }
}

const out = [...byKey.values()].sort((a, b) => a.region.localeCompare(b.region) || b.pop - a.pop || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const countries = [...new Set(out.map((p) => p.region))].sort();
console.log(`wrote ${out.length} local services across ${countries.length} countries: ${countries.join(' ')}`);
