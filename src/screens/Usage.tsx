// Screen — Check (step 2). One thing in focus at a time, like setting up a new
// phone. Each service gets its own card with the name and price as the hero
// and one question at a time as a big inset list. Follow-ups open on the same
// card only when they can change the advice, answered ones fold into a line
// you can tap to change. Overlaps are asked as side-by-side tiles right after
// the group. A review list at the end lets you change anything.
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../app/money';
import { itemsNeedingUsage } from '../app/state';
import { useStore } from '../app/store';
import { FlowHeader, Seg, Stepper } from '../components/board';
import { isUtility, yearlyCost } from '../engine/score';
import type { Item } from '../engine/types';
import { personalPlans, planShape } from '../app/localPrices';
import { guessCountry } from '../app/country';
import { convert } from '../engine/rates';

type Group = { key: string; title: string; verb: string; compare?: boolean; match: (i: Item) => boolean };

const isYtp = (i: Item) => i.merchantKey === 'youtube premium' || /youtube\s*premium/i.test(i.name);
const GROUPS: Group[] = [
  { key: 'music', title: 'Music', verb: 'listen to', compare: true, match: (i) => i.overlapGroup === 'music' || isYtp(i) },
  { key: 'video', title: 'Streaming', verb: 'watch', match: (i) => i.overlapGroup === 'video' },
  { key: 'cloud', title: 'Cloud & storage', verb: 'use', compare: true, match: (i) => i.overlapGroup === 'cloud' || i.displayCategory === 'Cloud & Storage' },
  { key: 'ai', title: 'AI & software', verb: 'use', compare: true, match: (i) => i.overlapGroup === 'ai' || i.displayCategory === 'AI & Software' },
  { key: 'digital', title: 'Other subscriptions', verb: 'use', match: (i) => i.category === 'digital' },
  { key: 'membership', title: 'Gym, clubs & lessons', verb: 'use', match: (i) => i.category === 'membership' },
  { key: 'bill', title: 'Bills', verb: 'use', match: (i) => i.category === 'bill' },
];

/** Answered = the main question for this kind of item has an answer. */
export function rowAnswered(i: Item): boolean {
  if (i.category === 'digital') return !!i.usage && (i.usage !== 'sometimes' || typeof i.wouldMiss === 'boolean');
  if (i.category === 'membership') return typeof i.visitsPerMonth === 'number';
  if (i.category === 'bill') return isUtility(i) || !!i.compareState;
  return true;
}

type Step = { kind: 'item'; item: Item; group: Group } | { kind: 'compare'; group: Group; items: Item[] };
const stepKey = (s: Step) => (s.kind === 'item' ? s.item.id : `cmp:${s.group.key}`);
const compareValue = (items: Item[]) => items.map((i) => i.preferredInOverlap).find((p) => p !== undefined);
const stepDone = (s: Step) => (s.kind === 'item' ? rowAnswered(s.item) : compareValue(s.items) !== undefined);

export function Usage() {
  const { state, dispatch, audit } = useStore();
  const items = itemsNeedingUsage(state.items);
  const country = state.country ?? guessCountry();

  const placed = new Set<string>();
  const groups = GROUPS.map((g) => {
    const list = items.filter((i) => !placed.has(i.id) && g.match(i));
    list.forEach((i) => placed.add(i.id));
    return { ...g, items: list };
  }).filter((g) => g.items.length);

  // Fixed-cost bills have nothing to answer. They only show in the review.
  const steps: Step[] = groups.flatMap((g) => {
    const asked = g.items.filter((i) => !(i.category === 'bill' && isUtility(i)));
    const out: Step[] = asked.map((item) => ({ kind: 'item', item, group: g }));
    if (g.compare && g.items.length >= 2) out.push({ kind: 'compare', group: g, items: g.items });
    return out;
  });

  const firstOpen = steps.findIndex((s) => !stepDone(s));
  const [pos, setPos] = useState(firstOpen === -1 ? steps.length : firstOpen);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [fromReview, setFromReview] = useState(false);
  const [passed, setPassed] = useState<Set<string>>(() => new Set());
  const pass = (k: string) => setPassed((p) => new Set(p).add(k));

  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (items.length === 0) dispatch({ type: 'goto', step: 'anythingElse' });
  }, [items.length, dispatch]);
  if (items.length === 0) return null;

  const done = steps.filter(stepDone).length;
  const answeredIds = new Set(items.filter(rowAnswered).map((x) => x.id));
  const foundSoFar = audit.recommendations.filter((r) => answeredIds.has(r.itemId)).reduce((sum, r) => sum + r.potentialYearlySaving, 0);

  const go = (to: number, d: 'fwd' | 'back') => { setDir(d); setPos(Math.max(0, Math.min(steps.length, to))); };
  const next = () => {
    if (fromReview) { setFromReview(false); go(steps.length, 'fwd'); return; }
    const after = steps.findIndex((s, k) => k > pos && !stepDone(s));
    go(after === -1 ? steps.length : after, 'fwd');
  };
  const back = () => {
    if (pos > 0) go(pos - 1, 'back');
    else dispatch({ type: 'goto', step: state.statement ? 'found' : 'quickstart' });
  };
  const finish = () => {
    for (const i of items) if (rowAnswered(i)) dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
    dispatch({ type: 'goto', step: 'anythingElse' });
  };

  // Swipe right to go back, left to skip ahead.
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; if (t) touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; const t = e.changedTouches[0]; touch.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    if (dx > 0) back(); else if (pos < steps.length) next();
  };

  const step = steps[pos];
  const inReview = pos >= steps.length;

  return (
    <div className="board">
      <FlowHeader step={2} onBack={back} />
      <div className="flow-body flow-col chk" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {inReview ? (
          <Review groups={groups} onEdit={(id) => { const k = steps.findIndex((s) => stepKey(s) === id); if (k !== -1) { setFromReview(true); go(k, 'back'); } }} />
        ) : step ? (
          <div key={stepKey(step)} className={`chk-card chk-in-${dir}`}>
            <span className="lab">{step.group.title}</span>
            {step.kind === 'item' ? (
              <ItemCard item={step.item} group={step.group} country={country} passed={passed} onPass={pass} onComplete={next} />
            ) : (
              <CompareCard items={step.items} onPicked={next} />
            )}
            <button type="button" className="ghost chk-skip" onClick={next}>{stepDone(step) ? 'Continue' : 'Skip for now'}</button>
          </div>
        ) : null}
      </div>

      <div className="flow-foot flow-col chk-foot">
        {inReview ? (
          <>
            <button type="button" className="btn" onClick={finish}>Next</button>
            {done < steps.length && <span className="chk-note">{steps.length - done} skipped. They stay in your total, without advice.</span>}
          </>
        ) : (
          <>
            <div className="chk-progress" aria-hidden="true"><div style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} /></div>
            <div className="chk-meta">
              <span>{Math.min(pos + 1, steps.length)} of {steps.length}</span>
              <span>found so far <CountUp value={foundSoFar} currency={audit.currency} /> a year</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The savings number counts up and glows briefly when an answer adds to it. */
function CountUp({ value, currency }: { value: number; currency: string }) {
  const [shown, setShown] = useState(value);
  const [pulse, setPulse] = useState(false);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current; const end = value;
    if (start === end) return;
    from.current = end;
    if (end > start) { setPulse(true); setTimeout(() => setPulse(false), 700); }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(end); return; }
    const t0 = performance.now(); let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600); const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (end - start) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b className={`chk-money${pulse ? ' up' : ''}`} aria-live="polite">{formatMoney(Math.round(shown * 100) / 100, currency)}</b>;
}

/** iOS-style inset list. Tap a row, a check appears. */
function List<T extends string>({ options, value, onPick }: { options: Array<{ value: T; label: string; note?: string }>; value: T | undefined; onPick: (v: T) => void }) {
  return (
    <div className="chk-list" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>
          <span className="chk-list__label">{o.label}{o.note && <small>{o.note}</small>}</span>
          <span className="chk-list__tick" aria-hidden="true">{value === o.value ? <Tick /> : null}</span>
        </button>
      ))}
    </div>
  );
}

function Tick() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

type Q = { key: string; title: string; answer?: string; body: React.ReactNode };

function ItemCard({ item: i, group, country, passed, onPass, onComplete }: {
  item: Item; group: Group; country: string; passed: Set<string>; onPass: (k: string) => void; onComplete: () => void;
}) {
  const { dispatch } = useStore();
  const [editPrice, setEditPrice] = useState(false);
  const [editing, setEditing] = useState<string | undefined>();
  const [visits, setVisits] = useState(i.visitsPerMonth ?? 0);
  const [single, setSingle] = useState(i.singleVisitPrice ? String(i.singleVisitPrice) : '');
  const justAnswered = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const per = i.frequency === 'yearly' ? 'a year' : i.frequency === 'weekly' ? 'a week' : 'a month';
  const plans = i.category === 'digital' && i.merchantKey ? personalPlans(i.merchantKey, country) : [];
  const shape = planShape(i.merchantKey, country);
  const inItemCur = (p: { monthly: number; currency: string }) => (p.currency === i.currency ? p.monthly : convert(p.monthly, p.currency, i.currency) ?? p.monthly);
  const fromPrice = plans.find((p) => Math.abs(inItemCur(p) - i.price) <= Math.max(0.06, i.price * 0.02))?.name;
  const planShown = i.planName ?? fromPrice;
  const keeps = i.usage === 'always' || (i.usage === 'sometimes' && i.wouldMiss === true);

  const answer = (apply: () => void) => {
    apply();
    dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
    justAnswered.current = true;
    setEditing(undefined);
  };

  const qs: Q[] = [];
  if (i.category === 'digital') {
    const useLabel = { always: 'Every week', sometimes: 'Sometimes', almostNever: 'Almost never' } as const;
    qs.push({ key: 'main', title: `How often do you ${group.verb} it?`, answer: i.usage ? useLabel[i.usage] : undefined,
      body: <List value={i.usage} options={[{ value: 'always', label: 'Every week' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'almostNever', label: 'Almost never' }]}
        onPick={(u) => answer(() => dispatch({ type: 'setUsage', id: i.id, usage: u }))} /> });
    if (i.usage === 'sometimes') qs.push({ key: 'miss', title: 'Would you miss it?', answer: i.wouldMiss === undefined ? undefined : i.wouldMiss ? 'Yes' : 'Not really',
      body: <List value={i.wouldMiss === undefined ? undefined : i.wouldMiss ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not really' }]}
        onPick={(v) => answer(() => dispatch({ type: 'setWouldMiss', id: i.id, wouldMiss: v === 'yes' }))} /> });
    if (keeps && plans.length >= 2) qs.push({ key: 'plan', title: 'Which plan do you have?', answer: planShown && (i.planName ? planShown : `${planShown}, from your price`),
      body: <List value={planShown} options={plans.slice(0, 5).map((p) => ({ value: p.name, label: p.name, note: formatMoney(Math.round(inItemCur(p) * 100) / 100, i.currency) + ' a month' }))}
        onPick={(name) => { const p = plans.find((x) => x.name === name); if (p) answer(() => dispatch({ type: 'setPlan', id: i.id, planName: p.name, price: Math.round(inItemCur(p) * 100) / 100 })); }} /> });
    if (keeps && shape.screens) qs.push({ key: 'people', title: 'How many people watch at the same time?', answer: i.watchAtOnce === undefined ? undefined : i.watchAtOnce === 1 ? 'Just me' : i.watchAtOnce === 2 ? '2' : '3 or more',
      body: <List value={i.watchAtOnce === undefined ? undefined : String(i.watchAtOnce)} options={[{ value: '1', label: 'Just me' }, { value: '2', label: '2' }, { value: '4', label: '3 or more' }]}
        onPick={(v) => answer(() => dispatch({ type: 'setWatchAtOnce', id: i.id, n: Number(v) }))} /> });
    if (keeps && shape.shared) qs.push({ key: 'home', title: `Does someone at home pay for their own ${i.name}?`, answer: i.householdOwn === undefined ? undefined : i.householdOwn ? 'Yes' : 'No',
      body: <List value={i.householdOwn === undefined ? undefined : i.householdOwn ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        onPick={(v) => answer(() => dispatch({ type: 'setHouseholdOwn', id: i.id, value: v === 'yes' }))} /> });
    // Questions that unlock a cheaper plan, asked only when such a plan exists for this person.
    const mk = i.merchantKey ?? '';
    const isVideo = ['netflix', 'disney+', 'hbo max', 'max'].includes(mk);
    const current = plans.find((p) => p.name === planShown);
    const adsPlan = plans.find((p) => (p.type === 'basic_with_ads' || (p as { ads?: boolean }).ads) && inItemCur(p) < i.price - 0.01);
    // Picture quality: asked only when a cheaper plan with lower quality would otherwise fit.
    const qualityOf = (t?: string) => (t === 'premium' ? 2160 : t === 'basic' || t === 'mobile' ? 720 : 1080);
    const lowerCheaper = plans.some((p) => qualityOf(p.type) < qualityOf(current?.type) && inItemCur(p) < i.price - 0.01 && p.type !== 'mobile');
    if (keeps && isVideo && current && lowerCheaper) qs.push({ key: 'quality', title: 'What picture quality do you need?', answer: i.minQuality === undefined ? undefined : i.minQuality >= 2160 ? '4K (Ultra HD)' : i.minQuality >= 1080 ? 'Full HD' : 'HD is fine',
      body: <List value={i.minQuality === undefined ? undefined : String(i.minQuality)} options={[
        ...(qualityOf(current.type) >= 2160 ? [{ value: '2160', label: '4K (Ultra HD)', note: 'needs a 4K TV' }] : []),
        { value: '1080', label: 'Full HD' }, { value: '720', label: 'HD is fine', note: 'phone, laptop or a small TV' }]}
        onPick={(v) => answer(() => dispatch({ type: 'setNeeds', id: i.id, patch: { minQuality: Number(v) } }))} /> });
    if (keeps && isVideo && adsPlan && !(current as { ads?: boolean } | undefined)?.ads) qs.push({ key: 'ads', title: `Would short ads on ${i.name} be OK if it saved money?`, answer: i.adsOk === undefined ? undefined : i.adsOk ? 'Yes' : 'No',
      body: <List value={i.adsOk === undefined ? undefined : i.adsOk ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        onPick={(v) => answer(() => dispatch({ type: 'setNeeds', id: i.id, patch: { adsOk: v === 'yes' } }))} /> });
    const cheapest = plans.length ? Math.min(...plans.map(inItemCur)) : Infinity;
    const sk = `${i.id}:storage`;
    if (/^(icloud|google one)/.test(mk) && plans.length >= 2 && i.price > cheapest * 1.02) {
      const gbLabel = (gb: number) => gb === 45 ? 'Under 50 GB' : gb === 180 ? 'Under 200 GB' : gb === 1800 ? 'Under 2 TB' : 'More than 2 TB';
      qs.push({ key: 'storage', title: `How much of your ${i.name} storage do you use?`, answer: i.storageUsedGb !== undefined ? gbLabel(i.storageUsedGb) : passed.has(sk) ? 'Not sure' : undefined,
        body: (
          <>
            <List value={i.storageUsedGb === undefined ? undefined : String(i.storageUsedGb)} options={[{ value: '45', label: 'Under 50 GB' }, { value: '180', label: 'Under 200 GB' }, { value: '1800', label: 'Under 2 TB' }, { value: '2500', label: 'More than 2 TB' }, { value: 'skip', label: 'Not sure' }]}
              onPick={(v) => answer(() => { if (v === 'skip') onPass(sk); else dispatch({ type: 'setNeeds', id: i.id, patch: { storageUsedGb: Number(v) } }); })} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Your phone shows it under Settings, your name, iCloud (or in the Google One app).</span>
          </>
        ) });
    }
  }
  if (i.category === 'membership') {
    qs.push({ key: 'visits', title: 'How many times a month do you go?', answer: typeof i.visitsPerMonth === 'number' ? `${i.visitsPerMonth} a month` : undefined,
      body: (
        <div className="chk-inline">
          <Stepper value={visits} onChange={setVisits} />
          <button type="button" className="btn chk-ok" onClick={() => answer(() => dispatch({ type: 'setVisits', id: i.id, visits }))}>Continue</button>
        </div>
      ) });
    const contractLabel = i.contract === 'none' ? 'Yes, monthly' : i.contract === 'unsure' ? 'Not sure' : i.contract === 'contract' ? (i.contractEnds ? `Contract to ${monthLabel(i.contractEnds)}` : undefined) : undefined;
    qs.push({ key: 'contract', title: 'Can you cancel any time?', answer: contractLabel,
      body: (
        <>
          <List value={i.contract} options={[{ value: 'none', label: 'Yes, monthly' }, { value: 'contract', label: 'Contract' }, { value: 'unsure', label: 'Not sure' }]}
            onPick={(c) => (c === 'contract' ? dispatch({ type: 'setContract', id: i.id, contract: c }) : answer(() => dispatch({ type: 'setContract', id: i.id, contract: c })))} />
          {i.contract === 'contract' && (
            <select className="chk-select" aria-label="Contract ends" value={i.contractEnds ?? ''}
              onChange={(e) => answer(() => dispatch({ type: 'setContract', id: i.id, contract: 'contract', contractEnds: e.target.value }))}>
              <option value="">It ends in…</option>
              {nextMonths(25).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </>
      ) });
    const k = `${i.id}:single`;
    qs.push({ key: 'single', title: 'Price of one visit (optional)', answer: i.singleVisitPrice ? formatMoney(i.singleVisitPrice, i.currency) : passed.has(k) ? 'Skipped' : undefined,
      body: (
        <div className="chk-inline">
          <div className="field" style={{ maxWidth: 170 }}>
            <span className="m" style={{ color: 'var(--muted)' }}>{i.currency}</span>
            <input className="m" inputMode="decimal" value={single} placeholder="—" aria-label="Price of one visit" onChange={(e) => setSingle(e.target.value)} />
          </div>
          <button type="button" className="btn chk-ok" onClick={() => answer(() => { const v = Number(single.replace(',', '.')); if (v > 0) dispatch({ type: 'setSingleVisit', id: i.id, price: v }); onPass(k); })}>
            {single.trim() ? 'Continue' : 'Skip'}
          </button>
        </div>
      ) });
  }
  if (i.category === 'bill') {
    const cmp = { thisYear: 'This year', overAYear: 'Over a year', never: 'Never' } as const;
    qs.push({ key: 'bill', title: 'When did you last compare offers?', answer: i.compareState ? cmp[i.compareState] : undefined,
      body: <List value={i.compareState} options={[{ value: 'thisYear', label: 'This year' }, { value: 'overAYear', label: 'Over a year' }, { value: 'never', label: 'Never' }]}
        onPick={(c) => answer(() => dispatch({ type: 'setCompareState', id: i.id, compareState: c }))} /> });
  }

  const current = editing ?? qs.find((q) => q.answer === undefined)?.key;
  const complete = current === undefined;

  // When the last open question gets its answer, move on by itself.
  useEffect(() => {
    if (complete && justAnswered.current) {
      justAnswered.current = false;
      setTimeout(() => completeRef.current(), 380);
    }
  }, [complete]);

  return (
    <>
      <h1 className="chk-name">{i.name}</h1>
      <div className="chk-price">
        {formatMoney(i.price, i.currency)} {per} · {formatMoney(yearlyCost(i), i.currency)} a year
        <button type="button" className="ghost chk-link" onClick={() => setEditPrice(!editPrice)}>{editPrice ? 'Done' : 'Change price'}</button>
      </div>
      {editPrice && (
        <div className="chk-inline" style={{ marginTop: 10 }}>
          <Stepper value={i.price} step={1} format={(v) => formatMoney(v, i.currency)} onChange={(v) => dispatch({ type: 'setPrice', id: i.id, price: v })} />
          <Seg value={i.frequency === 'yearly' ? 'yearly' : 'monthly'} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]}
            onChange={(f) => dispatch({ type: 'setFrequency', id: i.id, frequency: f })} />
        </div>
      )}

      <div className="chk-qs">
        {qs.map((q) => {
          if (q.key === current) return (
            <div key={q.key} className="chk-q chk-reveal">
              <h2 className="chk-title">{q.title}</h2>
              {q.body}
            </div>
          );
          if (q.answer === undefined) return null;
          return (
            <button key={q.key} type="button" className="chk-done" onClick={() => setEditing(q.key)}>
              <span>{q.title}</span>
              <b>{q.answer}</b>
              <em>Change</em>
            </button>
          );
        })}
      </div>
    </>
  );
}

function CompareCard({ items, onPicked }: { items: Item[]; onPicked: () => void }) {
  const { dispatch } = useStore();
  const value = compareValue(items);
  const set = (v: string) => {
    for (const i of items) dispatch({ type: 'setPreferredInOverlap', id: i.id, preferred: v });
    setTimeout(onPicked, 380);
  };
  return (
    <>
      <h1 className="chk-name chk-name--q">{items.length === 2 ? `${items[0]!.name} or ${items[1]!.name}?` : 'They do the same job.'}</h1>
      <p className="chk-price">{items.length === 2 ? 'They do the same job. Which would you keep?' : 'Which would you keep?'}</p>
      <div className={`chk-tiles${items.length > 2 ? ' many' : ''}`} role="radiogroup">
        {items.map((i) => (
          <button key={i.id} type="button" role="radio" aria-checked={value === i.id} className={value === i.id ? 'on' : ''} onClick={() => set(i.id)}>
            <span className="chk-tiles__tick" aria-hidden="true">{value === i.id ? <Tick /> : null}</span>
            <b>{i.name}</b>
            <span>{formatMoney(i.price, i.currency)} {i.frequency === 'yearly' ? 'a year' : 'a month'}</span>
          </button>
        ))}
      </div>
      <List value={value === 'same' ? 'same' : undefined} options={[{ value: 'same', label: 'Keep both' }]} onPick={set} />
    </>
  );
}

function summary(i: Item): string {
  if (i.category === 'digital') {
    const use = i.usage === 'always' ? 'Every week' : i.usage === 'sometimes' ? (i.wouldMiss ? 'Sometimes, would miss it' : 'Sometimes, wouldn’t miss it') : i.usage === 'almostNever' ? 'Almost never' : '';
    return [use, i.planName, i.watchAtOnce ? (i.watchAtOnce === 1 ? 'just me' : `${i.watchAtOnce === 4 ? '3+' : i.watchAtOnce} at once`) : '', i.householdOwn ? 'second account at home' : ''].filter(Boolean).join(' · ');
  }
  if (i.category === 'membership') return [`${i.visitsPerMonth} visits a month`, i.contract === 'contract' ? `contract to ${i.contractEnds ? monthLabel(i.contractEnds) : '?'}` : i.contract === 'unsure' ? 'contract unsure' : i.contract === 'none' ? 'monthly' : ''].filter(Boolean).join(' · ');
  if (i.category === 'bill') return isUtility(i) ? 'Fixed cost' : i.compareState === 'thisYear' ? 'Compared this year' : i.compareState === 'overAYear' ? 'Compared over a year ago' : 'Never compared';
  return '';
}

function Review({ groups, onEdit }: { groups: Array<Group & { items: Item[] }>; onEdit: (stepId: string) => void }) {
  return (
    <div className="chk-card chk-in-fwd">
      <span className="lab">Step 2 · Check</span>
      <h1 className="chk-name">All set</h1>
      <p className="chk-price">Tap anything to change it.</p>
      {groups.map((g) => {
        const choice = g.compare && g.items.length >= 2 ? compareValue(g.items) : undefined;
        return (
          <section key={g.key} className="chk-review" aria-label={g.title}>
            <span className="lab">{g.title}</span>
            <div className="chk-list">
              {g.compare && g.items.length >= 2 && (
                <button type="button" onClick={() => onEdit(`cmp:${g.key}`)}>
                  <span className="chk-list__label">Would keep<small>{choice === undefined ? 'Not answered' : choice === 'same' ? 'Both' : g.items.find((x) => x.id === choice)?.name}</small></span>
                  <span className="chk-list__go" aria-hidden="true">›</span>
                </button>
              )}
              {g.items.map((i) => {
                const fixed = i.category === 'bill' && isUtility(i);
                return (
                  <button key={i.id} type="button" disabled={fixed} onClick={() => onEdit(i.id)}>
                    <span className="chk-list__label">{i.name}<small>{rowAnswered(i) ? summary(i) : 'Skipped'}</small></span>
                    {!fixed && <span className="chk-list__go" aria-hidden="true">›</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <div style={{ height: 16 }} />
    </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function nextMonths(n: number): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    return { value: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) };
  });
}
