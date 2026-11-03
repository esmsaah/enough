// Enough — app store (context + reducer + persistence + derived audit).
import { opportunitiesFor } from './opportunities';
import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { runAudit } from '../engine/score';
import type { Audit } from '../engine/types';
import { initialState, reducer, type Action, type State } from './state';
import { loadState, saveState } from './storage';
import { analyseItems, restoreMerchantProfiles } from './merchantResearch';
import { cheaperPlanFor, sharePlanFor } from './localPrices';
import { guessCountry } from './country';
import { monthlyEquivalent } from '../engine/score';
import { clearReturnParams, confirmPayment, returnedPaymentId } from './payment';
import { readContinueHash } from './continueLink';

type Ctx = { state: State; dispatch: (a: Action) => void; audit: Audit };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Resume where the person left off (§8 flow rule).
  useEffect(() => {
    let live = true;
    loadState().then(async (s) => {
      if (live && s && s.items) dispatch({ type: 'hydrate', state: s });
      // Opened from a "Finish on my computer" link: bring the tapped items in.
      const carried = readContinueHash(window.location.hash);
      if (carried) {
        window.history.replaceState(null, '', window.location.pathname);
        if (carried.items.length) dispatch({ type: 'importContinue', items: carried.items, ...(carried.country ? { country: carried.country } : {}) });
      }
      // Back from checkout: unlock only after our server confirms the payment.
      const paymentId = returnedPaymentId();
      if (!paymentId) return;
      clearReturnParams();
      dispatch({ type: 'paymentPending', pending: true });
      const paid = await confirmPayment(paymentId);
      if (!live) return;
      dispatch({ type: 'paymentPending', pending: false });
      if (paid) dispatch({ type: 'unlock' });
      else dispatch({ type: 'paymentFailed' });
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
    profile: state.profile,
    cheaperPlan: (item) => cheaperPlanFor(item.merchantKey, item.planName, monthlyEquivalent(item), state.currency, state.country ?? guessCountry(), item.watchAtOnce),
    sharePlan: (item) => sharePlanFor(item.merchantKey, monthlyEquivalent(item), state.currency, state.country ?? guessCountry()),
    opportunities: (items, today, losers) => opportunitiesFor(items, state.country ?? guessCountry(), state.currency, today, losers),
    ...(state.statement ? { spendingMonths: state.statement.meta.monthsSpan } : {}),
    ...(state.statement?.fees ? {
      ...(state.statement.fees.fxYearly !== undefined ? { statementFxFeeYearly: state.statement.fees.fxYearly } : {}),
      ...(state.statement.fees.bankYearly !== undefined ? { statementBankFeeYearly: state.statement.fees.bankYearly } : {}),
    } : {}),
  });
  return <StoreContext.Provider value={{ state, dispatch, audit }}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
