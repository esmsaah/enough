// Enough — "Finish on my computer" (brief §8 screen 3) without any server.
// The link carries only tapped and hand-entered items in its #fragment, which
// browsers never send to a server. Statement data is never included.

import type { Item } from '../engine/types';

const KEEP = ['name', 'merchantKey', 'category', 'displayCategory', 'price', 'currency', 'frequency', 'overlapGroup', 'cancelUrl', 'yearlyPrice',
  'planName', 'billingModel', 'usage', 'wouldMiss', 'visitsPerMonth', 'singleVisitPrice', 'compareState', 'contract', 'contractEnds', 'watchAtOnce',
  'householdOwn', 'needs4K', 'minQuality', 'adsOk', 'storageUsedGb', 'renewalMonth', 'trialEndsOn', 'userPriced', 'catalogPrice', 'source', 'estimate', 'priceConfirmed'] as const;

type Carried = Partial<Pick<Item, (typeof KEEP)[number]>>;

/** Only quick-pick, hand-entered and cash items can travel. */
export function portableItems(items: Item[]): Item[] {
  return items.filter((i) => i.source === 'quickpick' || i.source === 'manual' || i.source === 'cash');
}

function toB64Url(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function continueLink(origin: string, items: Item[], country?: string): string {
  const carried: Carried[] = portableItems(items).map((i) => Object.fromEntries(KEEP.filter((k) => i[k] !== undefined).map((k) => [k, i[k]])) as Carried);
  return `${origin}/#continue=${toB64Url(JSON.stringify({ v: 1, country, items: carried }))}`;
}

/** Read items from a #continue= link; undefined when the hash is not one or is damaged. */
export function readContinueHash(hash: string): { items: Array<Omit<Item, 'id'>>; country?: string } | undefined {
  const m = hash.match(/^#continue=([A-Za-z0-9_-]+)$/);
  if (!m) return undefined;
  try {
    const data = JSON.parse(fromB64Url(m[1]!)) as { v?: number; country?: string; items?: Carried[] };
    if (data.v !== 1 || !Array.isArray(data.items)) return undefined;
    const items = data.items
      .filter((i) => typeof i.name === 'string' && typeof i.price === 'number' && Number.isFinite(i.price) && typeof i.currency === 'string' && typeof i.frequency === 'string' && typeof i.category === 'string')
      .slice(0, 100)
      .map((i) => ({ ...i, name: String(i.name).slice(0, 80), source: i.source ?? 'manual', estimate: i.estimate ?? true }) as Omit<Item, 'id'>);
    return { items, ...(typeof data.country === 'string' ? { country: data.country.slice(0, 2) } : {}) };
  } catch {
    return undefined;
  }
}
