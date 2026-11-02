// Screen — Check (step 2). All services on one screen, grouped (Streaming, Music,
// Cloud, Gym, Bills…). Each row asks one main question with three buttons; extra
// questions open under a row only when they can change the result (a cheaper
// plan exists, more screens than needed, a shared plan, a gym contract). One
// comparison per overlap group ("which do you use more?") replaces per-item
// guessing. Answered rows fold into a one-line summary.
import { useEffect, useState } from 'react';
import { formatMoney } from '../app/money';
import { itemsNeedingUsage } from '../app/state';
import { useStore } from '../app/store';
import { FlowHeader, Seg, Stepper } from '../components/board';
import { isUtility, yearlyCost } from '../engine/score';
import type { Item } from '../engine/types';
import { personalPlans, planShape } from '../app/localPrices';
import { guessCountry } from '../app/country';
import { convert } from '../engine/rates';

type Group = { key: string; title: string; compare?: boolean; match: (i: Item) => boolean };

const isYtp = (i: Item) => i.merchantKey === 'youtube premium' || /youtube\s*premium/i.test(i.name);
const GROUPS: Group[] = [
  { key: 'music', title: 'Music', compare: true, match: (i) => i.overlapGroup === 'music' || isYtp(i) },
  { key: 'video', title: 'Streaming', match: (i) => i.overlapGroup === 'video' },
  { key: 'cloud', title: 'Cloud & storage', compare: true, match: (i) => i.overlapGroup === 'cloud' || i.displayCategory === 'Cloud & Storage' },
  { key: 'ai', title: 'AI & software', compare: true, match: (i) => i.overlapGroup === 'ai' || i.displayCategory === 'AI & Software' },
  { key: 'digital', title: 'Other subscriptions', match: (i) => i.category === 'digital' },
  { key: 'membership', title: 'Gym, clubs & lessons', match: (i) => i.category === 'membership' },
  { key: 'bill', title: 'Bills', match: (i) => i.category === 'bill' },
];

/** Answered = the main question for this kind of item has an answer. */
export function rowAnswered(i: Item): boolean {
  if (i.category === 'digital') return !!i.usage && (i.usage !== 'sometimes' || typeof i.wouldMiss === 'boolean');
  if (i.category === 'membership') return typeof i.visitsPerMonth === 'number';
  if (i.category === 'bill') return isUtility(i) || !!i.compareState;
  return true;
}

export function Usage() {
  const { state, dispatch, audit } = useStore();
  const items = itemsNeedingUsage(state.items);
  const country = state.country ?? guessCountry();

  // Place every item in its first matching group.
  const placed = new Set<string>();
  const groups = GROUPS.map((g) => {
    const list = items.filter((i) => !placed.has(i.id) && g.match(i));
    list.forEach((i) => placed.add(i.id));
    return { ...g, items: list };
  }).filter((g) => g.items.length);
  const ordered = groups.flatMap((g) => g.items);
  const firstOpen = ordered.find((i) => !rowAnswered(i))?.id;
  const [openId, setOpenId] = useState<string | undefined>(firstOpen);

  useEffect(() => {
    if (items.length === 0) dispatch({ type: 'goto', step: 'anythingElse' });
  }, [items.length, dispatch]);
  if (items.length === 0) return null;

  const done = ordered.filter(rowAnswered).length;
  const answered = new Set(ordered.filter(rowAnswered).map((x) => x.id));
  const foundSoFar = audit.recommendations.filter((r) => answered.has(r.itemId)).reduce((sum, r) => sum + r.potentialYearlySaving, 0);

  /** Close this row and open the next one that still needs an answer. */
  const advanceFrom = (id: string) => {
    const at = ordered.findIndex((i) => i.id === id);
    const next = [...ordered.slice(at + 1), ...ordered.slice(0, at)].find((i) => i.id !== id && !rowAnswered(i));
    setOpenId(next?.id);
  };

  const finish = () => {
    for (const i of ordered) if (rowAnswered(i)) dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
    dispatch({ type: 'goto', step: 'anythingElse' });
  };

  return (
    <div className="board">
      <FlowHeader step={2} onBack={() => dispatch({ type: 'goto', step: state.statement ? 'found' : 'quickstart' })} />
      <div className="flow-body flow-col" style={{ padding: '8px 20px 0' }}>
        <span className="lab">Step 2 · Check</span>
        <h1 className="h1" style={{ fontSize: 32, marginTop: 10 }}>How do you use them?</h1>
        <p className="sub" style={{ marginTop: 8 }}>One tap each. A few open a short follow-up when it can save you money.</p>
        <div className="r" style={{ marginTop: 14, fontSize: 14 }}>
          <span><b>{done}</b> of {ordered.length} answered</span>
          <span className="m">found so far <span style={{ background: 'var(--lime)', padding: '0 6px', borderRadius: 3 }}>{formatMoney(foundSoFar, audit.currency)}</span> a year</span>
        </div>
        <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginTop: 8 }} aria-hidden="true">
          <div style={{ width: `${(done / ordered.length) * 100}%`, height: '100%', background: 'var(--indigo)', borderRadius: 2, transition: 'width .2s' }} />
        </div>

        {groups.map((g) => (
          <section key={g.key} style={{ marginTop: 26, display: 'flex', flexDirection: 'column' }} aria-label={g.title}>
            <span className="lab">{g.title}</span>
            {g.compare && g.items.length >= 2 && <CompareQuestion items={g.items} />}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', background: 'var(--paper)', overflow: 'hidden' }}>
              {g.items.map((i, n) => (
                <Row key={i.id} item={i} first={n === 0} open={openId === i.id} country={country}
                  onOpen={() => setOpenId(openId === i.id ? undefined : i.id)} onDone={() => advanceFrom(i.id)} />
              ))}
            </div>
          </section>
        ))}
        <div style={{ height: 24 }} />
      </div>

      <div className="flow-foot flow-col" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', borderTop: 0 }}>
        <button type="button" className="btn" onClick={finish}>{done === ordered.length ? 'Next' : `Next (${ordered.length - done} left unanswered)`}</button>
        {done < ordered.length && <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Unanswered ones stay in your total, without advice.</span>}
      </div>
    </div>
  );
}

/** "Which do you use more?" asked once for a group of services that do the same job. */
function CompareQuestion({ items }: { items: Item[] }) {
  const { dispatch } = useStore();
  const value = items.map((i) => i.preferredInOverlap).find((p) => p !== undefined);
  const set = (v: string) => { for (const i of items) dispatch({ type: 'setPreferredInOverlap', id: i.id, preferred: v }); };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 600, margin: '4px 0 8px' }}>{items.length === 2 ? `${items[0]!.name} or ${items[1]!.name}: which would you keep?` : 'They do the same job. Which would you keep?'}</div>
      <Seg value={value} options={[...items.map((i) => ({ value: i.id, label: i.name })), { value: 'same', label: 'Both' }]} onChange={set} />
    </div>
  );
}

function summary(i: Item): string {
  if (i.category === 'digital') {
    const use = i.usage === 'always' ? 'Every week' : i.usage === 'sometimes' ? (i.wouldMiss ? 'Sometimes, would miss it' : 'Sometimes, wouldn’t miss it') : i.usage === 'almostNever' ? 'Almost never' : '';
    return [use, i.planName, i.watchAtOnce ? (i.watchAtOnce === 1 ? 'just me' : `${i.watchAtOnce === 4 ? '3+' : i.watchAtOnce} at once`) : '', i.householdOwn ? 'second account at home' : ''].filter(Boolean).join(' · ');
  }
  if (i.category === 'membership') return [`${i.visitsPerMonth} visits a month`, i.contract === 'contract' ? `contract to ${i.contractEnds ?? '?'}` : i.contract === 'unsure' ? 'contract unsure' : i.contract === 'none' ? 'monthly' : ''].filter(Boolean).join(' · ');
  if (i.category === 'bill') return isUtility(i) ? 'Fixed cost' : i.compareState === 'thisYear' ? 'Compared this year' : i.compareState === 'overAYear' ? 'Compared over a year ago' : 'Never compared';
  return '';
}

function Row({ item: i, first, open, country, onOpen, onDone }: { item: Item; first: boolean; open: boolean; country: string; onOpen: () => void; onDone: () => void }) {
  const { dispatch } = useStore();
  const [editPrice, setEditPrice] = useState(false);
  const answered = rowAnswered(i);
  const per = i.frequency === 'yearly' ? 'a year' : i.frequency === 'weekly' ? 'a week' : 'a month';
  const plans = i.category === 'digital' && i.merchantKey ? personalPlans(i.merchantKey, country) : [];
  const shape = planShape(i.merchantKey, country);
  const inItemCur = (p: { monthly: number; currency: string }) => (p.currency === i.currency ? p.monthly : convert(p.monthly, p.currency, i.currency) ?? p.monthly);
  const planShown = i.planName ?? plans.find((p) => Math.abs(inItemCur(p) - i.price) <= Math.max(0.06, i.price * 0.02))?.name;
  const keeps = i.usage === 'always' || (i.usage === 'sometimes' && i.wouldMiss === true);
  // Follow-ups only where the answer can change the advice.
  const askPlan = keeps && plans.length >= 2;
  const askPeople = keeps && shape.screens;
  const askHome = keeps && shape.shared;
  const hasFollowUps = i.category === 'membership' || askPlan || askPeople || askHome;

  // Auto-advance when the main answer is in and there is nothing more worth asking.
  const answerMain = (apply: () => void, willNeedMore: boolean) => {
    apply();
    dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
    if (!willNeedMore) setTimeout(onDone, 250);
  };

  return (
    <div style={{ borderTop: first ? 0 : '1px solid var(--line)' }}>
      <button type="button" onClick={onOpen} aria-expanded={open}
        style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', minHeight: 56, padding: '10px 14px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{answered && !open ? '✓ ' : ''}{i.name}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {answered && !open ? summary(i) : open ? (i.displayCategory === 'Bills & Utilities' ? 'Bill' : i.displayCategory) : `${formatMoney(i.price, i.currency)} ${per}`}
          </span>
        </span>
        <span className="m" style={{ fontSize: 13, color: 'var(--muted)' }}>{open ? '' : answered ? 'Edit' : 'Answer'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {formatMoney(i.price, i.currency)} {per} · {formatMoney(yearlyCost(i), i.currency)} a year{' '}
            <button type="button" className="ghost" style={{ minHeight: 32, padding: 0, fontSize: 13 }} onClick={() => setEditPrice(!editPrice)}>{editPrice ? 'Done' : 'Change price'}</button>
          </div>
          {editPrice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Stepper value={i.price} step={1} format={(v) => formatMoney(v, i.currency)} onChange={(v) => dispatch({ type: 'setPrice', id: i.id, price: v })} />
              <Seg value={i.frequency === 'yearly' ? 'yearly' : 'monthly'} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]}
                onChange={(f) => dispatch({ type: 'setFrequency', id: i.id, frequency: f })} />
            </div>
          )}

          {i.category === 'digital' && (
            <>
              <Seg value={i.usage} options={[{ value: 'always', label: 'Every week' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'almostNever', label: 'Almost never' }]}
                onChange={(u) => answerMain(() => dispatch({ type: 'setUsage', id: i.id, usage: u }), u === 'sometimes' || (u === 'always' && (plans.length >= 2 || shape.screens || shape.shared)))} />
              {i.usage === 'sometimes' && (
                <Q label="Would you miss it?">
                  <Seg value={i.wouldMiss === undefined ? undefined : i.wouldMiss ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not really' }]}
                    onChange={(v) => answerMain(() => dispatch({ type: 'setWouldMiss', id: i.id, wouldMiss: v === 'yes' }), v === 'yes' && (plans.length >= 2 || shape.screens || shape.shared))} />
                </Q>
              )}
              {askPlan && (
                <Q label="Which plan do you have?">
                  <Seg value={planShown} options={plans.slice(0, 5).map((p) => ({ value: p.name, label: p.name.replace(/^Premium /, '') }))}
                    onChange={(name) => { const p = plans.find((x) => x.name === name); if (p) dispatch({ type: 'setPlan', id: i.id, planName: p.name, price: Math.round(inItemCur(p) * 100) / 100 }); }} />
                </Q>
              )}
              {askPeople && (
                <Q label="How many people watch at the same time?">
                  <Seg value={i.watchAtOnce === undefined ? undefined : String(i.watchAtOnce)} options={[{ value: '1', label: 'Just me' }, { value: '2', label: '2' }, { value: '4', label: '3 or more' }]}
                    onChange={(v) => dispatch({ type: 'setWatchAtOnce', id: i.id, n: Number(v) })} />
                </Q>
              )}
              {askHome && (
                <Q label={`Does someone at home pay for their own ${i.name}?`}>
                  <Seg value={i.householdOwn === undefined ? undefined : i.householdOwn ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                    onChange={(v) => dispatch({ type: 'setHouseholdOwn', id: i.id, value: v === 'yes' })} />
                </Q>
              )}
            </>
          )}

          {i.category === 'membership' && (
            <>
              <Q label="How many times a month do you go?">
                <Stepper value={i.visitsPerMonth ?? 0} onChange={(v) => dispatch({ type: 'setVisits', id: i.id, visits: v })} />
              </Q>
              <Q label="Can you cancel any time?">
                <Seg value={i.contract} options={[{ value: 'none', label: 'Yes, monthly' }, { value: 'contract', label: 'Contract' }, { value: 'unsure', label: 'Not sure' }]}
                  onChange={(c) => dispatch({ type: 'setContract', id: i.id, contract: c })} />
                {i.contract === 'contract' && (
                  <select aria-label="Contract ends" value={i.contractEnds ?? ''} style={{ marginTop: 8, minHeight: 44 }}
                    onChange={(e) => dispatch({ type: 'setContract', id: i.id, contract: 'contract', contractEnds: e.target.value })}>
                    <option value="">It ends in…</option>
                    {nextMonths(25).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                )}
              </Q>
              <Q label="Price of one visit (optional)">
                <div className="field" style={{ maxWidth: 170 }}>
                  <span className="m" style={{ color: 'var(--muted)' }}>{i.currency}</span>
                  <input className="m" inputMode="decimal" value={i.singleVisitPrice ?? ''} placeholder="—" aria-label="Price of one visit"
                    onChange={(e) => dispatch({ type: 'setSingleVisit', id: i.id, price: Number(e.target.value.replace(',', '.')) || 0 })} />
                </div>
              </Q>
            </>
          )}

          {i.category === 'bill' && !isUtility(i) && (
            <Q label="When did you last compare offers?">
              <Seg value={i.compareState} options={[{ value: 'thisYear', label: 'This year' }, { value: 'overAYear', label: 'Over a year' }, { value: 'never', label: 'Never' }]}
                onChange={(c) => answerMain(() => dispatch({ type: 'setCompareState', id: i.id, compareState: c }), false)} />
            </Q>
          )}
          {i.category === 'bill' && isUtility(i) && <span style={{ fontSize: 14, color: 'var(--muted)' }}>A fixed cost with one provider. It counts in your total, nothing to answer.</span>}

          {hasFollowUps && (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 18px' }}
              onClick={() => {
                if (i.category === 'membership' && typeof i.visitsPerMonth !== 'number') dispatch({ type: 'setVisits', id: i.id, visits: 0 });
                dispatch({ type: 'setPriceConfirmed', id: i.id, confirmed: true });
                onDone();
              }}>Done</button>
          )}
        </div>
      )}
    </div>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>{children}</div>;
}

function nextMonths(n: number): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    return { value: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) };
  });
}
