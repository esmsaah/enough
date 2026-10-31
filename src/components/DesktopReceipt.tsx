import { formatMoney, yearlyCost } from '../app/money';
import { useStore } from '../app/store';

// An item shows its amount only once it's confirmed on the Check card. Items
// read from a statement already have real amounts, so they count as confirmed.
function isConfirmed(item: { priceConfirmed?: boolean; source: string }): boolean {
  return item.priceConfirmed === true || item.source === 'statement';
}

export function DesktopReceipt() {
  const { state } = useStore();
  const confirmedTotal = state.items.filter(isConfirmed).reduce((sum, item) => sum + yearlyCost(item), 0);
  return (
    <aside className="desktop-receipt" aria-label="Audit total">
      <div className="desktop-receipt__inner">
        <div className="desktop-receipt__heading"><span>Your year</span><span>{state.items.length} items</span></div>
        <hr />
        {state.items.slice(0, 8).map((item) => (
          <div className="desktop-receipt__row" key={item.id}>
            <span>{item.name}</span>
            <span className={isConfirmed(item) ? undefined : 'muted'}>
              {isConfirmed(item) ? formatMoney(yearlyCost(item), state.currency, { round: true }) : 'to check'}
            </span>
          </div>
        ))}
        {state.items.length > 8 && <p className="muted">+ {state.items.length - 8} more</p>}
        {state.items.length > 0 && <hr />}
        <div className="desktop-receipt__total"><span>Confirmed so far</span><strong>{formatMoney(confirmedTotal, state.currency, { round: true })}</strong></div>
        {!state.items.length && <p className="desktop-receipt__note">Your yearly total appears here as you confirm each cost.</p>}
      </div>
      <p className="desktop-receipt__privacy">Your statement stays on this device.</p>
    </aside>
  );
}
