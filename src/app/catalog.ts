// Enough — quick-pick catalog. Section 7 of ENOUGH_BRIEF.md.
// The tappable services on the Quick start screen. Prices are typical monthly
// EUR list prices, used only as a starting estimate the person can change.

import type { Category, DisplayCategory, Frequency, OverlapGroup } from '../engine/types';

export type QuickPick = {
  merchantKey: string;
  name: string;
  category: Category;
  displayCategory: DisplayCategory;
  price: number; // typical per-period price, EUR
  frequency: Frequency;
  overlapGroup?: OverlapGroup;
  cancelUrl?: string;
  yearlyPrice?: number; // known cheaper annual price, EUR (rule 8)
  currency?: string; // currency of price, default EUR
  group?: string; // tap-list group
  priceUnknown?: boolean; // catalog has no typical price: person enters it
  askPrice?: boolean; // price varies too much to estimate (gym, lessons): ask on tap
  billingModel?: import('../engine/types').BillingModel; // 'usage' = fixed cost (utilities), never recommended for cutting
};

export const QUICK_PICKS: QuickPick[] = [
  // Entertainment / video
  { merchantKey: 'netflix', name: 'Netflix', category: 'digital', displayCategory: 'Entertainment', price: 13.99, frequency: 'monthly', overlapGroup: 'video', cancelUrl: 'https://www.netflix.com/cancelplan' },
  { merchantKey: 'disney+', name: 'Disney+', category: 'digital', displayCategory: 'Entertainment', price: 10.99, frequency: 'monthly', overlapGroup: 'video' },
  { merchantKey: 'max', name: 'Max', category: 'digital', displayCategory: 'Entertainment', price: 9.99, frequency: 'monthly', overlapGroup: 'video' },
  { merchantKey: 'youtube premium', name: 'YouTube Premium', category: 'digital', displayCategory: 'Entertainment', price: 12.99, frequency: 'monthly', overlapGroup: 'music' },
  // Music
  { merchantKey: 'spotify', name: 'Spotify', category: 'digital', displayCategory: 'Entertainment', price: 10.99, frequency: 'monthly', overlapGroup: 'music', cancelUrl: 'https://www.spotify.com/account/subscription/', yearlyPrice: 109 },
  // AI & Software
  { merchantKey: 'chatgpt', name: 'ChatGPT', category: 'digital', displayCategory: 'AI & Software', price: 20, frequency: 'monthly', overlapGroup: 'ai' },
  { merchantKey: 'claude', name: 'Claude', category: 'digital', displayCategory: 'AI & Software', price: 20, frequency: 'monthly', overlapGroup: 'ai' },
  { merchantKey: 'perplexity', name: 'Perplexity', category: 'digital', displayCategory: 'AI & Software', price: 20, frequency: 'monthly', overlapGroup: 'ai' },
  { merchantKey: 'canva', name: 'Canva', category: 'digital', displayCategory: 'AI & Software', price: 11.99, frequency: 'monthly', yearlyPrice: 109.99 },
  { merchantKey: 'adobe', name: 'Adobe', category: 'digital', displayCategory: 'AI & Software', price: 23.99, frequency: 'monthly' },
  { merchantKey: 'notion', name: 'Notion', category: 'digital', displayCategory: 'AI & Software', price: 9.99, frequency: 'monthly' },
  // Cloud & Storage
  { merchantKey: 'icloud', name: 'iCloud+', category: 'digital', displayCategory: 'Cloud & Storage', price: 2.99, frequency: 'monthly', overlapGroup: 'cloud' },
  { merchantKey: 'google one', name: 'Google One', category: 'digital', displayCategory: 'Cloud & Storage', price: 1.99, frequency: 'monthly', overlapGroup: 'cloud' },
  { merchantKey: 'dropbox', name: 'Dropbox', category: 'digital', displayCategory: 'Cloud & Storage', price: 11.99, frequency: 'monthly', overlapGroup: 'cloud' },
  // News & Media
  { merchantKey: 'nyt', name: 'The New York Times', category: 'digital', displayCategory: 'News & Media', price: 8, frequency: 'monthly' },
  { merchantKey: 'economist', name: 'The Economist', category: 'digital', displayCategory: 'News & Media', price: 19.9, frequency: 'monthly' },
  // Learning
  { merchantKey: 'duolingo', name: 'Duolingo', category: 'digital', displayCategory: 'Learning', price: 6.99, frequency: 'monthly', yearlyPrice: 59.99 },
  { merchantKey: 'coursera', name: 'Coursera', category: 'digital', displayCategory: 'Learning', price: 49, frequency: 'monthly' },
  { merchantKey: 'masterclass', name: 'MasterClass', category: 'digital', displayCategory: 'Learning', price: 15, frequency: 'monthly' },
  // Fitness & Health
  { merchantKey: 'strava', name: 'Strava', category: 'digital', displayCategory: 'Fitness & Health', price: 8.99, frequency: 'monthly' },
  { merchantKey: 'headspace', name: 'Headspace', category: 'digital', displayCategory: 'Fitness & Health', price: 12.99, frequency: 'monthly' },
  { merchantKey: 'calm', name: 'Calm', category: 'digital', displayCategory: 'Fitness & Health', price: 12.99, frequency: 'monthly' },
  { merchantKey: 'gym', name: 'Gym', category: 'membership', displayCategory: 'Fitness & Health', price: 40, frequency: 'monthly' },
  // Shopping & Delivery
  { merchantKey: 'amazon prime', name: 'Amazon Prime', category: 'digital', displayCategory: 'Shopping & Delivery', price: 8.99, frequency: 'monthly' },
  { merchantKey: 'wolt+', name: 'Wolt+', category: 'digital', displayCategory: 'Shopping & Delivery', price: 9.99, frequency: 'monthly' },
  // Bills
  { merchantKey: 'phone', name: 'Phone plan', category: 'bill', displayCategory: 'Bills & Utilities', price: 25, frequency: 'monthly' },
  // Kids & Family
  { merchantKey: 'kids activity', name: "Kids' activity", category: 'membership', displayCategory: 'Kids & Family', price: 30, frequency: 'monthly' },
];

/** Cash-entry chips for screen 6 (offline / cash costs). */
export const CASH_CHIPS: Array<{ name: string; displayCategory: DisplayCategory; category: Category }> = [
  { name: 'Hairdresser / barber', displayCategory: 'Other', category: 'habit' },
  { name: 'Nails / manicure', displayCategory: 'Other', category: 'habit' },
  { name: 'Beauty / skincare', displayCategory: 'Other', category: 'habit' },
  { name: 'Massage', displayCategory: 'Other', category: 'habit' },
  { name: 'Cleaning', displayCategory: 'Other', category: 'habit' },
  { name: 'Babysitter / nanny', displayCategory: 'Kids & Family', category: 'habit' },
  { name: 'Coffee', displayCategory: 'Other', category: 'habit' },
  { name: 'Parking', displayCategory: 'Transport', category: 'habit' },
];

export const YEARLY_CHIPS: Array<{ name: string; displayCategory: DisplayCategory; category: Category }> = [
  { name: 'Insurance', displayCategory: 'Bills & Utilities', category: 'bill' },
  { name: 'Domain', displayCategory: 'AI & Software', category: 'digital' },
  { name: 'Software licence', displayCategory: 'AI & Software', category: 'digital' },
  { name: 'Membership', displayCategory: 'Fitness & Health', category: 'membership' },
];

// ---------------------------------------------------------------------------
// Researched catalog → tap list
// ---------------------------------------------------------------------------
import { CATALOG, catalogCategory, catalogForCountry, type CatalogEntry } from '../engine/catalog';

export function pickFromCatalog(entry: CatalogEntry): QuickPick {
  return {
    merchantKey: entry.k,
    name: entry.n.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
    category: catalogCategory(entry),
    displayCategory: entry.c,
    price: entry.p ?? 0,
    currency: entry.cur ?? 'EUR',
    frequency: 'monthly',
    group: entry.gen ? 'Everyday costs' : entry.g,
    ...(entry.p === undefined ? { priceUnknown: true } : {}),
    ...(entry.cu ? { cancelUrl: entry.cu } : {}),
    ...(entry.y ? { yearlyPrice: entry.y } : {}),
  };
}

/** Tap list for a country: local, then global, plus generic everyday costs. */
export function picksForCountry(country: string): QuickPick[] {
  return catalogForCountry(country).map(pickFromCatalog);
}

export function searchCatalog(query: string): QuickPick[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return CATALOG.filter((e) => e.n.toLowerCase().includes(q) || e.a.some((a) => a.toLowerCase().includes(q)))
    .sort((a, b) => b.pop - a.pop).slice(0, 30).map(pickFromCatalog);
}
