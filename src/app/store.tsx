// Enough — app store (context + reducer + persistence + derived audit).
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { runAudit } from '../engine/score';
import type { Audit } from '../engine/types';
import { initialState, reducer, type Action, type State } from './state';
import { loadState, saveState } from './storage';

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
