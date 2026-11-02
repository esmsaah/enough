// Screen — Usage (step 2, "Check"). One card at a time: confirm the price and
// how it's billed, then how it's used. A torn-paper "Found so far" strip keeps
// the running total in view. Questions depend on the item's category.
import { useState } from 'react';
import { formatMoney } from '../app/money';
import { itemsNeedingUsage } from '../app/state';
import { useStore } from '../app/store';
import { FlowHeader, Seg, Stepper } from '../components/board';
import { isUtility, yearlyCost } from '../engine/score';
import type { Item } from '../engine/types';
import { personalPlans, planShape } from '../app/localPrices';
import { guessCountry } from '../app/country';
import { convert } from '../engine/rates';

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
  const plans = i.category === 'digital' && i.merchantKey ? personalPlans(i.merchantKey, state.country ?? guessCountry()) : [];
  const shape = planShape(i.merchantKey, state.country ?? guessCountry());
  // A statement amount usually matches one plan exactly: preselect it.
  const inItemCur = (p: { monthly: number; currency: string }) => (p.currency === i.currency ? p.monthly : convert(p.monthly, p.currency, i.currency) ?? p.monthly);
  const planShown = i.planName ?? plans.find((p) => Math.abs(inItemCur(p) - i.price) <= Math.max(0.06, i.price * 0.02))?.name;
  // Found so far counts only items the person has already answered.
  const answered = new Set(state.items.filter(isAnswered).map((x) => x.id));
  const foundSoFar = audit.recommendations.filter((r) => answered.has(r.itemId)).reduce((sum, r) => sum + r.potentialYearlySaving, 0);

  const back = () => (idx === 0 ? dispatch({ type: 'goto', step: state.statement ? 'found' : 'quickstart' }) : setIdx(idx - 1));
  const advance = () => (atLast ? dispatch({ type: 'goto', step: 'anythingElse' }) : setIdx(idx + 1));
  // Next confirms this item's price (it joins the receipt with its amount); Skip moves on, leaving it "to check".
  const next = () => {
    dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
    // The stepper shows 0: pressing Next confirms "0 visits".
    if (i.category === 'membership' && typeof i.visitsPerMonth !== 'number') dispatch({ type: 'setVisits', id: i.id, visits: 0 });
    advance();
  };
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
              <div className="t">Is this what you pay? <span>{i.source === 'statement' && !i.estimate ? 'From your statement' : i.userPriced ? 'What you told us' : plans.length ? 'Price of this plan in your country' : `Usual price in ${i.displayCategory === 'Bills & Utilities' ? 'your area' : 'your country'}`}</span></div>
              {plans.length >= 2 && (
                <div style={{ marginBottom: 10 }}>
                  <Seg value={planShown}
                    options={plans.slice(0, 5).map((p) => ({ value: p.name, label: p.name.replace(/^Premium /, '') }))}
                    onChange={(name) => {
                      const p = plans.find((x) => x.name === name);
                      if (!p) return;
                      const price = p.currency === i.currency ? p.monthly : convert(p.monthly, p.currency, i.currency) ?? p.monthly;
                      dispatch({ type: 'setPlan', id: i.id, planName: p.name, price: Math.round(price * 100) / 100 });
                    }} />
                </div>
              )}
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
                {/* Questions whose answers the person can't turn into a saving alone:
                    the right plan size and a shared plan for the home. */}
                {shape.screens && (
                  <div className="q">
                    <div className="t">How many people watch at the same time?</div>
                    <Seg value={i.watchAtOnce === undefined ? undefined : String(i.watchAtOnce)}
                      options={[{ value: '1', label: 'Just me' }, { value: '2', label: '2' }, { value: '4', label: '3 or more' }]}
                      onChange={(v) => dispatch({ type: 'setWatchAtOnce', id: i.id, n: Number(v) })} />
                  </div>
                )}
                {shape.shared && (
                  <div className="q">
                    <div className="t">Does someone at home pay for their own {i.name}?</div>
                    <Seg value={i.householdOwn === undefined ? undefined : i.householdOwn ? 'yes' : 'no'}
                      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                      onChange={(v) => dispatch({ type: 'setHouseholdOwn', id: i.id, value: v === 'yes' })} />
                  </div>
                )}
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
                  <div className="t">Can you cancel any time? <span>Many gyms bind you for 12 or 24 months</span></div>
                  <Seg value={i.contract}
                    options={[{ value: 'none', label: 'Yes, monthly' }, { value: 'contract', label: 'Contract' }, { value: 'unsure', label: 'Not sure' }]}
                    onChange={(c) => dispatch({ type: 'setContract', id: i.id, contract: c })} />
                  {i.contract === 'contract' && (
                    <select aria-label="Contract ends" value={i.contractEnds ?? ''} style={{ marginTop: 8 }}
                      onChange={(e) => dispatch({ type: 'setContract', id: i.id, contract: 'contract', contractEnds: e.target.value })}>
                      <option value="">It ends in…</option>
                      {nextMonths(25).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
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

            {i.category === 'bill' && !isUtility(i) && (
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
            <span><span style={{ background: 'var(--lime)', padding: '0 6px', borderRadius: 3 }}>{formatMoney(foundSoFar, audit.currency)}</span> a year</span>
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

function nextMonths(n: number): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    return { value: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) };
  });
}

function isAnswered(i: Item): boolean {
  if (i.category === 'digital') {
    if (!i.usage) return false;
    if (i.usage === 'sometimes' && typeof i.wouldMiss !== 'boolean') return false;
    return true;
  }
  if (i.category === 'membership') return true; // 0 visits is an answer too
  if (i.category === 'bill') return isUtility(i) || !!i.compareState;
  return true;
}
