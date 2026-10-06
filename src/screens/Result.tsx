// Screen 8 — Result + paywall. Section 8 & 9.
import { formatMoney, AUDIT_PRICE_EUR } from '../app/money';
import { useStore } from '../app/store';
import { Button, VerdictBadge } from '../components/ui';
import { Receipt } from '../components/Receipt';
import { RATES_PER_EUR } from '../engine/rates';
import { BreakdownSections, SubscriptionsSection } from './AuditSections';

export function Result() {
  const { state, audit, dispatch } = useStore();
  const cur = state.currency;
  const actionable = audit.recommendations.filter((r) => r.verdict !== 'keep');
  const firstCut = audit.recommendations.find((r) => r.verdict === 'cut')
    ?? audit.recommendations.find((r) => r.verdict === 'lookAgain');
  const firstItem = firstCut ? state.items.find((item) => item.id === firstCut.itemId) : undefined;
  const monthly = audit.yearlyTotal / 12;

  return (
    <div className="screen screen--navy on-navy result-screen">
      <div className="result-layout">
        <header className="result-summary">
          <p className="muted mono">YOUR AUDIT</p>
          <h1>{formatMoney(audit.yearlyTotal, cur, { round: true })}<span className="result-period"> a year</span></h1>
          <p className="muted">{formatMoney(monthly, cur, { round: true })} a month · {audit.items.length} items</p>
          {audit.habitYearlyTotal > 0 && <p className="muted">Habits and one-off spending: {formatMoney(audit.habitYearlyTotal, cur, { round: true })}/yr, shown separately.</p>}
          <label className="muted result-currency-label">
            Display currency
            <select aria-label="Display currency" value={cur} onChange={(event) => dispatch({ type: 'setCurrency', currency: event.target.value })}>
              {Object.keys(RATES_PER_EUR).sort().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </label>
        </header>

        <SubscriptionsSection />
        <BreakdownSections />

        <section className="result-savings" aria-label="Potential savings">
          <p className="result-action-count"><strong>{actionable.length}</strong> {actionable.length === 1 ? "isn't" : "aren't"} earning their place.</p>
          <p className="result-saving-amount">{formatMoney(audit.potentialYearlySaving, cur, { round: true })}</p>
          <p className="muted" style={{ marginTop: 0 }}>potential savings a year</p>
          {actionable.length > 1 && <p className="muted">Plus {actionable.length - 1} more {actionable.length - 1 === 1 ? 'item' : 'items'} to cut or look again.</p>}
        </section>

        {firstItem && firstCut && <section className="card result-first-action" aria-label="First suggested action">
          <div className="row"><span className="row__name" style={{ color: 'var(--white)' }}>{firstItem.name}</span><VerdictBadge verdict={firstCut.verdict} /></div>
          <p className="muted" style={{ margin: '6px 0 0' }}>{firstCut.reason}</p>
          <p className="mono" style={{ margin: '4px 0 0', color: 'var(--lime)' }}>save {formatMoney(firstCut.potentialYearlySaving, cur, { round: true })}/yr</p>
        </section>}

        <section className="result-checkout" aria-label="Unlock the full audit">
          <Receipt>
            <div className="receipt__row"><span>Enough audit</span><span>{formatMoney(AUDIT_PRICE_EUR, 'EUR')}</span></div>
            <hr className="receipt__divider" />
            <div className="receipt__total"><span>TOTAL, ONCE</span><span>{formatMoney(AUDIT_PRICE_EUR, 'EUR')}</span></div>
          </Receipt>
          <Button variant="primary" full onClick={() => dispatch({ type: 'unlock' })}>Show my full cut list</Button>
          <p className="locked-note">One payment. No account. The rest of your list unlocks here.</p>
          <p className="muted center result-build-note" style={{ fontSize: 12 }}>(M1: fake unlock — real Lemon Squeezy checkout is M4.)</p>
        </section>
      </div>
    </div>
  );
}
