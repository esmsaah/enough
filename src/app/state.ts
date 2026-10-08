// Enough — manual-flow state. Sections 5 & 8 of ENOUGH_BRIEF.md.
// A small reducer over the engine's Item[]. The audit itself is derived by
// runAudit; this only holds the inputs and where the person is in the flow.

import type { BillingModel, Frequency, Item, Usage } from '../engine/types';
import { detect, type DetectionResult, type ImportMeta } from '../engine/detect';
import type { QuickPick } from './catalog';
import { convert } from '../engine/rates';

export type Step =
  | 'landing'
  | 'addstatement'
  | 'keep'
  | 'found'
  | 'quickstart'
  | 'anythingElse'
  | 'usage'
  | 'result'
  | 'goodShape'
  | 'cutlist'
  | 'emailShare';

export type State = {
  step: Step;
  items: Item[];
  unlocked: boolean;
  currency: string;
  statement?: DetectionResult;
  reportEmail: string;
  sendReport: boolean;
  enableReminders: boolean;
  newsConsent: boolean;
  rotationPinnedIds: string[];
  rotationRemindersEnabled: boolean;
  /** Names-only merchant research and the anonymous AI analyst. On by default. */
  aiRecognition: boolean;
  /** Country for the tap list, guessed on the device, changeable. */
  country?: string;
  /** Analyst notes by item id: one human sentence, never an amount. */
  analystNotes: Record<string, { reason?: string; moveTo?: 'subscription' | 'bill' | 'spending'; displayCategory?: Item['displayCategory'] }>;
};

export const initialState: State = {
  step: 'landing',
  items: [],
  unlocked: false,
  currency: 'EUR',
  reportEmail: '',
  sendReport: false,
  enableReminders: false,
  newsConsent: false,
  rotationPinnedIds: [],
  rotationRemindersEnabled: false,
  aiRecognition: true,
  analystNotes: {},
};

export type Action =
  | { type: 'goto'; step: Step }
  | { type: 'statementParsed'; result: DetectionResult }
  | { type: 'statementDateFormat'; result: DetectionResult }
  | { type: 'acceptStatement' }
  | { type: 'confirmPossible'; merchantKey: string; frequency: 'monthly' | 'yearly' | 'oneTime' }
  | { type: 'toggleQuickPick'; pick: QuickPick }
  | { type: 'addManual'; item: Omit<Item, 'id'> }
  | { type: 'removeItem'; id: string }
  | { type: 'setPrice'; id: string; price: number }
  | { type: 'setDisplayCategory'; id: string; displayCategory: Item['displayCategory'] }
  | { type: 'setClassification'; id: string; category: Item['category']; displayCategory: Item['displayCategory'] }
  | { type: 'setUsage'; id: string; usage: Usage }
  | { type: 'setWouldMiss'; id: string; wouldMiss: boolean }
  | { type: 'setVisits'; id: string; visits: number }
  | { type: 'setSingleVisit'; id: string; price: number }
  | { type: 'setCompareState'; id: string; compareState: Item['compareState'] }
  | { type: 'toggleReminder'; id: string }
  | { type: 'toggleDone'; id: string }
  | { type: 'setReportEmail'; email: string }
  | { type: 'setCurrency'; currency: string }
  | { type: 'setRotationPinned'; itemId: string; pinned: boolean }
  | { type: 'setRotationReminders'; enabled: boolean }
  | { type: 'setEmailConsent'; key: 'sendReport' | 'enableReminders' | 'newsConsent'; value: boolean }
  | { type: 'unlock' }
  | { type: 'reset' }
  | { type: 'setAiRecognition'; enabled: boolean }
  | { type: 'setCountry'; country: string }
  | { type: 'analystNotes'; notes: State['analystNotes'] }
  | { type: 'hydrate'; state: State };

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`;
}

function patch(items: Item[], id: string, fields: Partial<Item>): Item[] {
  return items.map((it) => (it.id === id ? { ...it, ...fields } : it));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'goto':
      return { ...state, step: action.step };

    case 'statementParsed': {
      const result = mergeStatementResults(state.statement, action.result);
      return { ...state, statement: result, currency: result.meta.displayCurrency, step: 'keep' };
    }

    case 'statementDateFormat':
      return { ...state, statement: action.result, currency: action.result.meta.displayCurrency, step: 'keep' };

    case 'acceptStatement': {
      const candidates = [...actionItems(state.statement)];
      // A re-run over more statements replaces earlier statement findings, so
      // an item reclassified by the new data (e.g. a shop) does not linger.
      const candidateKeys = new Set(candidates.map((item) => item.merchantKey));
      const items = state.items.filter((item) => item.source !== 'statement' || candidateKeys.has(item.merchantKey) || item.usage !== undefined);
      for (const item of candidates) {
        const index = items.findIndex((current) => item.merchantKey && current.merchantKey === item.merchantKey);
        if (index !== -1) {
          const existing = items[index]!;
          items[index] = { ...existing, ...item, id: existing.id, usage: existing.usage, wouldMiss: existing.wouldMiss };
        } else items.push(item);
      }
      return { ...state, items, step: 'found' };
    }

    case 'confirmPossible': {
      const found = state.statement?.possibleRecurring.find((candidate) => candidate.merchantKey === action.merchantKey);
      if (!found || state.items.some((item) => item.merchantKey === found.merchantKey)) return state;
      if (action.frequency !== 'monthly' && action.frequency !== 'yearly' && action.frequency !== 'oneTime') return state;
      const oneTime = action.frequency === 'oneTime';
      const billingModel: BillingModel = oneTime ? 'oneTime' : (found.billingModel ?? action.frequency);
      const frequency: Frequency = action.frequency;
      const nextCharge = oneTime ? undefined : addChargeDate(found.lastCharge, frequency);
      const item = detectedItemToInput(found, frequency);
      return {
        ...state,
        items: [...state.items, {
          id: newId(), ...item, frequency, billingModel,
          ...(oneTime ? { category: 'habit' as const, displayCategory: 'Other' as const } : {}),
          ...(nextCharge ? { nextCharge } : {}),
        }],
      };
    }

    case 'toggleQuickPick': {
      const existing = state.items.find(
        (i) => i.source === 'quickpick' && i.merchantKey === action.pick.merchantKey,
      );
      if (existing) return { ...state, items: state.items.filter((i) => i.id !== existing.id) };
      const item: Item = {
        id: newId(),
        name: action.pick.name,
        merchantKey: action.pick.merchantKey,
        category: action.pick.category,
        displayCategory: action.pick.displayCategory,
        price: convert(action.pick.price, action.pick.currency ?? 'EUR', state.currency) ?? action.pick.price,
        frequency: action.pick.frequency,
        source: 'quickpick',
        estimate: true,
        currency: state.currency,
        overlapGroup: action.pick.overlapGroup,
        cancelUrl: action.pick.cancelUrl,
        yearlyPrice: action.pick.yearlyPrice,
        billingModel: action.pick.billingModel, // 'usage' keeps utilities as fixed costs
      } as Item;
      return { ...state, items: [...state.items, item] };
    }

    case 'addManual':
      return { ...state, items: [...state.items, { ...action.item, id: newId() }] };

    case 'removeItem':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };

    case 'setPrice':
      return { ...state, items: patch(state.items, action.id, { price: action.price }) };
    case 'setDisplayCategory':
      return { ...state, items: patch(state.items, action.id, { displayCategory: action.displayCategory }) };
    case 'setClassification':
      return { ...state, items: patch(state.items, action.id, { category: action.category, displayCategory: action.displayCategory }) };
    case 'setUsage':
      return { ...state, items: patch(state.items, action.id, { usage: action.usage }) };
    case 'setWouldMiss':
      return { ...state, items: patch(state.items, action.id, { wouldMiss: action.wouldMiss }) };
    case 'setVisits':
      return { ...state, items: patch(state.items, action.id, { visitsPerMonth: action.visits }) };
    case 'setSingleVisit':
      return { ...state, items: patch(state.items, action.id, { singleVisitPrice: action.price }) };
    case 'setCompareState':
      return { ...state, items: patch(state.items, action.id, { compareState: action.compareState }) };
    case 'toggleReminder':
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, flaggedForReminder: !i.flaggedForReminder } : i)),
      };
    case 'toggleDone':
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, done: !i.done } : i)),
      };

    case 'setReportEmail':
      return { ...state, reportEmail: action.email };

    case 'setCurrency':
      return { ...state, currency: action.currency.toUpperCase() };

    case 'setRotationPinned':
      return {
        ...state,
        rotationPinnedIds: action.pinned
          ? [...new Set([...state.rotationPinnedIds, action.itemId])]
          : state.rotationPinnedIds.filter((id) => id !== action.itemId),
      };

    case 'setRotationReminders':
      return {
        ...state,
        rotationRemindersEnabled: action.enabled,
        ...(action.enabled ? { enableReminders: true } : {}),
      };

    case 'setEmailConsent':
      return { ...state, [action.key]: action.value };

    case 'unlock':
      return { ...state, unlocked: true, step: 'cutlist' };
    case 'setCountry':
      return { ...state, country: action.country };

    case 'setAiRecognition':
      return { ...state, aiRecognition: action.enabled };

    case 'analystNotes': {
      const items = state.items.map((item) => {
        const note = action.notes[item.id];
        if (!note?.moveTo && !note?.displayCategory) return item;
        if (note.moveTo === 'bill') return { ...item, category: 'bill' as const, displayCategory: 'Bills & Utilities' as const };
        if (note.moveTo === 'spending') return { ...item, category: 'habit' as const, displayCategory: note.displayCategory ?? item.displayCategory };
        if (note.moveTo === 'subscription' && (item.category === 'habit' || item.category === 'other')) return { ...item, category: 'digital' as const, displayCategory: note.displayCategory ?? item.displayCategory };
        return note.displayCategory ? { ...item, displayCategory: note.displayCategory } : item;
      });
      return { ...state, items, analystNotes: { ...state.analystNotes, ...action.notes } };
    }

    case 'reset':
      return { ...initialState };
    case 'hydrate':
      return { ...initialState, ...action.state };

    default:
      return state;
  }
}

function mergeStatementResults(previous: DetectionResult | undefined, added: DetectionResult): DetectionResult {
  // Always re-run detection here so merchants learned after parsing apply.
  if (!previous) return detect(added.transactions, added.meta);
  const unique = new Map<string, DetectionResult['transactions'][number]>();
  for (const row of [...previous.transactions, ...added.transactions]) {
    unique.set(`${row.date}\u0000${row.merchantRaw.trim().toLowerCase()}\u0000${row.amount}\u0000${row.currency}`, row);
  }
  const transactions = [...unique.values()];
  const currencyCounts = new Map<string, number>();
  for (const row of transactions) currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1);
  const dates = transactions.map((row) => row.date).sort();
  const mergedMeta: ImportMeta = {
    ...added.meta,
    displayCurrency: [...currencyCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? added.meta.displayCurrency,
    monthsSpan: dates.length < 2 ? 0 : Math.max(0, (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / 86_400_000 / 30),
    redactedCategories: [...new Set([...previous.meta.redactedCategories, ...added.meta.redactedCategories])],
    columnCount: Math.max(previous.meta.columnCount, added.meta.columnCount),
  };
  return detect(transactions, mergedMeta);
}

function actionItems(result?: DetectionResult): Item[] {
  if (!result) return [];
  return [...result.recurring, ...result.habits]
    .filter((found) => found.frequency !== 'unknown')
    .map((found) => ({ id: newId(), ...detectedItemToInput(found) }));
}

function addChargeDate(lastCharge: string, frequency: Frequency): string {
  const days: Record<Frequency, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365, oneTime: 0 };
  const date = new Date(Date.parse(lastCharge) + days[frequency] * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function detectedItemToInput(found: DetectionResult['possibleRecurring'][number], frequency?: Frequency): Omit<Item, 'id'> {
  return {
    name: found.name,
    merchantKey: found.merchantKey,
    category: found.category,
    displayCategory: found.displayCategory,
    overlapGroup: found.overlapGroup,
    billingModel: found.billingModel,
    confidence: found.confidence,
    charges: found.charges,
    extraPurchases: found.extraPurchases,
    bankCategoryHint: found.bankCategoryHint,
    possibleDuplicateCharge: found.possibleDuplicateCharge,
    priceIncrease: found.priceIncrease,
    price: found.price,
    frequency: frequency ?? (found.frequency === 'unknown' ? 'monthly' : found.frequency),
    source: 'statement',
    estimate: found.estimate,
    lastCharge: found.lastCharge,
    nextCharge: found.nextCharge,
    currency: found.currency,
    approxConverted: found.approxConverted,
    cancelUrl: found.cancelUrl,
  };
}

/** Items that need a usage/visits/compare question (screen 7). */
export function itemsNeedingUsage(items: Item[]): Item[] {
  return items.filter((i) => i.category === 'digital' || i.category === 'membership' || i.category === 'bill');
}
