// Enough — known-merchant map and merchant-string normalization.
// Section 6 of ENOUGH_BRIEF.md. Pure: no UI, no network.

import type { BillingModel, Category, DisplayCategory, OverlapGroup, SpendingCategory } from './types';

export type MerchantInfo = {
  merchantKey: string;
  name: string;
  category: Category;
  displayCategory: DisplayCategory;
  overlapGroup?: OverlapGroup;
  cancelUrl?: string;
  yearlyPrice?: number; // known cheaper annual price (rule 8), in EUR
  billingModel: BillingModel;
  /** Known plan prices. Charges matching one are the plan; other charges from
   *  the same merchant are add-ons (e.g. Upwork plan + Connects). */
  plans?: KnownPlan[];
  addonsLabel?: string;
  /** Shops, cafes, fuel: totals only, never a subscription or habit row. */
  spendingCategory?: SpendingCategory;
  /** 'builtin' = curated here, 'research' = learned by the merchant research API. */
  origin?: 'builtin' | 'research';
};

export type KnownPlan = { price: number; currency: string; interval: 'monthly' | 'yearly' };

type MerchantDef = Omit<MerchantInfo, 'billingModel'> & { aliases: string[]; billingModel: BillingModel };

// Aliases are matched against the *folded* merchant string (accent-stripped,
// lowercased, punctuation flattened to spaces). Longest alias wins.
const MERCHANTS: MerchantDef[] = [
  // --- Entertainment / video ---
  { merchantKey: 'netflix', billingModel: 'monthly', name: 'Netflix', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', cancelUrl: 'https://www.netflix.com/cancelplan', aliases: ['netflix'] },
  { merchantKey: 'disney+', billingModel: 'monthly', name: 'Disney+', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', cancelUrl: 'https://www.disneyplus.com/account', aliases: ['disneyplus', 'disney plus', 'disney+'] },
  { merchantKey: 'max', billingModel: 'monthly', name: 'Max', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', aliases: ['hbo max', 'hbomax', 'hbo'] },
  // --- Entertainment / music (overlap: music) ---
  { merchantKey: 'spotify', billingModel: 'monthly', name: 'Spotify', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'music', cancelUrl: 'https://www.spotify.com/account/subscription/', aliases: ['spotify'] },
  { merchantKey: 'youtube premium', billingModel: 'monthly', name: 'YouTube Premium', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'music', aliases: ['youtubepremium', 'youtube premium', 'youtube music'] },
  // --- AI & Software (overlap: ai) ---
  { merchantKey: 'chatgpt', billingModel: 'monthly', name: 'ChatGPT', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', cancelUrl: 'https://chatgpt.com/#settings', aliases: ['chatgpt', 'openai'] },
  { merchantKey: 'claude', billingModel: 'monthly', name: 'Claude', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['claude', 'anthropic'] },
  { merchantKey: 'gemini', billingModel: 'monthly', name: 'Gemini', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['google gemini', 'gemini advanced'] },
  { merchantKey: 'perplexity', billingModel: 'monthly', name: 'Perplexity', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['perplexity'] },
  { merchantKey: 'canva', billingModel: 'monthly', name: 'Canva', category: 'digital', displayCategory: 'AI & Software', aliases: ['canva'] },
  { merchantKey: 'adobe', billingModel: 'monthly', name: 'Adobe', category: 'digital', displayCategory: 'AI & Software', aliases: ['adobe'] },
  { merchantKey: 'skillshare', billingModel: 'yearly', name: 'Skillshare', category: 'digital', displayCategory: 'Learning', aliases: ['skillshare'] },
  { merchantKey: 'upwork', billingModel: 'monthly', name: 'Upwork', category: 'digital', displayCategory: 'AI & Software', plans: [{ price: 19.99, currency: 'USD', interval: 'monthly' }], addonsLabel: 'Connects', aliases: ['upwork'] },
  { merchantKey: 'outscraper', billingModel: 'usage', name: 'Outscraper', category: 'habit', displayCategory: 'Other', aliases: ['outscraper'] },
  { merchantKey: 'notion', billingModel: 'monthly', name: 'Notion', category: 'digital', displayCategory: 'AI & Software', aliases: ['notion'] },
  { merchantKey: 'microsoft', billingModel: 'monthly', name: 'Microsoft 365', category: 'digital', displayCategory: 'AI & Software', aliases: ['microsoft', 'office 365', 'microsoft 365', 'msft'] },
  // --- Cloud & Storage (overlap: cloud) ---
  { merchantKey: 'dropbox', billingModel: 'monthly', name: 'Dropbox', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['dropbox'] },
  { merchantKey: 'apple', billingModel: 'monthly', name: 'Apple', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['apple com bill', 'apple.com/bill', 'itunes', 'apple'] },
  { merchantKey: 'icloud', billingModel: 'monthly', name: 'iCloud+', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['icloud'] },
  { merchantKey: 'google one', billingModel: 'monthly', name: 'Google One', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['google one', 'googleone', 'google storage'] },
  { merchantKey: 'onedrive', billingModel: 'monthly', name: 'OneDrive', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['onedrive'] },
  // --- News & Media ---
  { merchantKey: 'nyt', billingModel: 'monthly', name: 'The New York Times', category: 'digital', displayCategory: 'News & Media', aliases: ['nytimes', 'new york times', 'nyt'] },
  { merchantKey: 'economist', billingModel: 'monthly', name: 'The Economist', category: 'digital', displayCategory: 'News & Media', aliases: ['economist'] },
  // --- Learning ---
  { merchantKey: 'duolingo', billingModel: 'monthly', name: 'Duolingo', category: 'digital', displayCategory: 'Learning', aliases: ['duolingo'] },
  { merchantKey: 'coursera', billingModel: 'monthly', name: 'Coursera', category: 'digital', displayCategory: 'Learning', aliases: ['coursera'] },
  { merchantKey: 'masterclass', billingModel: 'monthly', name: 'MasterClass', category: 'digital', displayCategory: 'Learning', aliases: ['masterclass'] },
  // --- Fitness & Health apps ---
  { merchantKey: 'strava', billingModel: 'monthly', name: 'Strava', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['strava'] },
  { merchantKey: 'headspace', billingModel: 'monthly', name: 'Headspace', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['headspace'] },
  { merchantKey: 'calm', billingModel: 'monthly', name: 'Calm', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['calm'] },
  // --- Shopping & Delivery ---
  { merchantKey: 'amazon prime', billingModel: 'monthly', name: 'Amazon Prime', category: 'digital', displayCategory: 'Shopping & Delivery', aliases: ['amazon prime', 'prime video', 'amzn'] },
  { merchantKey: 'wolt', billingModel: 'usage', name: 'Wolt', category: 'habit', displayCategory: 'Shopping & Delivery', aliases: ['wolt'] },
  { merchantKey: 'glovo', billingModel: 'usage', name: 'Glovo', category: 'habit', displayCategory: 'Shopping & Delivery', aliases: ['glovo'] },
  // --- Transport ---
  { merchantKey: 'uber', billingModel: 'usage', name: 'Uber', category: 'habit', displayCategory: 'Transport', aliases: ['uber'] },
  { merchantKey: 'bolt', billingModel: 'usage', name: 'Bolt', category: 'habit', displayCategory: 'Transport', aliases: ['bolt'] },
  // --- Bills / telecoms ---
  { merchantKey: 'telekom', billingModel: 'monthly', name: 'Telekom', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['telekom', 'telecom', 't-mobile', 'bh telecom', 'mtel', 'hrvatski telekom'] },
  { merchantKey: 'mts', billingModel: 'monthly', name: 'mts', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['mts'] },
  { merchantKey: 'infostan', billingModel: 'monthly', name: 'Infostan', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['infostan'] },
  { merchantKey: 'insurance', billingModel: 'yearly', name: 'Insurance', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['insurance', 'osiguranje', 'wiener stadtische osig', 'wiener stadtische'] },
  { merchantKey: 'airalo', billingModel: 'oneTime', name: 'Airalo', category: 'habit', displayCategory: 'Other', aliases: ['airalo'] },
  { merchantKey: 'bex courier', billingModel: 'usage', name: 'BEX Courier', category: 'habit', displayCategory: 'Shopping & Delivery', aliases: ['bex courier', 'bex express', 'bex'] },
  { merchantKey: 'starbucks', billingModel: 'usage', name: 'Starbucks', category: 'habit', displayCategory: 'Other', aliases: ['starbucks'] },
  // --- Fixture services and common regional providers ---
  { merchantKey: 'electricity bill', billingModel: 'monthly', name: 'Electricity bill', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['electricity bill', 'power bill'] },
  { merchantKey: 'elektro distribucija', billingModel: 'monthly', name: 'Elektro distribucija', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['elektro distribucija', 'elektroprivreda'] },
  { merchantKey: 'mobile postpaid bill', billingModel: 'monthly', name: 'Mobile postpaid bill', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['mobile postpaid bill'] },
  { merchantKey: 'fit zone', billingModel: 'monthly', name: 'Fit Zone', category: 'membership', displayCategory: 'Fitness & Health', aliases: ['fit zone'] },
  { merchantKey: 'fit zone gym', billingModel: 'monthly', name: 'Fit Zone Gym', category: 'membership', displayCategory: 'Fitness & Health', aliases: ['fit zone gym'] },
  { merchantKey: 'plivacki klub delfin', billingModel: 'monthly', name: 'Plivački klub Delfin', category: 'membership', displayCategory: 'Fitness & Health', aliases: ['plivacki klub delfin', 'plivački klub delfin'] },
  { merchantKey: 'swim club dolphin', billingModel: 'monthly', name: 'Swim Club Dolphin', category: 'membership', displayCategory: 'Fitness & Health', aliases: ['swim club dolphin'] },
  { merchantKey: 'uniqa osiguranje', billingModel: 'yearly', name: 'Uniqa insurance', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['uniqa osiguranje', 'uniqa insurance'] },
];

// Payment-processor prefixes and noise tokens stripped before matching.
const NOISE_TOKENS = [
  'com', 'www',
  'paypal', 'sq', 'sumup', 'izettle', 'stripe', 'revolut', 'kartica', 'karte', 'card',
  'pos', 'racun', 'rechnung', 'subscr', 'subscription', 'abo', 'payment',
  'naplata', 'transakcija', 'doo', 'd o o', 'gmbh', 'ltd', 'llc', 'inc', 'ag',
  'kg', 'sarajevo', 'beograd', 'zagreb', 'ljubljana', 'wien', 'berlin',
  'godisnja', 'godisnje', 'annual', 'jahres', 'mjesecna', 'monthly',
];

/** Fold accents, lowercase, and flatten every separator to single spaces.
 *  Keeps "+" so "disney+" survives. Result is space-separated word tokens. */
export function foldMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if `phrase` (one or more words) appears as WHOLE words in `folded`.
 *  "apple" does not match "applebees"; "market" does not match "marketing". */
export function containsWord(folded: string, phrase: string): boolean {
  const p = foldMerchant(phrase).replace(/[+]/g, '\\+');
  if (!p) return false;
  const re = new RegExp(`(?<![a-z0-9])${p}(?![a-z0-9])`);
  return re.test(folded);
}

/**
 * Normalize a raw merchant string to a stable key. Strips payment prefixes,
 * reference codes and noise, collapses spaces. Keeps "+" (disney+) and known
 * words like "premium". Does not consult the merchant map.
 */
export function normalizeMerchant(raw: string): string {
  // Drop processor prefixes before folding (they use * and / that folding eats).
  let s = raw.replace(/\b(google|openai|paypal|sq|sumup)\s*[*/]\s*/gi, ' ');
  s = foldMerchant(s); // space-separated word tokens, "com" now its own token
  const noise = new Set(NOISE_TOKENS);
  s = s
    .split(' ')
    .filter((tok) => {
      if (!tok || noise.has(tok)) return false; // noise words (com, doo, kartica, …)
      if (/^\d+$/.test(tok)) return false; // pure numbers (reference numbers, 0412)
      if (tok.length >= 4 && /[a-z]/.test(tok) && /\d/.test(tok)) return false; // ref codes
      return true;
    })
    .join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Look up a raw merchant string against the known-merchant map.
 *  Aliases match as WHOLE words; longest alias wins. */
const RESEARCHED: MerchantDef[] = [];

/** Add merchant profiles learned by the research API (cached per device).
 *  Built-in entries always win over researched ones with the same key. */
export function registerMerchantProfiles(profiles: Array<MerchantInfo & { aliases?: string[] }>): void {
  const builtinKeys = new Set(MERCHANTS.map((def) => def.merchantKey));
  for (const profile of profiles) {
    if (!profile.merchantKey || builtinKeys.has(profile.merchantKey)) continue;
    const def: MerchantDef = { ...profile, origin: 'research', aliases: profile.aliases?.length ? profile.aliases : [profile.merchantKey] };
    const index = RESEARCHED.findIndex((existing) => existing.merchantKey === def.merchantKey);
    if (index >= 0) RESEARCHED[index] = def; else RESEARCHED.push(def);
  }
}

export function clearResearchedMerchants(): void {
  RESEARCHED.length = 0;
}

export function matchMerchant(raw: string): MerchantInfo | undefined {
  const folded = foldMerchant(raw);
  const candidates: Array<{ alias: string; def: MerchantDef }> = [];
  for (const def of [...MERCHANTS, ...RESEARCHED]) {
    for (const alias of def.aliases) candidates.push({ alias, def });
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, def } of candidates) {
    if (containsWord(folded, alias)) {
      const { aliases: _aliases, ...info } = def;
      return info;
    }
  }
  return undefined;
}
