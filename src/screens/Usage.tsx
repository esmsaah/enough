// Screen — Usage (step 2, "Check"). One card at a time: confirm the price and
// how it's billed, then how it's used. A torn-paper "Found so far" strip keeps
// the running total in view. Questions depend on the item's category.
import { useState } from 'react';
import { formatMoney } from '../app/money';
import { itemsNeedingUsage } from '../app/state';
import { useStore } from '../app/store';
import { FlowHeader, Seg, Stepper } from '../components/board';
import { yearlyCost } from '../engine/score';
import type { Item } from '../engine/types';

export function Usage() {
  const { state, dispatch, audit } = useStore();
  const items = itemsNeedingUsage(state.items);
  const [idx, setIdx] = useState(0);

  if (items.length === 0) {
    dispatch({ type: 'goto', step: 'anythingElse' });
    return null;
  }
  const i = items[Math.min(idx, items.length - 1)]!;
  const atLast = idx >= items.length - 1;
  const left = items.length - idx - 1;

  const back = () => (idx === 0 ? dispatch({ type: 'goto', step: 'quickstart' }) : setIdx(idx - 1));
  const advance = () => (atLast ? dispatch({ type: 'goto', step: 'anythingElse' }) : setIdx(idx + 1));
  // Next confirms this item's price (it joins the receipt with its amount); Skip moves on, leaving it "to check".
  const next = () => { dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true }); advance(); };
  const skip = () => advance();

  return (
    <div className="board">
      <FlowHeader step={2} onBack={back} />
      <div className="flow-body flow-col" style={{ padding: '8px 20px 0' }}>
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '20px 18px 6px', display: 'flex', flexDirection: 'column' }}>
          <div className="r">
            <span className="lab">{i.displayCategory}</span>
            <span className="lab">{idx + 1} of {items.length}</span>
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, fontStretch: '115%', letterSpacing: '-1px', marginTop: 10, lineHeight: 1.05 }}>{i.name}</span>
          <span className="m" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {(i.merchantKey ?? i.name).toUpperCase()} · {formatMoney(yearlyCost(i), i.currency)} a year
          </span>

          <div style={{ marginTop: 14 }}>
            <div className="q">
              <div className="t">Is this what you pay? <span>Usual price in {i.displayCategory === 'Bills & Utilities' ? 'your area' : 'your country'}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <Stepper value={i.price} step={1} format={(v) => formatMoney(v, i.currency)}
                  onChange={(v) => dispatch({ type: 'setPrice', id: i.id, price: v })} />
                <Seg value={i.frequency === 'yearly' ? 'yearly' : 'monthly'}
                  options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]}
                  onChange={(f) => dispatch({ type: 'setFrequency', id: i.id, frequency: f })} />
              </div>
            </div>

            {i.category === 'digital' && (
              <>
                <div className="q">
                  <div className="t">How often do you use it?</div>
                  <Seg value={i.usage}
                    options={[{ value: 'always', label: 'Every week' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'almostNever', label: 'Almost never' }]}
                    onChange={(u) => dispatch({ type: 'setUsage', id: i.id, usage: u })} />
                </div>
                {i.usage === 'sometimes' && (
                  <div className="q">
                    <div className="t">Would you miss it?</div>
                    <Seg value={i.wouldMiss === undefined ? undefined : i.wouldMiss ? 'yes' : 'no'}
                      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not really' }]}
                      onChange={(v) => dispatch({ type: 'setWouldMiss', id: i.id, wouldMiss: v === 'yes' })} />
                  </div>
                )}
              </>
            )}

            {i.category === 'membership' && (
              <>
                <div className="q">
                  <div className="t">How many times a month do you go?</div>
                  <Stepper value={i.visitsPerMonth ?? 0} onChange={(v) => dispatch({ type: 'setVisits', id: i.id, visits: v })} />
                </div>
                <div className="q">
                  <div className="t">Price of one visit <span>optional</span></div>
                  <div className="field" style={{ maxWidth: 160 }}>
                    <span className="m" style={{ color: 'var(--muted)' }}>{i.currency}</span>
                    <input className="m" inputMode="decimal" value={i.singleVisitPrice ?? ''} placeholder="—"
                      onChange={(e) => dispatch({ type: 'setSingleVisit', id: i.id, price: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              </>
            )}

            {i.category === 'bill' && (
              <div className="q">
                <div className="t">When did you last compare offers?</div>
                <Seg value={i.compareState}
                  options={[{ value: 'thisYear', label: 'This year' }, { value: 'overAYear', label: 'Over a year' }, { value: 'never', label: 'Never' }]}
                  onChange={(c) => dispatch({ type: 'setCompareState', id: i.id, compareState: c })} />
              </div>
            )}
          </div>
        </div>

        {/* Found so far — torn-paper strip with the running total (mint highlight). */}
        <div style={{ margin: '16px 0 0' }}>
          <TornEdge dir="down" />
          <div className="m r" style={{ background: 'var(--paper)', padding: '10px 16px', fontSize: 13 }}>
            <span style={{ letterSpacing: '1.2px' }}>FOUND SO FAR</span>
            <span><span style={{ background: 'var(--lime)', padding: '0 6px', borderRadius: 3 }}>{formatMoney(audit.potentialYearlySaving, audit.currency)}</span> a year</span>
          </div>
          <TornEdge dir="up" />
        </div>
      </div>

      <div className="flow-foot flow-col" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center', borderTop: 0 }}>
        <button type="button" className="ghost" style={{ padding: '14px 8px' }} onClick={skip}>Skip</button>
        <button type="button" className="btn" onClick={next} disabled={!isAnswered(i)}>Next</button>
        <span style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {left > 0 ? `Tap through. ${left} left, about a minute.` : 'Last one.'}
        </span>
      </div>
    </div>
  );
}

/** A zig-zag torn edge for the "Found so far" strip. */
function TornEdge({ dir }: { dir: 'up' | 'down' }) {
  const d = dir === 'down'
    ? 'M0 10 L0 5 L10 0 L20 5 L30 0 L40 5 L50 0 L60 5 L70 0 L80 5 L90 0 L100 5 L110 0 L120 5 L130 0 L140 5 L150 0 L160 5 L170 0 L180 5 L190 0 L200 5 L210 0 L220 5 L230 0 L240 5 L250 0 L260 5 L270 0 L280 5 L290 0 L300 5 L310 0 L320 5 L330 0 L340 5 L350 0 L360 5 L370 0 L380 5 L390 0 L390 10 Z'
    : 'M0 0 L390 0 L390 5 L380 10 L370 5 L360 10 L350 5 L340 10 L330 5 L320 10 L310 5 L300 10 L290 5 L280 10 L270 5 L260 10 L250 5 L240 10 L230 5 L220 10 L210 5 L200 10 L190 5 L180 10 L170 5 L160 10 L150 5 L140 10 L130 5 L120 10 L110 5 L100 10 L90 5 L80 10 L70 5 L60 10 L50 5 L40 10 L30 5 L20 10 L10 5 L0 10 Z';
  return (
    <svg width="100%" height="10" viewBox="0 0 390 10" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill="var(--paper)" />
    </svg>
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
