// Enough — bridge between the app and the opportunity engine.
// Turns the person's items into engine subscriptions and our verified plan data
// into an engine market, in the display currency. Only verified plans are used
// (plansFor already filters), so every alternative has a source and a date.
import type { Item } from '../engine/types';
import { runOpportunities, type Market, type Plan as EnginePlan, type Result, type Sub } from '../engine/opportunity/engine';
import { plansFor, type Plan } from './localPrices';
import { convert } from '../engine/rates';
import { isUtility } from '../engine/score';

const VIDEO_QUALITY: Record<string, number> = { mobile: 480, basic: 720, basic_with_ads: 1080, standard: 1080, premium: 2160 };
const VIDEO = new Set(['netflix', 'disney+', 'hbo max', 'max', 'paramount+']);
const STORAGE = /^(icloud|google one)/;

function storageGb(name: string): number | undefined {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/i);
  if (!m) return undefined;
  return Number(m[1]) * (m[2]!.toUpperCase() === 'TB' ? 1000 : 1);
}

/** One researched plan as the engine sees it: price in the display currency, features, sharing rules. */
function toEnginePlan(service: string, p: Plan & { ads?: boolean; source?: string }, currency: string, checked: string | null): EnginePlan | undefined {
  const monthly = p.currency === currency ? p.monthly : convert(p.monthly, p.currency, currency);
  if (monthly === undefined) return undefined;
  const t = p.type;
  const features: EnginePlan['features'] = {};
  if (VIDEO.has(service)) {
    features.streams = p.people ?? (t === 'premium' ? 4 : t === 'basic' || t === 'mobile' ? 1 : 2);
    features.quality = VIDEO_QUALITY[t] ?? 1080;
    features.ads = !!p.ads || t === 'basic_with_ads';
  } else if (p.ads) features.ads = true;
  const gb = STORAGE.test(service) ? storageGb(p.name) : undefined;
  if (gb) features.storageGb = gb;
  const shared = t === 'duo' || t === 'family' || t === 'platinum';
  return {
    service,
    plan: p.name,
    monthly: Math.round(monthly * 100) / 100,
    billing: ['monthly'],
    features,
    accounts: gb ? 6 : shared ? (p.people ?? (t === 'duo' ? 2 : 6)) : 1,
    sameAddress: shared && service !== 'microsoft 365',
    ...(t === 'student' ? { requires: 'student' as const } : gb ? { requires: 'family' as const } : {}),
    source: p.source ?? 'researched price list',
    ...(checked ? { checked } : {}),
  };
}

/** The last day of a 'YYYY-MM' month. */
function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** Map an item to the engine's subscription, from what the person told us. */
export function toSub(i: Item, overlapLosers: Set<string>): Sub {
  const monthly = i.frequency === 'yearly' ? i.price / 12 : i.frequency === 'weekly' ? (i.price * 52) / 12 : i.frequency === 'quarterly' ? i.price / 3 : i.price;
  const canLiveWithout = i.usage === 'almostNever' || (i.usage === 'sometimes' && i.wouldMiss === false)
    || (i.category === 'membership' && i.visitsPerMonth === 0) || overlapLosers.has(i.id);
  const keeps = i.usage === 'always' || (i.usage === 'sometimes' && i.wouldMiss === true) || (i.category === 'membership' && (i.visitsPerMonth ?? 0) > 0);
  // A contract runs to its last month. A yearly plan renews once in any 12 months,
  // so cancelling before that renewal frees one full year in the next 12 months.
  const lockedUntil = i.category === 'membership' && i.contract === 'contract' && i.contractEnds ? monthEnd(i.contractEnds) : undefined;
  return {
    id: i.id,
    name: i.name,
    ...(i.merchantKey ? { service: i.merchantKey === 'max' ? 'hbo max' : i.merchantKey } : {}),
    ...(i.planName ? { plan: i.planName } : {}),
    monthly: Math.round(monthly * 100) / 100,
    priceSource: i.source === 'statement' ? 'statement' : 'typed',
    ...(i.nextCharge && i.frequency !== 'yearly' ? { nextCharge: i.nextCharge.slice(0, 10) } : {}),
    ...(lockedUntil ? { lockedUntil } : {}),
    fixedBill: i.category === 'bill' || isUtility(i),
    importance: canLiveWithout ? 'canLiveWithout' : keeps ? 'wouldMiss' : 'unknown',
    rotatable: i.overlapGroup === 'video' && i.usage === 'sometimes' && i.wouldMiss === true && i.frequency === 'monthly',
    needs: {
      ...(i.watchAtOnce !== undefined ? { viewersAtOnce: i.watchAtOnce } : {}),
      ...(i.needs4K !== undefined ? { needs4K: i.needs4K } : {}),
      ...(i.minQuality !== undefined ? { minQuality: i.minQuality } : {}),
      ...(i.adsOk !== undefined ? { adsOk: i.adsOk } : {}),
      ...(i.storageUsedGb !== undefined ? { storageUsedGb: i.storageUsedGb } : {}),
    },
    // Someone at home pays for their own account. We don't know their price, so we
    // assume the same plan and say so in the text.
    ...(i.householdOwn ? { household: [{ id: `${i.id}:home`, monthly: Math.round(monthly * 100) / 100, sameAddress: true }] } : {}),
    ...(i.category === 'membership' && typeof i.visitsPerMonth === 'number'
      ? { membership: { visitsPerMonth: i.visitsPerMonth, ...(i.singleVisitPrice && i.singleVisitPrice > 0 ? { singleVisit: i.singleVisitPrice } : {}) } }
      : {}),
  };
}

/** Everything the engine needs, built from verified plans for the services the person has. */
export function opportunitiesFor(items: Item[], country: string, currency: string, today: string, overlapLosers: Set<string>): Result {
  const plans: EnginePlan[] = [];
  let verified = '';
  const services = new Set(items.map((i) => (i.merchantKey === 'max' ? 'hbo max' : i.merchantKey)).filter((k): k is string => !!k));
  for (const service of services) {
    const cp = plansFor(service, country) ?? (service === 'hbo max' ? plansFor('max', country) : undefined);
    if (!cp) continue;
    if (cp.checked && cp.checked > verified) verified = cp.checked;
    for (const p of cp.plans) {
      const ep = toEnginePlan(service, p as Plan & { ads?: boolean; source?: string }, currency, cp.checked);
      if (ep) plans.push(ep);
    }
  }
  const market: Market = { market: country, currency, verified: verified || today, plans };
  return runOpportunities(items.map((i) => toSub(i, overlapLosers)), market, today);
}
