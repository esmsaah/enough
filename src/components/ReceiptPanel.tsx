// Enough — the paper receipt (torn edges, mono) shown as the desktop side panel
// and the mobile picked-list sheet. An item shows its amount only once it's
// confirmed on the Check card (statement items already have real amounts);
// before that it reads "to check". The total appears only when showTotal is set.
import { formatMoney, yearlyCost } from '../app/money';
import type { Item } from '../engine/types';

export function isConfirmed(item: Pick<Item, 'priceConfirmed' | 'source'>): boolean {
  return item.priceConfirmed === true || item.source === 'statement';
}

export function BoardReceipt({
  items,
  currency,
  showTotal,
  title = 'Your year',
}: {
  items: Item[];
  currency: string;
  showTotal: boolean;
  title?: string;
}) {
  const confirmedTotal = items.filter(isConfirmed).reduce((sum, i) => sum + yearlyCost(i), 0);
  return (
    <div className="receipt">
      <TornStrip dir="down" />
      <div className="receipt__body">
        <div className="receipt__head"><span>{title}</span><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
        {items.map((item) => {
          const done = isConfirmed(item);
          return (
            <div className={`receipt__row${done ? '' : ' receipt__row--tocheck'}`} key={item.id}>
              <span>{item.name}</span>
              <span>{done ? formatMoney(yearlyCost(item), currency, { round: true }) : 'to check'}</span>
            </div>
          );
        })}
        {items.length === 0 && <p className="receipt__foot">Picked services show up here.</p>}
        {showTotal && items.length > 0 && (
          <div className="receipt__total"><span>Confirmed so far</span><b>{formatMoney(confirmedTotal, currency, { round: true })}</b></div>
        )}
      </div>
      <TornStrip dir="up" />
    </div>
  );
}

/** A torn paper edge. `down` tears along the top, `up` along the bottom. */
export function TornStrip({ dir }: { dir: 'up' | 'down' }) {
  const d = dir === 'down'
    ? 'M0 8 L0 4 L5 0 L10 4 L15 0 L20 4 L25 0 L30 4 L35 0 L40 4 L45 0 L50 4 L55 0 L60 4 L65 0 L70 4 L75 0 L80 4 L85 0 L90 4 L95 0 L100 4 L100 8 Z'
    : 'M0 0 L100 0 L100 4 L95 8 L90 4 L85 8 L80 4 L75 8 L70 4 L65 8 L60 4 L55 8 L50 4 L45 8 L40 4 L35 8 L30 4 L25 8 L20 4 L15 8 L10 4 L5 8 L0 4 Z';
  return (
    <svg className="receipt__edge" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
