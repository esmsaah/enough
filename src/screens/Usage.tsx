// Screen 7 — Usage. Section 7 & 8. Questions only for digital, membership, bill.
// Up to 6 items: a card each. More than 6: a compact row each on one screen.
import { formatMoney } from '../app/money';
import { itemsNeedingUsage } from '../app/state';
import { useStore } from '../app/store';
import { Button, Chip, Stepper } from '../components/ui';
import type { Item } from '../engine/types';

export function Usage() {
  const { state, dispatch } = useStore();
  const items = itemsNeedingUsage(state.items);

  if (items.length === 0) {
    // nothing to ask — go straight to the result
    dispatch({ type: 'goto', step: 'result' });
    return null;
  }

  const answered = items.every((i) => isAnswered(i));

  return (
    <>
      <div className="screen">
        <h1>How you use them</h1>
        <p className="muted">A few quick taps. This is what turns a list into a plan.</p>

        {items.map((i) => (
          <div className="card" key={i.id}>
            <div className="row">
              <span className="row__name">{i.name}</span>
              <span className="amount-mono muted">{formatMoney(i.price, i.currency)}/{shortFreq(i.frequency)}</span>
            </div>

            {i.category === 'digital' && (
              <div style={{ marginTop: 10 }}>
                <div className="usage-btns">
                  <Chip selected={i.usage === 'always'} onClick={() => dispatch({ type: 'setUsage', id: i.id, usage: 'always' })}>All the time</Chip>
                  <Chip selected={i.usage === 'sometimes'} onClick={() => dispatch({ type: 'setUsage', id: i.id, usage: 'sometimes' })}>Sometimes</Chip>
                  <Chip selected={i.usage === 'almostNever'} onClick={() => dispatch({ type: 'setUsage', id: i.id, usage: 'almostNever' })}>Almost never</Chip>
                </div>
                {i.usage === 'sometimes' && (
                  <div style={{ marginTop: 8 }}>
                    <span className="muted" style={{ fontSize: 13 }}>Would you miss it?</span>
                    <div className="usage-btns" style={{ marginTop: 6 }}>
                      <Chip selected={i.wouldMiss === true} onClick={() => dispatch({ type: 'setWouldMiss', id: i.id, wouldMiss: true })}>Yes</Chip>
                      <Chip selected={i.wouldMiss === false} onClick={() => dispatch({ type: 'setWouldMiss', id: i.id, wouldMiss: false })}>Not really</Chip>
                    </div>
                  </div>
                )}
              </div>
            )}

            {i.category === 'membership' && (
              <div style={{ marginTop: 10 }}>
                <div className="row">
                  <span className="muted" style={{ fontSize: 14 }}>Visits per month</span>
                  <Stepper value={i.visitsPerMonth ?? 0} onChange={(v) => dispatch({ type: 'setVisits', id: i.id, visits: v })} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 14 }}>Price of one visit <span style={{ fontWeight: 400 }}>(optional)</span></span>
                  <input
                    className="amount-input mono" style={{ maxWidth: 110 }} inputMode="decimal"
                    value={i.singleVisitPrice ?? ''} placeholder="—"
                    onChange={(e) => dispatch({ type: 'setSingleVisit', id: i.id, price: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}

            {i.category === 'bill' && (
              <div style={{ marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 13 }}>When did you last compare offers?</span>
                <div className="usage-btns" style={{ marginTop: 6 }}>
                  <Chip selected={i.compareState === 'thisYear'} onClick={() => dispatch({ type: 'setCompareState', id: i.id, compareState: 'thisYear' })}>This year</Chip>
                  <Chip selected={i.compareState === 'overAYear'} onClick={() => dispatch({ type: 'setCompareState', id: i.id, compareState: 'overAYear' })}>Over a year</Chip>
                  <Chip selected={i.compareState === 'never'} onClick={() => dispatch({ type: 'setCompareState', id: i.id, compareState: 'never' })}>Never</Chip>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="footer">
        <div className="row" style={{ gap: 12 }}>
          <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: 'anythingElse' })}>Back</Button>
          <Button full disabled={!answered} onClick={() => dispatch({ type: 'goto', step: 'result' })}>See what I found</Button>
        </div>
        {!answered && <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>Answer each one to continue.</p>}
      </div>
    </>
  );
}

function isAnswered(i: Item): boolean {
  if (i.category === 'digital') {
    if (!i.usage) return false;
    if (i.usage === 'sometimes' && typeof i.wouldMiss !== 'boolean') return false;
    return true;
  }
  if (i.category === 'membership') return typeof i.visitsPerMonth === 'number';
  if (i.category === 'bill') return !!i.compareState;
  return true;
}

function shortFreq(f: Item['frequency']): string {
  return f === 'monthly' ? 'mo' : f === 'yearly' ? 'yr' : f === 'quarterly' ? 'qtr' : 'wk';
}
