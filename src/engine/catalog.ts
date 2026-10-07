// Enough — researched catalog of ~1,300 subscriptions, memberships and bills in
// 90 countries (research/catalog.csv, built into catalog.data.json).
// Used for the tap list (by country) and as the lowest-priority merchant map.

import data from './catalog.data.json';
import type { KnownPlan } from './merchants';
import type { BillingModel, Category, DisplayCategory } from './types';

export type CatalogEntry = {
  k: string; // key
  n: string; // display name
  t: 's' | 'm' | 'b'; // subscription | membership | bill
  c: DisplayCategory; // app display category
  g: string; // tap-list group, e.g. "Phone & Internet"
  r: string[]; // ISO country codes or GLOBAL
  pop: number; // 1–5
  a: string[]; // statement aliases
  p?: number; // typical monthly price (estimate unless pv)
  cur?: string;
  y?: number; // yearly plan price
  pv?: 1; // price verified
  cu?: string; // verified cancel URL
  o?: string[]; // overlaps with
  gen?: 1; // generic row without a brand (rent, electricity, ...)
};

export const CATALOG = data as CatalogEntry[];

export function catalogCategory(entry: CatalogEntry): Category {
  return entry.t === 'b' ? 'bill' : entry.t === 'm' ? 'membership' : 'digital';
}

/** Entries for one country: local first, then global, most popular first. */
export function catalogForCountry(country: string): CatalogEntry[] {
  const code = country.toUpperCase();
  const local = CATALOG.filter((e) => e.r.includes(code));
  const global = CATALOG.filter((e) => e.r.includes('GLOBAL') && !e.r.includes(code));
  const byPop = (a: CatalogEntry, b: CatalogEntry) => b.pop - a.pop || a.n.localeCompare(b.n);
  return [...local.sort(byPop), ...global.sort(byPop)];
}

export type CatalogMerchant = {
  merchantKey: string;
  name: string;
  category: Category;
  displayCategory: DisplayCategory;
  billingModel: BillingModel;
  plans?: KnownPlan[];
  cancelUrl?: string;
  aliases: string[];
};

// An alias made only of these words names no brand ("home internet", "free mobile").
const GENERIC_ALIAS_WORDS = new Set(['home', 'internet', 'mobile', 'phone', 'free', 'plus', 'premium', 'pro', 'one', 'pass', 'tv', 'app', 'apps', 'store', 'gym', 'fitness', 'wellness', 'club', 'insurance', 'energy', 'electric', 'electricity', 'water', 'gas', 'power', 'bank', 'card', 'pay', 'payment', 'online', 'digital', 'music', 'video', 'cloud', 'news', 'shop', 'market', 'taxi', 'parking', 'transport', 'city', 'net', 'telecom', 'mail', 'post', 'service', 'services', 'the', 'and', 'of']);

/** Statement aliases worth matching: at least 4 characters or two words. */
export function catalogMerchants(fold: (raw: string) => string): CatalogMerchant[] {
  return CATALOG.filter((e) => !e.gen).map((e) => {
    const aliases = [...new Set([e.n.replace(/\(.*?\)/g, ''), ...e.a].map((alias) => fold(alias.replace(/[*]/g, ' ')).trim())
      .filter((alias) => (alias.length >= 4 || alias.includes(' ')) && !alias.split(' ').every((word) => GENERIC_ALIAS_WORDS.has(word))))];
    return {
      merchantKey: e.k,
      name: e.n.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
      category: catalogCategory(e),
      displayCategory: e.c,
      billingModel: (e.y && !e.p ? 'yearly' : 'monthly') as BillingModel,
      // Only verified prices may split a plan from add-ons.
      ...(e.pv && e.p && e.cur && e.t === 's' ? { plans: [{ price: e.p, currency: e.cur, interval: 'monthly' as const }] } : {}),
      ...(e.cu ? { cancelUrl: e.cu } : {}),
      aliases,
    };
  }).filter((m) => m.aliases.length > 0);
}
