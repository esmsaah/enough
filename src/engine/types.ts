// Enough — engine data model. Section 5 of ENOUGH_BRIEF.md.
// This file is pure data: no UI, no browser APIs. It must stay unit-testable
// with plain objects.

/** Only these three fields survive import. Everything else is dropped. */
export type Transaction = {
  date: string; // ISO yyyy-mm-dd
  merchantRaw: string; // as printed, after redaction
  billingModelHint?: BillingModel; // derived enum from description/category; no raw bank metadata
  bankCategoryHint?: BankCategoryHint;
  amount: number; // positive = money out, in account currency
  currency: string; // ISO code, e.g. EUR
};

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'oneTime';
export type DetectedFrequency = Frequency | 'unknown';
export type BillingModel = 'monthly' | 'yearly' | 'usage' | 'oneTime';
export type BankCategoryHint = 'bill' | 'shopping' | 'eatingOut' | 'other';
export type SpendingCategory = 'Groceries' | 'Shopping' | 'Cafes & eating out' | 'Transport' | 'Travel' | 'Delivery';

export type StreamingRotationPlan = {
  currency: string;
  services: Array<{ id: string; name: string; pinned: boolean; monthlyEquivalent: number }>;
  months: Array<{ month: string; reminderDate: string; activeServiceId?: string; activeServiceName?: string; monthlyCost: number }>;
  pinnedServiceIds: string[];
  baselineYearlyCost: number;
  plannedYearlyCost: number;
  newMonthlyCost: number;
  yearlySaving: number;
  estimate: boolean;
};

/** Analysis type — how the engine reasons about an item. */
export type Category =
  | 'digital' // streaming, AI, cloud, apps
  | 'membership' // gym, clubs, courses, kids' activities
  | 'bill' // phone, internet, power, insurance
  | 'habit' // delivery, taxi, coffee
  | 'other';

/** The label the person sees. Groups results on screen. */
export type DisplayCategory =
  | 'Entertainment'
  | 'AI & Software'
  | 'Cloud & Storage'
  | 'News & Media'
  | 'Learning'
  | 'Fitness & Health'
  | 'Kids & Family'
  | 'Shopping & Delivery'
  | 'Bills & Utilities'
  | 'Transport'
  | 'Other';

export type Source = 'statement' | 'quickpick' | 'manual' | 'cash';

export type Usage = 'always' | 'sometimes' | 'almostNever';

/** What a person uses an AI assistant for (overlap rule, §7). */
export type AiUse = 'writing' | 'coding' | 'research' | 'images' | 'study' | 'workDocs';

export type Item = {
  id: string;
  name: string; // display name, e.g. "FitZone Gym"
  merchantKey?: string; // normalized merchant, e.g. "fit zone"
  category: Category; // analysis type
  displayCategory: DisplayCategory; // shown to the person, see section 7
  price: number; // per period
  frequency: Frequency;
  billingModel?: BillingModel;
  bankCategoryHint?: BankCategoryHint;
  confidence?: number; // 0–1 confidence in the inferred billing pattern
  charges?: number;
  extraPurchases?: { charges: number; total: number; label?: string };
  source: Source;
  estimate: boolean; // true for cash and manual guesses
  lastCharge?: string; // ISO date, from statement
  nextCharge?: string; // predicted
  usage?: Usage;
  wouldMiss?: boolean; // digital, only when usage === 'sometimes'
  visitsPerMonth?: number; // memberships only
  singleVisitPrice?: number; // memberships only, optional
  compareState?: 'thisYear' | 'overAYear' | 'never'; // bills: last offer comparison (rule 7)
  yearlyPrice?: number; // known cheaper yearly price from the merchant map (rule 8), in EUR
  redactNameOutbound?: boolean; // private transfers: hide the person's name from the server
  importance?: 1 | 2 | 3 | 4 | 5;
  overlapsWith?: string[]; // item ids
  overlapGroup?: OverlapGroup; // set by the engine when an overlap is detected
  preferredInOverlap?: string; // music/video overlap answer: the item id to keep, or 'same'
  storageUsedGb?: number; // cloud overlap: how much the person actually uses
  uses?: AiUse[]; // AI overlap: what the person uses this assistant for
  renewalMonth?: number; // 1–12, for a yearly plan: the month it renews (reminder)
  trialEndsOn?: string; // ISO date a free/intro trial turns into a paid charge (reminder)
  catalogPrice?: number; // typical monthly price from the catalog, in this item's currency (price-above-catalog warning)
  duplicateOf?: string; // set for a second charge of the same service
  flaggedForReminder?: boolean;
  done?: boolean; // person marked the action as done
  cancelUrl?: string; // known cancel page (merchant map) for "Cancel now"
  currency: string; // ISO code
  approxConverted?: boolean;
  possibleDuplicateCharge?: { amount: number; firstCharge: string; secondCharge: string };
  priceIncrease?: { from: number; to: number; yearlyIncrease: number };
};

export type ActionType =
  | 'keep'
  | 'cancel'
  | 'rotate'
  | 'switchYearly'
  | 'payPerVisit'
  | 'removeOverlap'
  | 'familyPlan'
  | 'compareOffers'
  | 'checkRefund';

export type Verdict = 'keep' | 'lookAgain' | 'cut';

export type Recommendation = {
  itemId: string;
  verdict: Verdict;
  action: ActionType;
  reason: string; // one plain sentence
  yearlyCost: number;
  currency?: string;
  potentialYearlySaving: number; // 0 for keep
  approx?: boolean; // saving relies on a converted (approximate) figure
};

/**
 * One-off profile answers (section 5). All optional. On the statement path,
 * foreignCurrency and bankFeeMonthly are computed from the statement and skipped.
 */
export type Profile = {
  foreignCurrency?: 'never' | 'sometimes' | 'often';
  bankFeeMonthly?: 0 | 2 | 5 | 'unknown';
  delivery?: { frequency: 'weekly' | 'sometimes' | 'never'; typicalAmount?: number };
  taxi?: { frequency: 'weekly' | 'sometimes' | 'never'; typicalAmount?: number };
  recentTrials?: Array<{ merchantKey: string; startDate: string }>;
  cashItems?: Array<{ label: string; monthly: number }>;
};

/** A cost worth knowing about but never counted as money found (section 7). */
export type HiddenCost = {
  kind: 'fx' | 'bankFee' | 'habit' | 'cash' | 'smallSubs' | 'priceAboveCatalog';
  label: string;
  yearly?: number; // in display currency; omitted when unknown (advice only)
  estimate: boolean;
  note: string; // one plain sentence
  itemId?: string; // set for item-specific advice (price above catalog)
  currency: string;
};

/** A date to remind the person about (section 7). Shown, never counted. */
export type Reminder = {
  kind: 'renewal' | 'trial';
  label: string;
  date: string; // ISO date the reminder should fire (before the charge)
  note: string;
  itemId?: string;
};

export type Audit = {
  /** Digital subscriptions and memberships; the only items scored for verdicts. */
  items: Item[];
  bills: Item[];
  billYearlyTotal: number;
  spendingByCategory: Record<SpendingCategory, number>;
  rotationPlan?: StreamingRotationPlan;
  habits: Item[];
  recommendations: Recommendation[];
  yearlyTotal: number;
  /** Of yearlyTotal, the part backed by exact statement amounts. */
  exactYearlyTotal: number;
  /** Of yearlyTotal, the part that rests on estimates (answers/catalog). */
  estimateYearlyTotal: number;
  habitYearlyTotal: number;
  potentialYearlySaving: number;
  hiddenCosts: HiddenCost[];
  hiddenCostYearlyTotal: number; // sum of known hidden costs; advice, never money found
  reminders: Reminder[];
  paywall: boolean; // section 7: shown only if a cut/lookAgain exists AND saving >= threshold
  goodShape: boolean; // nothing worth paying for
  currency: string; // display currency
  unlocked: boolean;
  createdAt: string;
};

/** Groups of services that do the same job. Section 7 rule 3. */
export type OverlapGroup = 'music' | 'cloud' | 'ai' | 'video';
