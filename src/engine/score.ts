// Enough — scoring engine. Section 7 of ENOUGH_BRIEF.md.
//
// Each item gets EXACTLY ONE action, chosen by the first rule that matches, in
// the order below. Savings are never double counted. "keep" always saves 0.
//
// Some rules compare items to each other (duplicates, overlap groups, video
// rotate), so scoring takes the whole item list, precomputes those
// relationships once, then decides each item against the ordered rules.

import { cheapestCloudPlan } from './cloudPlans';
import { computeHiddenCosts } from './hidden';
import { convert } from './rates';
import { buildReminders } from './reminders';
import type {
  ActionType,
  Audit,
  Item,
  OverlapGroup,
  Profile,
  Recommendation,
  SpendingCategory,
  StreamingRotationPlan,
  Verdict,
} from './types';

/** An amount is "exact" only when it came straight from the statement. */
export function isExactAmount(item: Pick<Item, 'source' | 'estimate'>): boolean {
  return item.source === 'statement' && !item.estimate;
}

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

type CloudConsolidation = { winnerId: string; saving: number; planName: string; memberIds: Set<string> };

type Context = {
  /** id of the item kept in each duplicate group; every other member is an extra */
  duplicateExtras: Set<string>;
  /** for a member being cut for overlap: the name of the item kept in its group */
  overlapKeptName: Map<string, string>;
  overlapLosers: Set<string>;
  /** cloud items that collapse into one cheaper plan (§7 cloud overlap) */
  cloudConsolidation?: CloudConsolidation;
  /** AI assistants used for the same thing → "one could do both" (never cut) */
  aiSameUses: Set<string>;
  byId: Map<string, Item>;
};

function buildContext(items: Item[]): Context {
  const byId = new Map(items.map((i) => [i.id, i]));
  const duplicateExtras = new Set<string>();
  const overlapKeptName = new Map<string, string>();
  const overlapLosers = new Set<string>();
  const aiSameUses = new Set<string>();

  // --- Duplicates: the same service charged more than once (rule 2). ---
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
    const primary = [...group].sort((a, b) => usageRank(b) - usageRank(a))[0]!;
    for (const item of group) {
      if (item.id !== primary.id) duplicateExtras.add(item.id);
    }
  }

  // --- Music overlap: keep the preferred (or most used), cut the other. ---
  addGenericOverlap(items, 'music', duplicateExtras, overlapLosers, overlapKeptName);

  // --- Cloud overlap: consolidate into one cheaper plan when we know storage;
  //     otherwise fall back to the same keep-most-used-cut-other rule. ---
  const cloudMembers = items.filter((i) => i.overlapGroup === 'cloud' && !duplicateExtras.has(i.id));
  let cloudConsolidation: CloudConsolidation | undefined;
  if (cloudMembers.length >= 2 && cloudMembers.every((i) => typeof i.storageUsedGb === 'number')) {
    const combinedStorage = cloudMembers.reduce((s, i) => s + (i.storageUsedGb ?? 0), 0);
    const currentMonthly = cloudMembers.reduce((s, i) => s + monthlyEquivalent(i), 0);
    const plan = cheapestCloudPlan(combinedStorage, cloudMembers[0]!.currency);
    if (plan && plan.monthly < currentMonthly) {
      const winner = [...cloudMembers].sort((a, b) => yearlyCost(b) - yearlyCost(a))[0]!;
      cloudConsolidation = {
        winnerId: winner.id,
        saving: round2((currentMonthly - plan.monthly) * 12),
        planName: plan.name,
        memberIds: new Set(cloudMembers.map((i) => i.id)),
      };
    }
  }
  if (!cloudConsolidation) {
    addGenericOverlap(items, 'cloud', duplicateExtras, overlapLosers, overlapKeptName);
  }

  // --- AI overlap: never auto-cut. If two assistants are used for the same
  //     thing, flag "one could do both" (look again, no money claimed). ---
  const aiMembers = items.filter((i) => i.overlapGroup === 'ai' && !duplicateExtras.has(i.id));
  if (aiMembers.length >= 2) {
    const byUse = new Map<string, string[]>();
    for (const m of aiMembers) for (const use of m.uses ?? []) byUse.set(use, [...(byUse.get(use) ?? []), m.id]);
    for (const sharers of byUse.values()) {
      if (sharers.length >= 2) for (const id of sharers) aiSameUses.add(id);
    }
  }

  return { duplicateExtras, overlapKeptName, overlapLosers, aiSameUses, byId, ...(cloudConsolidation ? { cloudConsolidation } : {}) };
}

/** Keep the preferred (or most used) member of an overlap group, mark the rest losers. */
function addGenericOverlap(
  items: Item[],
  group: OverlapGroup,
  duplicateExtras: Set<string>,
  overlapLosers: Set<string>,
  overlapKeptName: Map<string, string>,
): void {
  const members = items.filter((i) => i.overlapGroup === group && !duplicateExtras.has(i.id));
  if (members.length < 2) return;
  // Honour the person's overlap answer: a specific item id to keep, or 'same'.
  const pref = members.map((m) => m.preferredInOverlap).find((p) => p !== undefined);
  if (pref === 'same') return; // "I'd miss both the same" → look again, cut nothing here
  const kept = (pref && members.find((m) => m.id === pref)) || pickKept(members);
  for (const m of members) {
    if (m.id === kept.id) continue;
    overlapLosers.add(m.id);
    overlapKeptName.set(m.id, kept.name);
  }
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

  // Rule 3a — cloud overlap: collapse two cloud plans into one cheaper plan.
  if (ctx.cloudConsolidation) {
    const c = ctx.cloudConsolidation;
    if (item.id === c.winnerId) {
      return rec('removeOverlap', c.saving, `One ${c.planName} covers both — cheaper than paying for two.`);
    }
    if (c.memberIds.has(item.id)) {
      return rec('keep', 0, 'Covered by the single cloud plan you’d switch to.');
    }
  }

  // Rule 3b — AI assistants used for the same thing: one could do both. Never cut.
  if (ctx.aiSameUses.has(item.id)) {
    return rec('removeOverlap', 0, 'You use them for the same things — one could do both.');
  }

  // Rule 3c — music / cloud-fallback overlap. Keep the preferred/most used, drop the rest.
  if (ctx.overlapLosers.has(item.id)) {
    const keptName = ctx.overlapKeptName.get(item.id) ?? 'another service';
    return rec('removeOverlap', yc, `Overlaps with ${keptName}, which you use more.`);
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
  opts: {
    unlocked?: boolean;
    createdAt?: string;
    displayCurrency?: string;
    spendingByCategory?: Partial<Record<SpendingCategory, number>>;
    spendingCurrency?: string;
    pinnedVideoItemIds?: string[];
    profile?: Profile;
    /** Non-local card spend over a year, in the spending currency. */
    foreignSpendYearly?: number;
    /** Exact yearly FX fee read from the statement, in the spending currency. */
    statementFxFeeYearly?: number;
    /** Exact yearly bank fee read from the statement, in the spending currency. */
    statementBankFeeYearly?: number;
  } = {},
): Audit {
  const currency = opts.displayCurrency ?? mostCommonCurrency(items) ?? 'EUR';
  const convertedItems = items.map((item) => {
    if (item.currency.toUpperCase() === currency.toUpperCase()) return { ...item, currency };
    const price = convert(item.price, item.currency, currency);
    return price === undefined
      ? { ...item, currency }
      : {
        ...item,
        price,
        currency,
        approxConverted: true,
        ...(item.priceIncrease ? {
          priceIncrease: {
            from: convert(item.priceIncrease.from, item.currency, currency) ?? item.priceIncrease.from,
            to: convert(item.priceIncrease.to, item.currency, currency) ?? item.priceIncrease.to,
            yearlyIncrease: convert(item.priceIncrease.yearlyIncrease, item.currency, currency) ?? item.priceIncrease.yearlyIncrease,
          },
        } : {}),
      };
  });
  const subscriptions = convertedItems.filter((item) => (item.category === 'digital' || item.category === 'membership') && item.billingModel !== 'usage' && item.billingModel !== 'oneTime' && item.frequency !== 'oneTime');
  const bills = convertedItems.filter((item) => item.category === 'bill');
  const habits = convertedItems.filter((item) => !subscriptions.includes(item) && !bills.includes(item));
  const ctx = buildContext(subscriptions);
  const recommendations = subscriptions.map((i) => scoreItem(i, ctx));

  const yearlyTotal = round2(subscriptions.reduce((s, i) => s + yearlyCost(i), 0));
  const exactYearlyTotal = round2(subscriptions.filter(isExactAmount).reduce((s, i) => s + yearlyCost(i), 0));
  const estimateYearlyTotal = round2(yearlyTotal - exactYearlyTotal);
  const billYearlyTotal = round2(bills.reduce((s, i) => s + yearlyCost(i), 0));
  const habitYearlyTotal = round2(habits.reduce((s, i) => s + yearlyCost(i), 0));
  const cutVideoIds = new Set(recommendations.filter((rec) => rec.verdict === 'cut').map((rec) => rec.itemId));
  const rotationPlan = buildStreamingRotationPlan(subscriptions.filter((item) => !cutVideoIds.has(item.id)), currency, opts.pinnedVideoItemIds ?? [], opts.createdAt);
  const videoIds = new Set(subscriptions.filter((item) => item.overlapGroup === 'video').map((item) => item.id));
  const videoSavings = recommendations.filter((rec) => videoIds.has(rec.itemId)).reduce((sum, rec) => sum + rec.potentialYearlySaving, 0);
  const otherSavings = recommendations.filter((rec) => !videoIds.has(rec.itemId)).reduce((sum, rec) => sum + rec.potentialYearlySaving, 0);
  const potentialYearlySaving = round2(otherSavings + Math.max(videoSavings, rotationPlan?.yearlySaving ?? 0));
  const spendCategories: SpendingCategory[] = ['Groceries', 'Shopping', 'Cafes & eating out', 'Transport', 'Travel', 'Delivery'];
  const spendingByCategory = Object.fromEntries(spendCategories.map((category) => {
    const raw = opts.spendingByCategory?.[category] ?? 0;
    const converted = opts.spendingCurrency && opts.spendingCurrency !== currency
      ? convert(raw, opts.spendingCurrency, currency) ?? raw
      : raw;
    return [category, round2(converted)];
  })) as Record<SpendingCategory, number>;

  const hasActionable = recommendations.some((r) => r.verdict !== 'keep') || (rotationPlan?.yearlySaving ?? 0) > videoSavings;
  const paywall = hasActionable && potentialYearlySaving >= paywallThreshold(currency);

  // Hidden costs and reminders: shown to inform, never added to money found.
  const toDisplay = (n?: number): number | undefined =>
    n === undefined ? undefined
      : opts.spendingCurrency && opts.spendingCurrency !== currency ? (convert(n, opts.spendingCurrency, currency) ?? n)
      : n;
  const createdAt = opts.createdAt ?? new Date().toISOString().slice(0, 10);
  const hiddenCosts = computeHiddenCosts({
    currency,
    subscriptions,
    ...(opts.profile ? { profile: opts.profile } : {}),
    ...(toDisplay(opts.foreignSpendYearly) !== undefined ? { foreignSpendYearly: toDisplay(opts.foreignSpendYearly) } : {}),
    ...(toDisplay(opts.statementFxFeeYearly) !== undefined ? { statementFxFeeYearly: toDisplay(opts.statementFxFeeYearly) } : {}),
    ...(toDisplay(opts.statementBankFeeYearly) !== undefined ? { statementBankFeeYearly: toDisplay(opts.statementBankFeeYearly) } : {}),
    smallSubThreshold: convert(5, 'EUR', currency) ?? 5,
  });
  const hiddenCostYearlyTotal = round2(hiddenCosts.reduce((s, h) => s + (h.yearly ?? 0), 0));
  const reminders = buildReminders(subscriptions, opts.profile, createdAt);

  return {
    items: subscriptions,
    bills,
    billYearlyTotal,
    spendingByCategory,
    ...(rotationPlan ? { rotationPlan } : {}),
    habits,
    recommendations,
    yearlyTotal,
    exactYearlyTotal,
    estimateYearlyTotal,
    habitYearlyTotal,
    potentialYearlySaving,
    hiddenCosts,
    hiddenCostYearlyTotal,
    reminders,
    paywall,
    goodShape: !paywall,
    currency,
    unlocked: opts.unlocked ?? false,
    createdAt,
  };
}

export function buildStreamingRotationPlan(
  subscriptions: Item[],
  currency: string,
  pinnedIds: string[] = [],
  createdAt?: string,
): StreamingRotationPlan | undefined {
  const videoServices = subscriptions
    .filter((item) => item.overlapGroup === 'video' && item.billingModel !== 'usage' && item.billingModel !== 'oneTime')
    .sort((a, b) => a.name.localeCompare(b.name));
  if (videoServices.length < 2) return undefined;

  const requestedPins = new Set(pinnedIds);
  const pinned = videoServices.filter((service) => requestedPins.has(service.id));
  const rotating = videoServices.filter((service) => !requestedPins.has(service.id));
  const pinnedIdsInPlan = pinned.map((service) => service.id);
  const pinnedMonthly = pinned.reduce((sum, service) => sum + monthlyEquivalent(service), 0);
  const base = createdAt ?? new Date().toISOString().slice(0, 10);
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthStart = addMonths(base, index + 1);
    const reminderDate = new Date(Date.parse(`${monthStart}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
    const service = rotating.length ? rotating[index % rotating.length] : undefined;
    return {
      month: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthStart}T00:00:00Z`)),
      reminderDate,
      ...(service ? { activeServiceId: service.id, activeServiceName: service.name } : {}),
      monthlyCost: round2(pinnedMonthly + (service ? monthlyEquivalent(service) : 0)),
    };
  });
  const baselineYearlyCost = round2(videoServices.reduce((sum, service) => sum + yearlyCost(service), 0));
  const plannedYearlyCost = round2(months.reduce((sum, month) => sum + month.monthlyCost, 0));
  return {
    currency,
    services: videoServices.map((service) => ({
      id: service.id,
      name: service.name,
      pinned: requestedPins.has(service.id),
      monthlyEquivalent: monthlyEquivalent(service),
    })),
    months,
    pinnedServiceIds: pinnedIdsInPlan,
    baselineYearlyCost,
    plannedYearlyCost,
    newMonthlyCost: round2(plannedYearlyCost / 12),
    yearlySaving: round2(Math.max(0, baselineYearlyCost - plannedYearlyCost)),
    estimate: videoServices.some((service) => service.estimate || service.approxConverted || service.frequency !== 'monthly'),
  };
}

function addMonths(isoDate: string, months: number): string {
  const [year, month] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1 + months, 1)).toISOString().slice(0, 10);
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
