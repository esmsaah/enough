// Screen 2 — the gentle first pick. A short, curated set of the most common
// things people pay for: tap the obvious ones (no prices shown, nothing
// preselected). "Something else" / Continue goes to the full tap list (screen 3).
import { useState } from 'react';
import { QUICK_PICKS, type QuickPick } from '../app/catalog';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, Chip, ProgressBar } from '../components/ui';

// The obvious ones, in the order from the design. Prices are NOT shown here —
// they vary by country and are only an estimate the person can fix later.
const CURATED = ['netflix', 'spotify', 'disney+', 'icloud', 'chatgpt', 'gym', 'youtube premium', 'phone', 'dropbox', 'wolt+', 'kids activity'];

const CADENCES = [
  { key: 'week', label: 'a week', perMonth: 52 / 12 },
  { key: 'month', label: 'a month', perMonth: 1 },
  { key: '2months', label: 'every 2 months', perMonth: 1 / 2 },
  { key: '3months', label: 'every 3 months', perMonth: 1 / 3 },
  { key: '6months', label: 'twice a year', perMonth: 1 / 6 },
  { key: 'year', label: 'a year', perMonth: 1 / 12 },
] as const;

export function QuickPicks() {
  const { state, dispatch, audit } = useStore();
  const [askFor, setAskFor] = useState<QuickPick | null>(null);
  const [askAmount, setAskAmount] = useState('');
  const [askCadence, setAskCadence] = useState<(typeof CADENCES)[number]['key']>('month');

  const picks = CURATED.map((key) => QUICK_PICKS.find((p) => p.merchantKey === key)).filter((p): p is QuickPick => !!p);
  const selected = new Set(state.items.filter((i) => i.source === 'quickpick').map((i) => i.merchantKey));
  const cur = state.currency;
  const count = state.items.length;
  const monthly = audit.yearlyTotal / 12;

  function onChip(p: QuickPick) {
    if (selected.has(p.merchantKey)) { dispatch({ type: 'toggleQuickPick', pick: p }); return; }
    if (p.askPrice) { setAskFor(p); setAskAmount(''); setAskCadence(p.defaultCadence ?? 'month'); return; }
    dispatch({ type: 'toggleQuickPick', pick: p });
  }
  function addAsked() {
    if (!askFor) return;
    const amount = Number(askAmount);
    if (!amount) return;
    const perMonth = CADENCES.find((c) => c.key === askCadence)?.perMonth ?? 1;
    const m = Math.round((amount * perMonth + Number.EPSILON) * 100) / 100;
    dispatch({ type: 'addPricedPick', pick: askFor, price: m });
    setAskFor(null); setAskAmount('');
  }

  return (
    <>
      <div className="screen">
        <div className="qs-progress"><ProgressBar step={1} total={3} /><span className="qs-progress__count">1 / 3</span></div>
        <p className="qp-eyebrow">STEP 1 · PICK</p>
        <h1>Which of these do you pay for?</h1>
        <p className="muted">Start with the obvious ones. We'll find the forgotten ones next.</p>

        {askFor && (() => {
          const amount = Number(askAmount) || 0;
          const perMonth = CADENCES.find((c) => c.key === askCadence)?.perMonth ?? 1;
          const yearly = amount * perMonth * 12;
          return (
            <div className="card">
              <label style={{ fontWeight: 700 }}>How much do you pay for {askFor.name}?</label>
              <p className="muted" style={{ fontSize: 13, margin: '2px 0 10px' }}>Prices vary, so just tell us yours.</p>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="muted">{cur}</span>
                <input className="amount-input mono" inputMode="decimal" autoFocus value={askAmount} placeholder="0"
                  onChange={(e) => setAskAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAsked(); }} />
                <select aria-label="How often" value={askCadence} onChange={(e) => setAskCadence(e.target.value as typeof askCadence)}>
                  {CADENCES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {yearly > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>≈ {formatMoney(yearly, cur, { round: true })} a year</p>}
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <Button variant="secondary" onClick={() => setAskFor(null)}>Cancel</Button>
                <Button full disabled={!amount} onClick={addAsked}>Add {askFor.name}</Button>
              </div>
            </div>
          );
        })()}

        <div className="chip-wrap qp-chips">
          {picks.map((p) => (
            <Chip key={p.merchantKey} selected={selected.has(p.merchantKey)} onClick={() => onChip(p)}>{p.name}</Chip>
          ))}
          <button type="button" className="qp-something" onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>+ Something else</button>
        </div>
      </div>

      <div className="footer qs-band">
        <div className="qs-band__row">
          <div className="qs-band__picked">
            <span className="qs-badge">{count}</span>
            <span className="qs-band__text">
              <span className="qs-band__sofar">picked<span className="qs-band__sofar-ext"> so far,</span></span>
              <span className="qs-band__year">{formatMoney(audit.yearlyTotal, cur, { round: true })}<span className="qs-band__unit"> a year</span></span>
              <span className="qs-band__month">{formatMoney(monthly, cur, { round: true })} a month</span>
            </span>
          </div>
          <button type="button" className="qs-next" disabled={count === 0} onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>
            Continue
          </button>
        </div>
        <button type="button" className="qs-add" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
          Or add a bank statement
        </button>
        <p className="qs-optional">Optional. PDF, CSV or a photo, read on your phone. We never ask for your bank login.</p>
      </div>
    </>
  );
}
