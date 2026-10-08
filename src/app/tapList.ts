// Enough — the quick-start TAP LIST. Separate from the big matching catalog.
//
// The tap list's only job is a fast, RELEVANT start. So it is:
//   (a) a hand-curated GLOBAL CORE of services people everywhere may pay for
//       (correct categories, one entry per brand), plus
//   (b) the LOCAL entries for the person's country, cleaned by global rules
//       (drop public-broadcaster channels, fix known mis-categories, recategorize
//        the TV-licence fee as a bill, drop brand-less generics).
// It is NOT the full 1,300-entry catalog, so a country never floods with
// irrelevant foreign apps. Anything missing is covered by search + "Add your own".

import { CATALOG, catalogCategory, type CatalogEntry } from '../engine/catalog';
import { pickFromCatalog, type QuickPick } from './catalog';
import globalCoreData from './globalCore.data.json';

// ---------------------------------------------------------------------------
// (a) Curated global core — built from research/global.csv (verified prices
// where available), plus a universal gym and a generic phone fallback.
// Rebuild with: npx vite-node scripts/buildGlobalCore.ts
// ---------------------------------------------------------------------------
export const GLOBAL_CORE: QuickPick[] = [
  ...(globalCoreData as QuickPick[]),
  { merchantKey: 'gym', name: 'Gym', group: 'Fitness & Health', displayCategory: 'Fitness & Health', category: 'membership', price: 40, currency: 'USD', frequency: 'monthly' },
  { merchantKey: 'phone', name: 'Phone plan', group: 'Phone & Internet', displayCategory: 'Bills & Utilities', category: 'bill', price: 25, currency: 'USD', frequency: 'monthly' },
];


const CORE_KEYS = new Set(GLOBAL_CORE.map((p) => p.merchantKey));

// ---------------------------------------------------------------------------
// (b) Global cleaning rules for the LOCAL catalog layer.
// ---------------------------------------------------------------------------

/** Known category/type fixes, applied in every country at once. */
const OVERRIDES: Record<string, Partial<Pick<CatalogEntry, 'c' | 'g' | 't'>>> = {
  calm: { c: 'Fitness & Health', g: 'Fitness & Health' },
  docusign: { c: 'AI & Software', g: 'Work & Freelance' },
  'adobe acrobat sign': { c: 'AI & Software', g: 'Work & Freelance' },
  patreon: { c: 'Entertainment', g: 'Entertainment', t: 'm' },
};

/** Public free-to-air broadcasters wrongly listed as subscriptions. Extensible. */
const BROADCASTER = /\b(BHT|FTV|RTRS|OBN|Hayat|RTS|RTVS|HRT|RTCG|MRT|RTSH|BBC|ITV|ARD|ZDF|RAI|TVE|RTVE|France\s?2|France\s?3|NPO|TRT|ORF|SRF|DR1|YLE|NRK|SVT|PBS)\b/i;

function isBroadcasterChannel(e: CatalogEntry): boolean {
  return e.t === 's' && e.g === 'Entertainment' && BROADCASTER.test(e.n);
}

function cleaned(e: CatalogEntry): CatalogEntry {
  const o = OVERRIDES[e.k];
  let next = o ? { ...e, ...o } : e;
  // A TV-licence fee is a bill, not Entertainment (BHT RTV tax, GEZ, TV Licence…).
  if (next.t === 'b' && next.g === 'Entertainment') {
    next = { ...next, g: 'Bills & Utilities', c: 'Bills & Utilities' };
  }
  return next;
}

/** True if this local entry earns a place on the tap list. */
function keepLocal(e: CatalogEntry): boolean {
  if (e.gen) return false; // brand-less generics (rent, electricity) live in the cash/yearly step
  if (e.g === 'Insurance') return false; // generic insurance is a yearly-bill question, not a chip
  if (isBroadcasterChannel(e)) return false; // free channels are not subscriptions
  if (CORE_KEYS.has(e.k)) return false; // the curated core already covers it
  return true;
}

// ---------------------------------------------------------------------------
// The tap list for a country: curated core + cleaned local entries.
// ---------------------------------------------------------------------------
export function tapListForCountry(country: string): QuickPick[] {
  const code = country.toUpperCase();
  const local = CATALOG
    .filter((e) => e.r.includes(code))
    .map(cleaned)
    .filter(keepLocal)
    .sort((a, b) => b.pop - a.pop || a.n.localeCompare(b.n))
    .map(pickFromCatalog);

  // Core first, then local; de-dupe by merchantKey (core wins).
  const seen = new Set<string>();
  const out: QuickPick[] = [];
  for (const p of [...GLOBAL_CORE, ...local]) {
    if (seen.has(p.merchantKey)) continue;
    seen.add(p.merchantKey);
    out.push(p);
  }
  return out;
}

export { catalogCategory };
