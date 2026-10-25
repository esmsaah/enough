// Enough — hidden costs (section 7). Money the person loses without a plan to
// cancel: card FX fees, monthly bank fees, delivery/taxi habits, cash payments,
// and a pile of tiny subscriptions. These are SHOWN to inform, but NEVER added
// to "money found" — only the cut/overlap/rotate/yearly/refund actions are.

import type { HiddenCost, Item, Profile } from './types';

/** €5 is the "small subscription" line; converted by the caller already. */
const SMALL_SUB_EUR = 5;
/** Paying this much over the typical price is worth a second look. */
const PRICE_OVER_CATALOG = 1.25;

const YEARLY: Record<Item['frequency'], number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1, oneTime: 0 };
function monthly(item: Pick<Item, 'price' | 'frequency'>): number {
  return round2((item.price * YEARLY[item.frequency]) / 12);
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** How often a habit happens, per year. */
const HABIT_PER_YEAR: Record<'weekly' | 'sometimes' | 'never', number> = { weekly: 52, sometimes: 12, never: 0 };

export type HiddenCostInput = {
  currency: string;
  /** Scored subscriptions, used for the small-subs pile and price-above-catalog. */
  subscriptions: Item[];
  profile?: Profile;
  /** Non-local card spend over a year, in display currency (from statement or answers). */
  foreignSpendYearly?: number;
  /** Exact yearly FX fee read from the statement, in display currency. Overrides the estimate. */
  statementFxFeeYearly?: number;
  /** Exact yearly bank fee read from the statement, in display currency. Overrides the answer. */
  statementBankFeeYearly?: number;
  /** €5 threshold already converted to display currency; defaults to a rough conversion. */
  smallSubThreshold?: number;
};

/**
 * Build the list of hidden costs. Each is advice with an optional yearly figure;
 * the caller shows them but never counts them as savings.
 */
export function computeHiddenCosts(input: HiddenCostInput): HiddenCost[] {
  const { currency, subscriptions, profile } = input;
  const out: HiddenCost[] = [];
  const base = { currency, itemId: undefined as string | undefined };

  // --- Foreign-currency card fee ---
  if (typeof input.statementFxFeeYearly === 'number' && input.statementFxFeeYearly > 0) {
    out.push({ ...base, kind: 'fx', label: 'Foreign-currency fees', yearly: round2(input.statementFxFeeYearly), estimate: false, note: 'Your statement shows this much in foreign-currency fees over the year.' });
  } else if (profile?.foreignCurrency && profile.foreignCurrency !== 'never' && typeof input.foreignSpendYearly === 'number' && input.foreignSpendYearly > 0) {
    const rate = profile.foreignCurrency === 'often' ? 0.03 : 0.015;
    out.push({ ...base, kind: 'fx', label: 'Foreign-currency fees', yearly: round2(input.foreignSpendYearly * rate), estimate: true, note: `Spending in other currencies ${profile.foreignCurrency} costs roughly ${(rate * 100).toFixed(1)}% in card fees.` });
  }

  // --- Monthly bank/account fee ---
  if (typeof input.statementBankFeeYearly === 'number' && input.statementBankFeeYearly > 0) {
    out.push({ ...base, kind: 'bankFee', label: 'Bank account fees', yearly: round2(input.statementBankFeeYearly), estimate: false, note: 'Your statement shows this much in account fees over the year.' });
  } else if (profile?.bankFeeMonthly === 'unknown') {
    out.push({ ...base, kind: 'bankFee', label: 'Bank account fee', estimate: true, note: 'Check whether your bank charges a monthly account fee — a free account may cover you.' });
  } else if (typeof profile?.bankFeeMonthly === 'number' && profile.bankFeeMonthly > 0) {
    out.push({ ...base, kind: 'bankFee', label: 'Bank account fee', yearly: round2(profile.bankFeeMonthly * 12), estimate: true, note: 'A monthly account fee — many banks offer a free account.' });
  }

  // --- Delivery / taxi habits ---
  for (const [kind, label] of [['delivery', 'Food delivery'], ['taxi', 'Taxis & ride-hailing']] as const) {
    const h = profile?.[kind];
    if (!h || h.frequency === 'never') continue;
    const perYear = HABIT_PER_YEAR[h.frequency];
    if (typeof h.typicalAmount === 'number' && h.typicalAmount > 0) {
      out.push({ ...base, kind: 'habit', label, yearly: round2(h.typicalAmount * perYear), estimate: true, note: `About ${label.toLowerCase()} ${h.frequency} adds up over a year.` });
    } else {
      out.push({ ...base, kind: 'habit', label, estimate: true, note: `You mentioned ${label.toLowerCase()} ${h.frequency} — worth a rough total.` });
    }
  }

  // --- Cash items the statement can't see ---
  if (profile?.cashItems && profile.cashItems.length > 0) {
    const yearly = round2(profile.cashItems.reduce((s, c) => s + c.monthly * 12, 0));
    if (yearly > 0) {
      const names = profile.cashItems.map((c) => c.label).join(', ');
      out.push({ ...base, kind: 'cash', label: 'Paid in cash', yearly, estimate: true, note: `Cash payments your statement never sees: ${names}.` });
    }
  }

  // --- A pile of tiny subscriptions ---
  const threshold = input.smallSubThreshold ?? SMALL_SUB_EUR;
  const small = subscriptions.filter((i) => monthly(i) > 0 && monthly(i) < threshold);
  if (small.length >= 2) {
    const yearly = round2(small.reduce((s, i) => s + monthly(i) * 12, 0));
    out.push({ ...base, kind: 'smallSubs', label: 'Small subscriptions', yearly, estimate: small.some((i) => i.estimate), note: `${small.length} subscriptions under ${formatCur(threshold, currency)} each add up to ${formatCur(yearly, currency)} a year.` });
  }

  // --- Paying more than the typical catalog price ---
  for (const item of subscriptions) {
    if (typeof item.catalogPrice !== 'number' || item.catalogPrice <= 0) continue;
    const m = monthly(item);
    if (m > item.catalogPrice * PRICE_OVER_CATALOG) {
      out.push({ currency, kind: 'priceAboveCatalog', label: item.name, yearly: round2((m - item.catalogPrice) * 12), estimate: item.estimate, itemId: item.id, note: `You pay more than the typical ${formatCur(item.catalogPrice, currency)}/mo — check you're on the right plan.` });
    }
  }

  return out;
}

function formatCur(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${round2(n)} ${currency}`;
  }
}
