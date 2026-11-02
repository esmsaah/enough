// Screen — Full cut list (after unlock). The year's total after every change,
// then the changes grouped by what to do (Cancel / Change / Rotate / Get back),
// each with a one-line how-to, and the hidden costs shown but never counted.
import { resetStatements } from '../app/statementImport';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { clearEverything } from '../app/storage';
import { FlowHeader } from '../components/board';
import { AdviceList } from '../components/AdviceList';
import { Discoveries } from '../components/Discoveries';
import { isExactAmount } from '../engine/score';
import type { ActionType, Audit, HiddenCost, Item, Recommendation } from '../engine/types';
import { calendarEvents, howToFor, moneyPlan, toIcs } from '../engine/howto';
import { EMAIL_ENABLED } from '../app/features';
import { pickForTarget } from '../engine/target';
import { useState } from 'react';
import { yearlyCost } from '../engine/score';

const GROUPS: Array<{ label: string; actions: ActionType[] }> = [
  { label: 'Cancel', actions: ['cancel'] },
  { label: 'Change', actions: ['payPerVisit', 'removeOverlap', 'switchYearly', 'familyPlan', 'compareOffers'] },
  { label: 'Rotate', actions: ['rotate'] },
  { label: 'Get back', actions: ['checkRefund'] },
];

const HIDDEN_SUBLABEL: Record<HiddenCost['kind'], string> = {
  fx: 'Foreign-currency card fees',
  bankFee: 'Bank account fee',
  habit: 'Habit',
  cash: 'Paid in cash',
  smallSubs: 'Under €5 each',
  priceAboveCatalog: 'Above the typical price',
};

export function CutList() {
  const { state, audit, dispatch } = useStore();
  const cur = audit.currency;
  const itemById = new Map(audit.items.map((i) => [i.id, i]));
  const after = Math.max(0, audit.grandYearlyTotal - audit.potentialYearlySaving);

  return (
    <div className="board">
      <FlowHeader step={4} onBack={() => dispatch({ type: 'goto', step: 'result' })} />

      <section style={{ flexShrink: 0, background: 'var(--navy)', color: 'var(--white)', padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="lab" style={{ color: 'var(--muted-on-navy)' }}>Thank you. Here's everything.</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 56, lineHeight: 0.9, fontWeight: 800, fontStretch: '118%', letterSpacing: '-2px' }}>{formatMoney(after, cur)}</span>
          <span style={{ fontSize: 16, color: 'var(--muted-on-navy)' }}>a year, after every change</span>
        </div>
        {audit.potentialYearlySaving > 0 && (
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            You keep <span style={{ background: 'var(--lime)', color: 'var(--navy)', padding: '0 8px', borderRadius: 3 }}>{formatMoney(audit.potentialYearlySaving, cur)}</span> a year.
          </span>
        )}
        {(() => {
          const plan = moneyPlan(audit);
          return plan ? <span style={{ fontSize: 15, color: 'var(--muted-on-navy)' }}>That's {plan.months} months of your {plan.name}, paid by things you don't need.</span> : null;
        })()}
      </section>

      <div className="flow-body flow-col" style={{ padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <TargetTool />

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', alignItems: 'baseline' }}>
          <span className="tag ex">EXACT</span> from your statement <span className="tag es">ESTIMATE</span> from your answers
        </div>

        {GROUPS.map((g) => {
          const recs = audit.recommendations.filter((r) => g.actions.includes(r.action) && r.verdict !== 'keep');
          if (recs.length === 0) return null;
          const total = recs.reduce((s, r) => s + r.potentialYearlySaving, 0);
          return (
            <section key={g.label} style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="lab">{g.label}</span>
              <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
                <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{recs.length} {recs.length === 1 ? 'item' : 'items'}</span>
                <span className="m" style={{ fontSize: 15 }}>+{formatMoney(total, cur)}</span>
              </div>
              {recs.map((r) => <Row key={r.itemId} rec={r} item={itemById.get(r.itemId)} reason={state.analystNotes[r.itemId]?.reason ?? r.reason} cur={cur} audit={audit} />)}
            </section>
          );
        })}

        {(() => {
          const kept = audit.recommendations.filter((r) => r.verdict === 'keep');
          if (!kept.length) return null;
          return (
            <section style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="lab">Keep</span>
              <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
                <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{kept.length} {kept.length === 1 ? 'item' : 'items'}</span>
                <span className="m" style={{ fontSize: 15 }}>{formatMoney(kept.reduce((s, r) => s + r.yearlyCost, 0), cur)} a year</span>
              </div>
              {kept.map((r) => {
                const it = itemById.get(r.itemId);
                return (
                  <div key={r.itemId} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="r"><span style={{ fontSize: 16, fontWeight: 600 }}>{it?.name ?? 'Item'}</span><span className="m" style={{ fontSize: 15 }}>{formatMoney(it ? yearlyCost(it) : r.yearlyCost, cur)}</span></div>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>{state.analystNotes[r.itemId]?.reason ?? r.reason}</span>
                  </div>
                );
              })}
            </section>
          );
        })()}

        <Discoveries audit={audit} />

        <AdviceList advice={audit.advice} cur={cur} />

        {audit.hiddenCosts.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="lab">Hidden costs</span>
            <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>Shown, not counted</span>
              {audit.hiddenCostYearlyTotal > 0 && <span className="m" style={{ fontSize: 15 }}>{formatMoney(audit.hiddenCostYearlyTotal, cur)}</span>}
            </div>
            {audit.hiddenCosts.slice(0, 5).map((h, n) => (
              <div key={n} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 12, padding: '12px 0', borderTop: '1px solid var(--line)', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{h.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{HIDDEN_SUBLABEL[h.kind]}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  {h.yearly !== undefined && <span className="m" style={{ fontSize: 15 }}>{formatMoney(h.yearly, cur)}</span>}
                  <span className={`tag ${h.estimate ? 'es' : 'ex'}`}>{h.estimate ? 'ESTIMATE' : 'EXACT'}</span>
                </div>
              </div>
            ))}
            {audit.hiddenCosts.length > 5 && <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)' }}>+ {audit.hiddenCosts.length - 5} more</div>}
          </section>
        )}

        <CalendarButton audit={audit} cur={cur} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {EMAIL_ENABLED
            ? <button type="button" className="btn full" onClick={() => dispatch({ type: 'goto', step: 'emailShare' })}>Email me this list</button>
            : <button type="button" className="btn full" onClick={() => window.print()}>Save as PDF</button>}
          {!EMAIL_ENABLED && <span className="no-print" style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Choose "Save as PDF" in the print window. Your list stays on this device too.</span>}
          {!EMAIL_ENABLED && <button type="button" className="ghost" onClick={() => dispatch({ type: 'goto', step: 'emailShare' })}>Make my share card</button>}
          <button type="button" className="ghost" style={{ color: 'var(--muted)' }}
            onClick={async () => { await clearEverything(); resetStatements(); dispatch({ type: 'reset' }); }}>
            Delete everything
          </button>
        </div>
      </div>
    </div>
  );
}

/** Brief §7: "To save around €X a month, start with A and B." */
function TargetTool() {
  const { audit } = useStore();
  const cur = audit.currency;
  const [target, setTarget] = useState('');
  const n = Number(target.replace(',', '.'));
  const pick = n > 0 ? pickForTarget(audit.recommendations, n) : undefined;
  const names = pick?.ids.map((id) => audit.items.find((i) => i.id === id)?.name ?? '').filter(Boolean) ?? [];
  if (!audit.recommendations.some((r) => r.potentialYearlySaving > 0)) return null;
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    <section style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor="target" style={{ fontWeight: 700 }}>How much do you want to save a month?</label>
      <div className="field" style={{ maxWidth: 200 }}>
        <span className="m" style={{ color: 'var(--muted)' }}>{cur}</span>
        <input id="target" className="m" inputMode="decimal" placeholder="20" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      {pick && <span style={{ fontSize: 15, lineHeight: 1.5 }}>To save around {formatMoney(pick.monthly, cur)} a month, start with <strong>{list}</strong>.</span>}
    </section>
  );
}

function CalendarButton({ audit, cur }: { audit: Audit; cur: string }) {
  const events = calendarEvents(audit, (n) => formatMoney(n, cur));
  const download = () => {
    const url = URL.createObjectURL(new Blob([toIcs(events)], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'enough-reminders.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="no-print" style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 17, fontWeight: 700 }}>Let the plan run itself</span>
      <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
        {events.length} {events.length === 1 ? 'reminder' : 'reminders'} for the next year: every cancel deadline{audit.recommendations.some((r) => r.action === 'rotate') ? ', every streaming pause and restart' : ''} and one check-up in a year. Works with Apple, Google and Outlook calendars.
      </span>
      <button type="button" className="btn btn--secondary" onClick={download}>Add reminders to my calendar</button>
    </section>
  );
}

function Row({ rec, item, reason, cur, audit }: { rec: Recommendation; item?: Item; reason: string; cur: string; audit: Audit }) {
  const { dispatch } = useStore();
  const exact = item ? isExactAmount(item) : false;
  const how = item ? howToFor(rec, item, audit, (n) => formatMoney(n, cur)) : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div className="r">
        <span style={{ fontSize: 17, fontWeight: 700 }}>{item?.name ?? 'Item'}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          {rec.potentialYearlySaving > 0 && <span className="m" style={{ fontSize: 15, color: 'var(--indigo)' }}>+{formatMoney(rec.potentialYearlySaving, cur)}</span>}
          <span className={`tag ${exact ? 'ex' : 'es'}`}>{exact ? 'EXACT' : 'ESTIMATE'}</span>
        </span>
      </div>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
        {reason}
      </span>
      {how && how.steps.length > 0 && (
        <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {how.steps.map((s, n) => <li key={n}>{s}</li>)}
        </ol>
      )}
      {how?.link && <a href={how.link} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600 }}>Open the {item?.name} account page</a>}
      {how?.deadline && <span style={{ fontSize: 13, color: 'var(--ink)' }}><strong>When:</strong> {how.deadline}</span>}
      {item && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!item.done} onChange={() => dispatch({ type: 'toggleDone', id: item.id })} /> Done
        </label>
      )}
    </div>
  );
}
