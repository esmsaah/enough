// Screen 8 — Result + paywall. Section 8 & 9.
// Before paying: totals, how many aren't earning their place, the potential
// saving as one number, and the FIRST cut item in full. Everything else is not
// rendered at all until unlock (not just blurred). No "free". Fake unlock in M1.
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, VerdictBadge } from '../components/ui';
import { Receipt } from '../components/Receipt';
import { RATES_PER_EUR } from '../engine/rates';

export function Result() {
  const { state, audit, dispatch } = useStore();
  const cur = state.currency;

  const actionable = audit.recommendations.filter((r) => r.verdict !== 'keep');
  const firstCut =
    audit.recommendations.find((r) => r.verdict === 'cut') ??
    audit.recommendations.find((r) => r.verdict === 'lookAgain');
  const firstItem = firstCut ? state.items.find((i) => i.id === firstCut.itemId) : undefined;
  const monthly = audit.yearlyTotal / 12;

  return (
    <div className="screen screen--navy on-navy">
      <p className="muted mono">YOUR AUDIT</p>
      <h1 style={{ marginBottom: 4 }}>{formatMoney(audit.yearlyTotal, cur, { round: true })}<span style={{ fontSize: 18 }}> a year</span></h1>
      <p className="muted">{formatMoney(monthly, cur, { round: true })} a month · {audit.items.length} items</p>
      {audit.habitYearlyTotal > 0 && <p className="muted">Habits and one-time spending: {formatMoney(audit.habitYearlyTotal, cur, { round: true })}/yr (shown separately)</p>}
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        Display currency
        <select aria-label="Display currency" value={cur} onChange={(event) => dispatch({ type: 'setCurrency', currency: event.target.value })}>
          {Object.keys(RATES_PER_EUR).sort().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </label>

      <div style={{ margin: '22px 0' }}>
        <p style={{ fontSize: 18, margin: 0 }}>
          <strong>{actionable.length}</strong> {actionable.length === 1 ? "isn't" : "aren't"} earning their place.
        </p>
        <p style={{ fontSize: 34, fontWeight: 800, color: 'var(--lime)', margin: '6px 0 0' }}>
          {formatMoney(audit.potentialYearlySaving, cur, { round: true })}
        </p>
        <p className="muted" style={{ marginTop: 0 }}>potential savings a year</p>
      </div>

      {firstItem && firstCut && (
        <div className="card" style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.18)' }}>
          <div className="row">
            <span className="row__name" style={{ color: 'var(--white)' }}>{firstItem.name}</span>
            <VerdictBadge verdict={firstCut.verdict} />
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>{firstCut.reason}</p>
          <p className="mono" style={{ margin: '4px 0 0', color: 'var(--lime)' }}>
            save {formatMoney(firstCut.potentialYearlySaving, cur, { round: true })}/yr
          </p>
        </div>
      )}

      {actionable.length > 1 && (
        <p className="muted center" style={{ marginTop: 14 }}>
          + {actionable.length - 1} more {actionable.length - 1 === 1 ? 'item' : 'items'} to cut or look again
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <Receipt>
          <div className="receipt__row"><span>Enough audit</span><span>{formatMoney(4.99, 'EUR')}</span></div>
          <hr className="receipt__divider" />
          <div className="receipt__total"><span>TOTAL, ONCE</span><span>{formatMoney(4.99, 'EUR')}</span></div>
        </Receipt>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button variant="primary" full onClick={() => dispatch({ type: 'unlock' })}>Show my full cut list</Button>
        <p className="locked-note">One payment. No account. The rest of your list unlocks here.</p>
        <p className="muted center" style={{ fontSize: 12 }}>(M1: fake unlock — real Lemon Squeezy checkout is M4.)</p>
      </div>
    </div>
  );
}
