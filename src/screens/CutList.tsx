import { resetStatements } from '../app/statementImport';
// Screen 9 — Full cut list (after unlock). Section 8 & 9.
// Before/after yearly total, the savings-target tool, then Cut / Look again /
// Keep. Cut items get "Cancel now" and a Done check; every item can be flagged
// for a renewal reminder. "Delete everything" clears local storage (§11).
import { useMemo, useState } from 'react';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { clearEverything } from '../app/storage';
import { Button, VerdictBadge, PenStrike } from '../components/ui';
import { pickSavingsSubset } from '../engine/savings';
import type { Recommendation, Verdict } from '../engine/types';

const ORDER: Verdict[] = ['cut', 'lookAgain', 'keep'];
const TITLE: Record<Verdict, string> = { cut: 'Cut', lookAgain: 'Look again', keep: 'Keep' };

export function CutList() {
  const { state, audit, dispatch } = useStore();
  const cur = state.currency;
  const [target, setTarget] = useState('');

  const itemById = useMemo(() => new Map(state.items.map((i) => [i.id, i])), [state.items]);

  const doneSavings = audit.recommendations
    .filter((r) => itemById.get(r.itemId)?.done)
    .reduce((s, r) => s + r.potentialYearlySaving, 0);
  const after = audit.yearlyTotal - audit.potentialYearlySaving;

  const subset = useMemo(() => {
    const t = Number(target);
    if (!t) return [];
    const candidates = audit.recommendations
      .filter((r) => r.potentialYearlySaving > 0)
      .map((r) => ({ id: r.itemId, name: itemById.get(r.itemId)?.name ?? '', monthlySaving: r.potentialYearlySaving / 12 }));
    return pickSavingsSubset(candidates, t);
  }, [target, audit.recommendations, itemById]);

  return (
    <div className="screen">
      <h1>Here's everything.</h1>

      <div className="card">
        <div className="row"><span className="muted">Now</span><span className="amount-mono">{formatMoney(audit.yearlyTotal, cur, { round: true })}/yr</span></div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="muted">If you act on it all</span>
          <span className="amount-mono" style={{ color: 'var(--indigo-dark)' }}>{formatMoney(after, cur, { round: true })}/yr</span>
        </div>
        {doneSavings > 0 && (
          <p className="hand" style={{ marginTop: 8 }}>cut {formatMoney(doneSavings, cur, { round: true })} so far</p>
        )}
      </div>

      {/* Savings target tool */}
      <div className="card">
        <label className="muted" style={{ fontSize: 14 }}>Want to hit a monthly target?</label>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="amount-input mono" inputMode="decimal" value={target} placeholder={`e.g. 20`} onChange={(e) => setTarget(e.target.value)} />
          <span className="muted">/mo</span>
        </div>
        {subset.length > 0 && (
          <p style={{ marginTop: 10 }}>
            To save around <strong>{formatMoney(Number(target), cur, { round: true })}</strong> a month, start with{' '}
            <strong>{subset.map((s) => s.name).join(' and ')}</strong>.
          </p>
        )}
      </div>

      {ORDER.map((verdict) => {
        const recs = audit.recommendations.filter((r) => r.verdict === verdict);
        if (recs.length === 0) return null;
        return (
          <section key={verdict}>
            <h2>{TITLE[verdict]} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>({recs.length})</span></h2>
            {recs.map((r) => (
              <ItemCard key={r.itemId} rec={r} />
            ))}
          </section>
        );
      })}

      <div className="stack" style={{ marginTop: 20 }}>
        <Button full onClick={() => dispatch({ type: 'goto', step: 'emailShare' })}>Email and share</Button>
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'result' })}>Back to summary</Button>
      </div>

      <button
        className="delete-all"
        onClick={async () => {
          await clearEverything();
          resetStatements();
          dispatch({ type: 'reset' });
        }}
      >
        Delete everything
      </button>
    </div>
  );
}

function ItemCard({ rec }: { rec: Recommendation }) {
  const { state, dispatch } = useStore();
  const item = state.items.find((i) => i.id === rec.itemId);
  if (!item) return null;
  const cur = rec.currency ?? state.currency;
  return (
    <div className="card">
      <div className="row">
        <span className="row__name">
          {rec.verdict === 'cut' ? <PenStrike>{item.name}</PenStrike> : item.name}
        </span>
        <VerdictBadge verdict={rec.verdict} />
      </div>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{rec.reason}</p>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="amount-mono">{formatMoney(rec.yearlyCost, cur, { round: true })}/yr</span>
        {rec.potentialYearlySaving > 0 && (
          <span className="amount-mono" style={{ color: 'var(--indigo-dark)' }}>
            save {formatMoney(rec.potentialYearlySaving, cur, { round: true })}{rec.approx ? ' approx.' : ''}
          </span>
        )}
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        {rec.verdict === 'cut' && item.cancelUrl && (
          <a className="btn btn--secondary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', minHeight: 'var(--tap)' }} href={item.cancelUrl} target="_blank" rel="noreferrer">
            Cancel now
          </a>
        )}
        {rec.verdict === 'cut' && (
          <label className="chip" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={!!item.done} onChange={() => dispatch({ type: 'toggleDone', id: item.id })} style={{ marginRight: 6 }} />
            Done
          </label>
        )}
        <label className="chip" style={{ cursor: item.nextCharge ? 'pointer' : 'default', opacity: item.nextCharge ? 1 : 0.55 }}>
          <input type="checkbox" checked={!!item.flaggedForReminder} disabled={!item.nextCharge} onChange={() => dispatch({ type: 'toggleReminder', id: item.id })} style={{ marginRight: 6 }} />
          {item.nextCharge ? 'Remind me before it renews' : 'No renewal date'}
        </label>
      </div>
    </div>
  );
}
