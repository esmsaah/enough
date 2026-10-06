// Enough — what may leave the device for merchant research, and how a
// researched profile is validated before the engine trusts it.
// Pure: shared by the app (building the request) and the server (checking it).

import { isPrivateTransfer } from './keywords';
import { matchMerchant, normalizeMerchant, type KnownPlan, type MerchantInfo } from './merchants';
import type { BillingModel, Category, DisplayCategory, SpendingCategory, Transaction } from './types';

export const MAX_RESEARCH_NAMES = 60;
const MAX_NAME_LENGTH = 48;

/** Words that make a two- or three-word name a business, not a person. */
const BUSINESS_WORDS = new Set([
  'bar', 'cafe', 'caffe', 'kafe', 'kafic', 'coffee', 'kafa', 'kafana', 'restoran', 'restaurant', 'bistro', 'pizza', 'pizzeria', 'grill', 'burger',
  'pekara', 'bakery', 'market', 'marketi', 'shop', 'store', 'trgovina', 'radnja', 'butik', 'boutique', 'salon', 'studio', 'centar', 'center',
  'apoteka', 'pharmacy', 'hotel', 'hostel', 'doo', 'pr', 'szr', 'str', 'sp', 'ltd', 'gmbh', 'inc', 'llc', 'group', 'global', 'trade',
  'shopping', 'mall', 'online', 'app', 'pay', 'club', 'klub', 'gym', 'fitness', 'school', 'skola', 'service', 'servis', 'auto', 'taxi',
  'connect', 'talk', 'media', 'net', 'tech', 'technologies', 'engineering', 'flora', 'butcher', 'mesara', 'pijaca', 'tezga', 'trg',
]);

/** Statement filler that names no business. */
const GENERIC_NAMES = new Set(['ref', 'reference', 'payment', 'transfer', 'fee', 'fees', 'provizija', 'naknada', 'uplata', 'isplata', 'prenos', 'kartica', 'card', 'purchase', 'kupovina', 'atm', 'cash', 'gotovina', 'interest', 'kamata', 'tax', 'porez', 'refund', 'povrat', 'balance', 'stanje']);

/** Two or three plain words with no business word: may be a person, never sent. */
export function looksLikePersonName(normalized: string): boolean {
  const words = normalized.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  if (!words.every((word) => /^[a-z]{2,}$/.test(word))) return false;
  return !words.some((word) => BUSINESS_WORDS.has(word));
}

/** Clean one name for the wire. Returns undefined when it must not be sent. */
export function sanitizeResearchName(raw: string): string | undefined {
  const normalized = normalizeMerchant(raw).replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length < 2 || normalized.length > MAX_NAME_LENGTH) return undefined;
  if (/\d{4,}/.test(normalized)) return undefined; // reference or account fragments
  if (normalized.split(' ').every((word) => GENERIC_NAMES.has(word))) return undefined;
  if (isPrivateTransfer(normalized) || looksLikePersonName(normalized)) return undefined;
  return normalized;
}

/**
 * The only thing the app sends for research: unknown merchant names, cleaned,
 * deduplicated, largest total spend first. No amounts, dates, currencies per row,
 * account data or person-to-person transfers.
 */
export function merchantNamesForResearch(transactions: Transaction[], known: (name: string) => boolean = () => false): string[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (matchMerchant(transaction.merchantRaw)) continue;
    const name = sanitizeResearchName(transaction.merchantRaw);
    if (!name || known(name)) continue;
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(transaction.amount));
  }
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, MAX_RESEARCH_NAMES).map(([name]) => name);
}

// ---------------------------------------------------------------------------
// Researched profile (wire format) → MerchantInfo the engine can use
// ---------------------------------------------------------------------------

export type ResearchProfile = {
  key: string; // the sanitized name it answers
  name: string; // display name, e.g. "Maxi"
  what: string; // one line, e.g. "Supermarket chain in Serbia"
  kind: 'subscription' | 'membership' | 'bill' | 'spending' | 'oneTime' | 'transfer' | 'unknown';
  displayCategory?: DisplayCategory;
  spendingCategory?: SpendingCategory;
  billingModel?: BillingModel;
  plans?: KnownPlan[];
  addonsLabel?: string;
  cancelUrl?: string;
  confidence: number;
  sources?: string[];
};

const DISPLAY: DisplayCategory[] = ['Entertainment', 'AI & Software', 'Cloud & Storage', 'News & Media', 'Learning', 'Fitness & Health', 'Kids & Family', 'Shopping & Delivery', 'Bills & Utilities', 'Transport', 'Other'];
const SPENDING: SpendingCategory[] = ['Groceries', 'Cafes & eating out', 'Transport', 'Delivery'];
const BILLING: BillingModel[] = ['monthly', 'yearly', 'usage', 'oneTime'];
const KINDS: ResearchProfile['kind'][] = ['subscription', 'membership', 'bill', 'spending', 'oneTime', 'transfer', 'unknown'];

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/** Strict whitelist check of untrusted model output. Unknown fields are dropped. */
export function validateResearchProfile(raw: unknown): ResearchProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === 'string' ? sanitizeResearchName(r.key) ?? r.key.trim().toLowerCase().slice(0, MAX_NAME_LENGTH) : undefined;
  const kind = KINDS.find((k) => k === r.kind);
  const name = text(r.name, 60);
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
  if (!key || !kind || !name) return undefined;
  const plans = Array.isArray(r.plans)
    ? r.plans.flatMap((plan): KnownPlan[] => {
      if (!plan || typeof plan !== 'object') return [];
      const p = plan as Record<string, unknown>;
      const price = typeof p.price === 'number' && p.price > 0 && p.price < 10_000 ? p.price : undefined;
      const currency = typeof p.currency === 'string' && /^[A-Z]{3}$/.test(p.currency) ? p.currency : undefined;
      const interval = p.interval === 'monthly' || p.interval === 'yearly' ? p.interval : undefined;
      return price && currency && interval ? [{ price, currency, interval }] : [];
    }).slice(0, 6)
    : undefined;
  const cancelUrl = text(r.cancelUrl, 200);
  return {
    key,
    name,
    what: text(r.what, 140) ?? '',
    kind,
    displayCategory: DISPLAY.find((d) => d === r.displayCategory),
    spendingCategory: SPENDING.find((d) => d === r.spendingCategory),
    billingModel: BILLING.find((b) => b === r.billingModel),
    ...(plans?.length ? { plans } : {}),
    ...(text(r.addonsLabel, 40) ? { addonsLabel: text(r.addonsLabel, 40) } : {}),
    ...(cancelUrl && /^https:\/\//.test(cancelUrl) ? { cancelUrl } : {}),
    confidence,
    ...(Array.isArray(r.sources) ? { sources: r.sources.filter((s): s is string => typeof s === 'string' && /^https?:\/\//.test(s)).slice(0, 5) } : {}),
  };
}

/** Researched profile → engine merchant entry. Low confidence and transfers are not used. */
export function merchantInfoFromResearch(profile: ResearchProfile): (MerchantInfo & { aliases: string[] }) | undefined {
  if (profile.confidence < 0.6 || profile.kind === 'transfer' || profile.kind === 'unknown') return undefined;
  const category: Category = profile.kind === 'subscription' ? 'digital'
    : profile.kind === 'membership' ? 'membership'
      : profile.kind === 'bill' ? 'bill'
        : 'habit';
  const displayCategory: DisplayCategory = profile.displayCategory
    ?? (category === 'bill' ? 'Bills & Utilities' : category === 'membership' ? 'Fitness & Health' : category === 'digital' ? 'AI & Software' : 'Other');
  const billingModel: BillingModel = profile.billingModel
    ?? (profile.kind === 'oneTime' ? 'oneTime' : profile.kind === 'spending' ? 'usage' : 'monthly');
  return {
    merchantKey: profile.key,
    name: profile.name,
    category,
    displayCategory,
    billingModel,
    origin: 'research',
    aliases: [profile.key],
    ...(profile.kind === 'spending' && profile.spendingCategory ? { spendingCategory: profile.spendingCategory } : {}),
    ...(profile.plans?.length ? { plans: profile.plans } : {}),
    ...(profile.addonsLabel ? { addonsLabel: profile.addonsLabel } : {}),
    ...(profile.cancelUrl ? { cancelUrl: profile.cancelUrl } : {}),
  };
}
