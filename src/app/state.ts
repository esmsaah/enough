// Enough — manual-flow state. Sections 5 & 8 of ENOUGH_BRIEF.md.
// A small reducer over the engine's Item[]. The audit itself is derived by
// runAudit; this only holds the inputs and where the person is in the flow.

import type { Item, Usage } from '../engine/types';
import type { DetectionResult } from '../engine/detect';
import type { QuickPick } from './catalog';

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
  | 'cutlist';

export type State = {
  step: Step;
  items: Item[];
  unlocked: boolean;
  currency: string;
  statement?: DetectionResult;
};

export const initialState: State = {
  step: 'landing',
  items: [],
  unlocked: false,
  currency: 'EUR',
};

export type Action =
  | { type: 'goto'; step: Step }
  | { type: 'statementParsed'; result: DetectionResult }
  | { type: 'statementDateFormat'; result: DetectionResult }
  | { type: 'acceptStatement' }
  | { type: 'confirmPossible'; merchantKey: string }
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
  | { type: 'unlock' }
  | { type: 'reset' }
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

    case 'statementParsed':
    case 'statementDateFormat':
      return { ...state, statement: action.result, currency: action.result.meta.displayCurrency, step: 'keep' };

    case 'acceptStatement': {
      const candidates = [...actionItems(state.statement)];
      const items = [...state.items];
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
      return { ...state, items: [...state.items, { id: newId(), ...detectedItemToInput(found) }] };
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
        price: action.pick.price,
        frequency: action.pick.frequency,
        source: 'quickpick',
        estimate: true,
        currency: state.currency,
        overlapGroup: action.pick.overlapGroup,
        cancelUrl: action.pick.cancelUrl,
        yearlyPrice: action.pick.yearlyPrice,
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

    case 'unlock':
      return { ...state, unlocked: true, step: 'cutlist' };
    case 'reset':
      return { ...initialState };
    case 'hydrate':
      return action.state;

    default:
      return state;
  }
}

function actionItems(result?: DetectionResult): Item[] {
  if (!result) return [];
  return [...result.recurring, ...result.habits].map((found) => ({ id: newId(), ...detectedItemToInput(found) }));
}

function detectedItemToInput(found: DetectionResult['recurring'][number]): Omit<Item, 'id'> {
  return {
    name: found.name,
    merchantKey: found.merchantKey,
    category: found.category,
    displayCategory: found.displayCategory,
    overlapGroup: found.overlapGroup,
    price: found.price,
    frequency: found.frequency,
    source: 'statement',
    estimate: false,
    lastCharge: found.lastCharge,
    nextCharge: found.nextCharge,
    currency: found.currency,
    approxConverted: found.approxConverted,
  };
}

/** Items that need a usage/visits/compare question (screen 7). */
export function itemsNeedingUsage(items: Item[]): Item[] {
  return items.filter((i) => i.category === 'digital' || i.category === 'membership' || i.category === 'bill');
}
