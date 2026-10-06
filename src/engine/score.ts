// Enough — scoring engine. Section 7 of ENOUGH_BRIEF.md.
//
// Each item gets EXACTLY ONE action, chosen by the first rule that matches, in
// the order below. Savings are never double counted. "keep" always saves 0.
//
// Some rules compare items to each other (duplicates, overlap groups, video
// rotate), so scoring takes the whole item list, precomputes those
// relationships once, then decides each item against the ordered rules.

import { convert } from './rates';
import type {
  ActionType,
  Audit,
  Item,
  OverlapGroup,
  Recommendation,
  Verdict,
} from './types';

/** Minimum potential yearly saving to show a paywall, expressed in EUR. It is
 *  converted into the audit's display currency before comparison. */
export const PAYWALL_MIN_SAVING_EUR = 10;

/** The paywall threshold in a given display currency. */
export function paywallThreshold(currency: string): number {
  return convert(PAYWALL_MIN_SAVING_EUR, 'EUR', currency) ?? PAYWALL_MIN_SAVING_EUR;
}

const YEARLY_MULTIPLIER: Record<Item['frequency'], number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  oneTime: 0,
};

export function yearlyCost(item: Pick<Item, 'price' | 'frequency'>): number {
  return round2(item.price * YEARLY_MULTIPLIER[item.frequency]);
}

export function monthlyEquivalent(item: Pick<Item, 'price' | 'frequency'>): number {
  return round2(yearlyCost(item) / 12);
}

/** always > sometimes > almostNever > unknown. Used to pick the kept item. */
function usageRank(item: Item): number {
  switch (item.usage) {
    case 'always':
      return 3;
    case 'sometimes':
      return 2;
    case 'almostNever':
      return 1;
    default:
      return 0;
  }
}

/** cancel and payPerVisit-with-a-number are cuts; the softer actions are look again. */
function verdictFor(action: ActionType, hasNumber: boolean): Verdict {
  if (action === 'keep') return 'keep';
  if (action === 'cancel') return 'cut';
  if (action === 'payPerVisit') return hasNumber ? 'cut' : 'lookAgain';
  return 'lookAgain';
}

type Context = {
  /** id of the item kept in each duplicate group; every other member is an extra */
  duplicateExtras: Set<string>;
  /** for a member being cut for overlap: the name of the item kept in its group */
  overlapKeptName: Map<string, string>;
  overlapLosers: Set<string>;
  /** video items to pause (rule 4) mapped to the name kept */
  rotateLosers: Set<string>;
  byId: Map<string, Item>;
};

/** Groups rule 3 acts on. Video is handled separately by rule 4. */
const RULE3_GROUPS: OverlapGroup[] = ['music', 'cloud', 'ai'];

function buildContext(items: Item[]): Context {
  const byId = new Map(items.map((i) => [i.id, i]));
  const duplicateExtras = new Set<string>();
  const overlapKeptName = new Map<string, string>();
  const overlapLosers = new Set<string>();
  const rotateLosers = new Set<string>();

  // --- Duplicates: the same service charged more than once (rule 2). ---
  // Group by merchantKey (fall back to lowercased name). The first occurrence
  // is the primary; every later one is an extra flagged for a family plan.
  // Only known merchants (a merchantKey) can be "the same service charged
  // twice". Manual/cash items with generic names never dup-group.
  const dupGroups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.merchantKey?.trim();
    if (!key) continue;
    const arr = dupGroups.get(key);
    if (arr) arr.push(item);
    else dupGroups.set(key, [item]);
  }
  for (const group of dupGroups.values()) {
    if (group.length < 2) continue;
    // Keep the most used; ties keep the first in list order (deterministic).
    const primary = [...group].sort((a, b) => usageRank(b) - usageRank(a))[0]!;
    for (const item of group) {
      if (item.id !== primary.id) duplicateExtras.add(item.id);
    }
  }

  // --- Overlap groups music/cloud/ai (rule 3). ---
  for (const grp of RULE3_GROUPS) {
    const members = items.filter(
      (i) => i.overlapGroup === grp && !duplicateExtras.has(i.id),
    );
    if (members.length < 2) continue;
    const kept = pickKept(members);
    for (const m of members) {
      if (m.id === kept.id) continue;
      overlapLosers.add(m.id);
      overlapKeptName.set(m.id, kept.name);
    }
  }

  // --- Video: 2+ services used "sometimes" → keep one, pause the rest (rule 4). ---
  const videoSometimes = items.filter(
    (i) =>
      i.overlapGroup === 'video' &&
      i.usage === 'sometimes' &&
      !duplicateExtras.has(i.id),
  );
  if (videoSometimes.length >= 2) {
    const kept = pickKept(videoSometimes);
    for (const m of videoSometimes) {
      if (m.id !== kept.id) rotateLosers.add(m.id);
    }
  }

  return { duplicateExtras, overlapKeptName, overlapLosers, rotateLosers, byId };
}

/** Most used wins; ties go to the cheaper one (by yearly cost). */
function pickKept(members: Item[]): Item {
  return [...members].sort((a, b) => {
    const r = usageRank(b) - usageRank(a);
    if (r !== 0) return r;
    return yearlyCost(a) - yearlyCost(b);
  })[0]!;
}

function fmt(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${round2(n)} ${currency}`;
  }
}

/** Decide the single recommendation for one item, given cross-item context. */
export function scoreItem(item: Item, ctx: Context): Recommendation {
  const yc = yearlyCost(item);
  if (item.billingModel === 'usage' || item.billingModel === 'oneTime' || item.frequency === 'oneTime') {
    return { itemId: item.id, verdict: 'keep', action: 'keep', reason: 'This is a one-time or pay-as-you-go cost, not a recurring plan.', yearlyCost: 0, potentialYearlySaving: 0 };
  }
  const currency = item.currency;
  if (item.possibleDuplicateCharge && item.possibleDuplicateCharge.amount > 0) {
    return {
      itemId: item.id,
      verdict: 'lookAgain',
      action: 'checkRefund',
      reason: 'Check for a refund of the duplicate charge.',
      yearlyCost: yc,
      potentialYearlySaving: item.possibleDuplicateCharge.amount,
      currency,
      ...(item.approxConverted ? { approx: true } : {}),
    };
  }
  const rec = (
    action: ActionType,
    saving: number,
    reason: string,
    approx = item.approxConverted ?? false,
  ): Recommendation => ({
    itemId: item.id,
    verdict: verdictFor(action, saving > 0),
    action,
    reason,
    yearlyCost: yc,
    currency,
    potentialYearlySaving: round2(Math.max(0, saving)),
    ...(approx ? { approx: true } : {}),
  });

  // Rule 1 — clearly not used → cancel. Saving = full yearly cost.
  if (item.usage === 'almostNever') {
    return rec('cancel', yc, 'You said you almost never use it.');
  }
  if (item.category === 'membership' && item.visitsPerMonth === 0) {
    return rec('cancel', yc, "You said you don't go anymore.");
  }
  if (item.category === 'digital' && item.usage === 'sometimes' && item.wouldMiss === false) {
    return rec('cancel', yc, "You use it sometimes and said you wouldn't miss it.");
  }

  // Rule 2 — the same service charged twice → look again, family plan.
  if (ctx.duplicateExtras.has(item.id)) {
    return rec('familyPlan', yc, 'Charged twice — one plan or a family plan is cheaper.');
  }

  // Rule 3 — overlap groups (music, cloud, AI). Keep the most used, drop the rest.
  if (ctx.overlapLosers.has(item.id)) {
    const keptName = ctx.overlapKeptName.get(item.id) ?? 'another service';
    return rec('removeOverlap', yc, `Overlaps with ${keptName}, which you use more.`);
  }

  // Rule 4 — two+ video services watched only sometimes → pause part of the year.
  if (ctx.rotateLosers.has(item.id)) {
    const saving = round2(item.price * 4); // monthly price × 4 months paused
    return rec('rotate', saving, 'You watch it only sometimes — pause it for four months a year.');
  }

  // Rules 5 & 6 — memberships priced against per-visit cost.
  if (item.category === 'membership' && typeof item.visitsPerMonth === 'number') {
    const monthly = monthlyEquivalent(item);
    const visits = item.visitsPerMonth;
    if (typeof item.singleVisitPrice === 'number') {
      const payGo = item.singleVisitPrice * visits;
      if (payGo < monthly) {
        const saving = round2((monthly - payGo) * 12);
        return rec(
          'payPerVisit',
          saving,
          `${visits} ${visits === 1 ? 'visit' : 'visits'} a month at ${fmt(item.singleVisitPrice, currency)} each is cheaper than the plan.`,
        );
      }
    } else if (visits > 0 && visits <= 4) {
      // No single price given → we won't invent a number. Saving = 0.
      const perVisit = round2(monthly / visits);
      return rec(
        'payPerVisit',
        0,
        `${visits} ${visits === 1 ? 'visit' : 'visits'} a month, ${fmt(perVisit, currency)} each — ask about a per-visit price.`,
      );
    }
  }

  // Rule 7 — bills the person hasn't compared in a while.
  if (item.category === 'bill' && (item.compareState === 'overAYear' || item.compareState === 'never')) {
    return rec('compareOffers', 0, "You haven't compared offers in over a year.");
  }

  // Rule 8 — heavily used monthly digital with a known cheaper yearly price.
  if (
    item.category === 'digital' &&
    item.usage === 'always' &&
    item.frequency === 'monthly' &&
    typeof item.yearlyPrice === 'number'
  ) {
    // The merchant map stores the yearly price in EUR — convert to this item's
    // currency before comparing, and mark the saving approximate if converted.
    const isEur = currency.toUpperCase() === 'EUR';
    const yearlyInCur = isEur ? item.yearlyPrice : convert(item.yearlyPrice, 'EUR', currency);
    if (yearlyInCur !== undefined) {
      const saving = round2(item.price * 12 - yearlyInCur);
      if (saving > 0) {
        return rec(
          'switchYearly',
          saving,
          isEur
            ? 'Paying yearly is cheaper than paying monthly.'
            : 'Paying yearly is cheaper than paying monthly (approx.).',
          !isEur || item.approxConverted === true,
        );
      }
    }
  }

  // Rule 9 — everything else earns its place.
  return rec('keep', 0, "You use this. It's earning its place.");
}

export function runAudit(
  items: Item[],
  opts: { unlocked?: boolean; createdAt?: string; displayCurrency?: string } = {},
): Audit {
  const currency = opts.displayCurrency ?? mostCommonCurrency(items) ?? 'EUR';
  const convertedItems = items.map((item) => {
    if (item.currency.toUpperCase() === currency.toUpperCase()) return { ...item, currency };
    const price = convert(item.price, item.currency, currency);
    return price === undefined
      ? { ...item, currency }
      : { ...item, price, currency, approxConverted: true };
  });
  const habits = convertedItems.filter((item) => item.category === 'habit' || item.billingModel === 'usage' || item.billingModel === 'oneTime' || item.frequency === 'oneTime');
  const recurringItems = convertedItems.filter((item) => !habits.includes(item));
  const ctx = buildContext(recurringItems);
  const recommendations = recurringItems.map((i) => scoreItem(i, ctx));

  const yearlyTotal = round2(recurringItems.reduce((s, i) => s + yearlyCost(i), 0));
  const habitYearlyTotal = round2(habits.reduce((s, i) => s + yearlyCost(i), 0));
  const potentialYearlySaving = round2(
    recommendations.reduce((s, r) => s + r.potentialYearlySaving, 0),
  );

  const hasActionable = recommendations.some((r) => r.verdict !== 'keep');
  const paywall = hasActionable && potentialYearlySaving >= paywallThreshold(currency);

  return {
    items: recurringItems,
    habits,
    recommendations,
    yearlyTotal,
    habitYearlyTotal,
    potentialYearlySaving,
    paywall,
    goodShape: !paywall,
    currency,
    unlocked: opts.unlocked ?? false,
    createdAt: opts.createdAt ?? new Date().toISOString().slice(0, 10),
  };
}

function mostCommonCurrency(items: Item[]): string | undefined {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.currency, (counts.get(i.currency) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [cur, n] of counts) {
    if (n > bestN) {
      best = cur;
      bestN = n;
    }
  }
  return best;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
