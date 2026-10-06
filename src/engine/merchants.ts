// Enough — known-merchant map and merchant-string normalization.
// Section 6 of ENOUGH_BRIEF.md. Pure: no UI, no network.

import type { Category, DisplayCategory, OverlapGroup } from './types';

export type MerchantInfo = {
  merchantKey: string;
  name: string;
  category: Category;
  displayCategory: DisplayCategory;
  overlapGroup?: OverlapGroup;
  cancelUrl?: string;
  yearlyPrice?: number; // known cheaper annual price (rule 8), in EUR
};

type MerchantDef = MerchantInfo & { aliases: string[] };

// Aliases are matched against the *folded* merchant string (accent-stripped,
// lowercased, punctuation flattened to spaces). Longest alias wins.
const MERCHANTS: MerchantDef[] = [
  // --- Entertainment / video ---
  { merchantKey: 'netflix', name: 'Netflix', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', cancelUrl: 'https://www.netflix.com/cancelplan', aliases: ['netflix'] },
  { merchantKey: 'disney+', name: 'Disney+', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', cancelUrl: 'https://www.disneyplus.com/account', aliases: ['disneyplus', 'disney plus', 'disney+'] },
  { merchantKey: 'max', name: 'Max', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'video', aliases: ['hbo max', 'hbomax', 'hbo'] },
  // --- Entertainment / music (overlap: music) ---
  { merchantKey: 'spotify', name: 'Spotify', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'music', cancelUrl: 'https://www.spotify.com/account/subscription/', aliases: ['spotify'] },
  { merchantKey: 'youtube premium', name: 'YouTube Premium', category: 'digital', displayCategory: 'Entertainment', overlapGroup: 'music', aliases: ['youtubepremium', 'youtube premium', 'youtube music'] },
  // --- AI & Software (overlap: ai) ---
  { merchantKey: 'chatgpt', name: 'ChatGPT', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', cancelUrl: 'https://chatgpt.com/#settings', aliases: ['chatgpt', 'openai'] },
  { merchantKey: 'claude', name: 'Claude', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['claude', 'anthropic'] },
  { merchantKey: 'gemini', name: 'Gemini', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['google gemini', 'gemini advanced'] },
  { merchantKey: 'perplexity', name: 'Perplexity', category: 'digital', displayCategory: 'AI & Software', overlapGroup: 'ai', aliases: ['perplexity'] },
  { merchantKey: 'canva', name: 'Canva', category: 'digital', displayCategory: 'AI & Software', aliases: ['canva'] },
  { merchantKey: 'adobe', name: 'Adobe', category: 'digital', displayCategory: 'AI & Software', aliases: ['adobe'] },
  { merchantKey: 'skillshare', name: 'Skillshare', category: 'digital', displayCategory: 'Learning', aliases: ['skillshare'] },
  { merchantKey: 'outscraper', name: 'Outscraper', category: 'digital', displayCategory: 'AI & Software', aliases: ['outscraper'] },
  { merchantKey: 'notion', name: 'Notion', category: 'digital', displayCategory: 'AI & Software', aliases: ['notion'] },
  { merchantKey: 'microsoft', name: 'Microsoft 365', category: 'digital', displayCategory: 'AI & Software', aliases: ['microsoft', 'office 365', 'microsoft 365', 'msft'] },
  // --- Cloud & Storage (overlap: cloud) ---
  { merchantKey: 'dropbox', name: 'Dropbox', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['dropbox'] },
  { merchantKey: 'apple', name: 'Apple', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['apple com bill', 'apple.com/bill', 'itunes', 'apple'] },
  { merchantKey: 'icloud', name: 'iCloud+', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['icloud'] },
  { merchantKey: 'google one', name: 'Google One', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['google one', 'googleone', 'google storage'] },
  { merchantKey: 'onedrive', name: 'OneDrive', category: 'digital', displayCategory: 'Cloud & Storage', overlapGroup: 'cloud', aliases: ['onedrive'] },
  // --- News & Media ---
  { merchantKey: 'nyt', name: 'The New York Times', category: 'digital', displayCategory: 'News & Media', aliases: ['nytimes', 'new york times', 'nyt'] },
  { merchantKey: 'economist', name: 'The Economist', category: 'digital', displayCategory: 'News & Media', aliases: ['economist'] },
  // --- Learning ---
  { merchantKey: 'duolingo', name: 'Duolingo', category: 'digital', displayCategory: 'Learning', aliases: ['duolingo'] },
  { merchantKey: 'coursera', name: 'Coursera', category: 'digital', displayCategory: 'Learning', aliases: ['coursera'] },
  { merchantKey: 'masterclass', name: 'MasterClass', category: 'digital', displayCategory: 'Learning', aliases: ['masterclass'] },
  // --- Fitness & Health apps ---
  { merchantKey: 'strava', name: 'Strava', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['strava'] },
  { merchantKey: 'headspace', name: 'Headspace', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['headspace'] },
  { merchantKey: 'calm', name: 'Calm', category: 'digital', displayCategory: 'Fitness & Health', aliases: ['calm'] },
  // --- Shopping & Delivery ---
  { merchantKey: 'amazon prime', name: 'Amazon Prime', category: 'digital', displayCategory: 'Shopping & Delivery', aliases: ['amazon prime', 'prime video', 'amzn'] },
  { merchantKey: 'wolt', name: 'Wolt', category: 'habit', displayCategory: 'Shopping & Delivery', aliases: ['wolt'] },
  { merchantKey: 'glovo', name: 'Glovo', category: 'habit', displayCategory: 'Shopping & Delivery', aliases: ['glovo'] },
  // --- Transport ---
  { merchantKey: 'uber', name: 'Uber', category: 'habit', displayCategory: 'Transport', aliases: ['uber'] },
  { merchantKey: 'bolt', name: 'Bolt', category: 'habit', displayCategory: 'Transport', aliases: ['bolt'] },
  // --- Bills / telecoms ---
  { merchantKey: 'telekom', name: 'Telekom', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['telekom', 'telecom', 't-mobile', 'bh telecom', 'mtel', 'hrvatski telekom'] },
  { merchantKey: 'mts', name: 'mts', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['mts'] },
  { merchantKey: 'infostan', name: 'Infostan', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['infostan'] },
  { merchantKey: 'insurance', name: 'Insurance', category: 'bill', displayCategory: 'Bills & Utilities', aliases: ['insurance', 'osiguranje', 'wiener stadtische osig', 'wiener stadtische'] },
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
export function matchMerchant(raw: string): MerchantInfo | undefined {
  const folded = foldMerchant(raw);
  const candidates: Array<{ alias: string; def: MerchantDef }> = [];
  for (const def of MERCHANTS) {
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
