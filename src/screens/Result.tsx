// Screen — Result (step 4). The locked preview before paying: the year's total
// struck down to what's left, the money found (first change shown, the rest
// blurred), the €5.99 full-audit unlock, and a taste of the hidden costs.
import { AUDIT_PRICE_EUR, formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { FlowHeader, StatementIcon } from '../components/board';
import { isExactAmount } from '../engine/score';
import type { ActionType } from '../engine/types';

const ACTION_LABEL: Record<ActionType, string> = {
  keep: 'Keep',
  cancel: 'Cancel',
  rotate: 'Rotate month to month',
  switchYearly: 'Switch to yearly',
  payPerVisit: 'Pay per visit',
  removeOverlap: 'Drop the overlap',
  familyPlan: 'One or family plan',
  compareOffers: 'Compare offers',
  checkRefund: 'Check for a refund',
};

export function Result() {
  const { state, audit, dispatch } = useStore();
  const cur = audit.currency;
  const actionable = audit.recommendations
    .filter((r) => r.verdict !== 'keep')
    .sort((a, b) => b.potentialYearlySaving - a.potentialYearlySaving);
  const net = Math.max(0, audit.yearlyTotal - audit.potentialYearlySaving);
  const monthly = audit.yearlyTotal / 12;
  const lead = actionable[0];
  const leadItem = lead ? audit.items.find((i) => i.id === lead.itemId) : undefined;
  const moreChanges = Math.max(0, actionable.length - 1);
  const source = state.statement ? 'your statement and your answers' : 'your answers';

  return (
    <div className="board">
      <FlowHeader step={4} onBack={() => dispatch({ type: 'goto', step: 'anythingElse' })} />

      {/* Petrol headline — a big moment. */}
      <section style={{ flexShrink: 0, background: 'var(--navy)', color: 'var(--white)', padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="lab" style={{ color: 'var(--muted-on-navy)' }}>Your year in recurring costs</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 56, lineHeight: 0.9, fontWeight: 800, fontStretch: '118%', letterSpacing: '-3px', position: 'relative', display: 'inline-block' }}>
            {formatMoney(audit.yearlyTotal, cur)}
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', left: -4, top: 'calc(50% - 5px)', width: 'calc(100% + 8px)', height: 10, overflow: 'visible' }}>
              <path d="M1 6 C 18 3, 35 7, 55 4 S 88 3, 99 5" stroke="var(--coral-pen)" strokeWidth="2.4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--muted-on-navy)' }}>→ {formatMoney(net, cur)}</span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--muted-on-navy)' }}>{audit.items.length} things · {formatMoney(monthly, cur, { round: true })} a month · from {source}</span>
        {audit.potentialYearlySaving > 0 && (
          <span style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>
            You could keep <span style={{ background: 'var(--lime)', color: 'var(--navy)', padding: '0 8px', borderRadius: 3 }}>{formatMoney(audit.potentialYearlySaving, cur)}</span> a year.
          </span>
        )}
      </section>

      <div className="flow-body flow-col" style={{ padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Money found — first change shown, the rest blurred behind the paywall. */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="lab">Money found</span>
          <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{actionable.length} {actionable.length === 1 ? 'change' : 'changes'}</span>
            <span className="m" style={{ fontSize: 15 }}>+{formatMoney(audit.potentialYearlySaving, cur)}</span>
          </div>
          {lead && leadItem && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 12, padding: '12px 0', borderTop: '1px solid var(--line)', alignItems: 'baseline' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{leadItem.name}</span>
                <span style={{ fontSize: 13, color: 'var(--indigo)', fontWeight: 600 }}>{ACTION_LABEL[lead.action]}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span className="m" style={{ fontSize: 15 }}>+{formatMoney(lead.potentialYearlySaving, cur)}</span>
                <span className={`tag ${isExactAmount(leadItem) ? 'ex' : 'es'}`}>{isExactAmount(leadItem) ? 'EXACT' : 'ESTIMATE'}</span>
              </div>
            </div>
          )}
          {Array.from({ length: Math.min(3, moreChanges) }).map((_, n) => <SkeletonRow key={n} />)}
          {moreChanges > 0 && (
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <LockIcon />{moreChanges} more {moreChanges === 1 ? 'change' : 'changes'} in your full audit
            </div>
          )}
        </section>

        {/* Unlock the full audit — €5.99 once. */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="lab" style={{ color: 'var(--ink)' }}>Your full audit</span>
          <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>See exactly what to cut, and how.</span>
          <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>Steps for every item, a plan for the money and renewal reminders for a year.</span>
          <div className="r" style={{ borderTop: '1.5px solid var(--ink)', paddingTop: 12 }}>
            <span style={{ fontWeight: 700 }}>Once</span>
            <span style={{ fontSize: 28, fontWeight: 800, fontStretch: '118%' }}>{formatMoney(AUDIT_PRICE_EUR, 'EUR')}</span>
          </div>
          <button type="button" className="btn full" onClick={() => dispatch({ type: 'unlock' })}>Show my full cut list</button>
          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Pays for itself if you cut one thing. No subscription, obviously.</span>
        </div>

        {/* Hidden costs teaser. */}
        {audit.hiddenCosts.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="lab">Hidden costs</span>
            <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{audit.hiddenCosts.length} {audit.hiddenCosts.length === 1 ? 'cost' : 'costs'} that aren't subscriptions</span>
              {audit.hiddenCostYearlyTotal > 0 && <span className="m" style={{ fontSize: 15 }}>{formatMoney(audit.hiddenCostYearlyTotal, cur)}</span>}
            </div>
            <SkeletonRow /><SkeletonRow />
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <LockIcon />Fees, trials, cash and delivery, shown in your full audit
            </div>
          </section>
        )}

        {/* Turn estimates into exact numbers. */}
        {!state.statement && (
          <button type="button" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}
            style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}>
            <StatementIcon />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>Upload one statement to turn estimates into exact numbers.</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Optional. Read on your device.</span>
            </span>
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button type="button" className="ghost" onClick={() => dispatch({ type: 'goto', step: 'landing' })}>Not now</button>
          <button type="button" className="ghost" style={{ color: 'var(--muted)' }} onClick={() => dispatch({ type: 'reset' })}>Delete everything</button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 12, padding: '14px 0', borderTop: '1px solid var(--line)', alignItems: 'center' }} aria-hidden="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ width: 150, maxWidth: '60%', height: 11, borderRadius: 3, background: 'var(--line)' }} />
        <span style={{ width: 100, maxWidth: '40%', height: 8, borderRadius: 3, background: 'var(--line)' }} />
      </div>
      <span style={{ width: 64, height: 11, borderRadius: 3, background: 'var(--line)' }} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
