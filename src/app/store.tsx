// Enough — app store (context + reducer + persistence + derived audit).
import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { runAudit } from '../engine/score';
import type { Audit } from '../engine/types';
import { initialState, reducer, type Action, type State } from './state';
import { loadState, saveState } from './storage';
import { analyseItems, restoreMerchantProfiles } from './merchantResearch';

type Ctx = { state: State; dispatch: (a: Action) => void; audit: Audit };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Resume where the person left off (§8 flow rule).
  useEffect(() => {
    let live = true;
    loadState().then((s) => {
      if (live && s && s.items) dispatch({ type: 'hydrate', state: s });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    void restoreMerchantProfiles();
  }, []);

  // The AI analyst reads the anonymous item list once per distinct audit.
  const analysedKey = useRef('');
  useEffect(() => {
    if (state.step !== 'result' || !state.aiRecognition || !state.items.length) return;
    const key = state.items.map((item) => `${item.id}:${item.usage ?? ''}:${item.category}`).join('|');
    if (key === analysedKey.current) return;
    analysedKey.current = key;
    void analyseItems(state.items).then(({ notes }) => {
      if (Object.keys(notes).length) dispatch({ type: 'analystNotes', notes });
    });
  }, [state.step, state.aiRecognition, state.items]);

  // Progress saves after every step.
  useEffect(() => {
    void saveState(state);
  }, [state]);

  const audit = runAudit(state.items, {
    unlocked: state.unlocked,
    displayCurrency: state.currency,
    spendingByCategory: state.statement?.spendingByCategory,
    spendingCurrency: state.statement?.meta.displayCurrency,
    pinnedVideoItemIds: state.rotationPinnedIds,
  });
  return <StoreContext.Provider value={{ state, dispatch, audit }}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
