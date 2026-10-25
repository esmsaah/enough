// Screen 2 — the gentle first pick. A short, curated set of the most common
// things people pay for: tap the obvious ones (no prices shown, nothing
// preselected). "Add more" / Continue goes to the full tap list (screen 3).
import { useState } from 'react';
import { QUICK_PICKS, type QuickPick } from '../app/catalog';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { BoardChip, FlowHeader, Seg, StatementIcon } from '../components/board';

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
    <div className="board">
      <FlowHeader step={1} onBack={() => dispatch({ type: 'goto', step: 'landing' })} />
      <div className="flow-body flow-col" style={{ padding: '8px 20px 24px' }}>
        <span className="lab">Step 1 · Pick</span>
        <h1 className="h1" style={{ fontSize: 36, marginTop: 12 }}>Which of these do you pay for?</h1>
        <p className="sub" style={{ marginTop: 12 }}>Start with the obvious ones. We'll find the forgotten ones next.</p>

        {askFor && (() => {
          const amount = Number(askAmount) || 0;
          const perMonth = CADENCES.find((c) => c.key === askCadence)?.perMonth ?? 1;
          const yearly = amount * perMonth * 12;
          return (
            <div style={{ marginTop: 16, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="t" style={{ fontSize: 17, fontWeight: 700 }}>How much do you pay for {askFor.name}? <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 14 }}>Prices vary, so just tell us yours.</span></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="field" style={{ maxWidth: 160 }}>
                  <span className="m" style={{ color: 'var(--muted)' }}>{cur}</span>
                  <input className="m" inputMode="decimal" autoFocus value={askAmount} placeholder="0"
                    onChange={(e) => setAskAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAsked(); }} />
                </div>
                <Seg value={askCadence}
                  options={CADENCES.map((c) => ({ value: c.key, label: c.label }))}
                  onChange={(k) => setAskCadence(k)} />
              </div>
              {yearly > 0 && <p className="sub" style={{ fontSize: 13 }}>≈ {formatMoney(yearly, cur, { round: true })} a year</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="ghost" onClick={() => setAskFor(null)}>Cancel</button>
                <button type="button" className="btn full" disabled={!amount} onClick={addAsked}>Add {askFor.name}</button>
              </div>
            </div>
          );
        })()}

        <div className="chips" style={{ marginTop: 20 }}>
          {picks.map((p) => (
            <BoardChip key={p.merchantKey} label={p.name} selected={selected.has(p.merchantKey)} onClick={() => onChip(p)} />
          ))}
          <button type="button" className="chip more" onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>+ Add more</button>
        </div>
      </div>

      <div className="flow-foot flow-col">
        <div className="r">
          <span className="lab" style={{ color: 'var(--ink)' }}>{count} picked</span>
          <span className="m" style={{ fontSize: 15 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{formatMoney(audit.yearlyTotal, cur)}</b> a year
          </span>
        </div>
        <button type="button" className="btn full" disabled={count === 0} onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>Continue</button>
        <button type="button" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}
          style={{ alignSelf: 'center', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 15, padding: '4px 0', background: 'none', border: 0, color: 'var(--indigo)', cursor: 'pointer' }}>
          <StatementIcon />Or add a bank statement
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Optional. PDF, CSV or a photo, read on your device.</span>
      </div>
    </div>
  );
}
