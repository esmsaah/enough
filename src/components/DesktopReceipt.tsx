import { formatMoney, yearlyCost } from '../app/money';
import { useStore } from '../app/store';

export function DesktopReceipt() {
  const { state, audit } = useStore();
  return (
    <aside className="desktop-receipt" aria-label="Audit total">
      <div className="desktop-receipt__inner">
        <div className="desktop-receipt__heading"><span>Your year</span><span>{state.items.length} items</span></div>
        <hr />
        {state.items.slice(0, 8).map((item) => <div className="desktop-receipt__row" key={item.id}>
          <span>{item.name}</span><span>{formatMoney(yearlyCost(item), state.currency, { round: true })}</span>
        </div>)}
        {state.items.length > 8 && <p className="muted">+ {state.items.length - 8} more</p>}
        {state.items.length > 0 && <hr />}
        <div className="desktop-receipt__total"><span>Found this year</span><strong>{formatMoney(audit.yearlyTotal, state.currency, { round: true })}</strong></div>
        {audit.habitYearlyTotal > 0 && <p className="desktop-receipt__note">Habits shown separately: {formatMoney(audit.habitYearlyTotal, state.currency, { round: true })}</p>}
        {!state.items.length && <p className="desktop-receipt__note">Your yearly total appears here as you add costs.</p>}
      </div>
      <p className="desktop-receipt__privacy">Your statement stays on this device.</p>
    </aside>
  );
}
