// Screen — Extras (step 3, "Anything we can't see?"). Optional one-off profile
// answers the statement can't show on the tap path: foreign-currency card fees,
// a monthly bank fee, delivery/taxi habits, a recent free trial, and cash costs.
// Each feeds the hidden-costs engine; all are skippable.
import { useState } from 'react';
import { CASH_CHIPS } from '../app/catalog';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { BoardChip, FlowHeader, Seg } from '../components/board';

const DELIVERY_AMOUNTS = [10, 15, 25];

export function AnythingElse() {
  const { state, dispatch } = useStore();
  const p = state.profile;
  const [openCash, setOpenCash] = useState<string | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const cashItems = p.cashItems ?? [];

  function addCash(label: string) {
    const monthly = Number(cashAmount);
    if (!monthly) return;
    dispatch({ type: 'setProfile', profile: { cashItems: [...cashItems.filter((c) => c.label !== label), { label, monthly }] } });
    setOpenCash(null);
    setCashAmount('');
  }

  return (
    <div className="board">
      <FlowHeader step={3} onBack={() => dispatch({ type: 'goto', step: 'usage' })} />
      <div className="flow-body flow-col" style={{ padding: '8px 20px 0' }}>
        <span className="lab">Step 3 · Extras</span>
        <h1 className="h1" style={{ fontSize: 36, marginTop: 12 }}>Anything we can't see?</h1>
        <p className="sub" style={{ marginTop: 12 }}>A few quick ones. Skip any of them.</p>

        <div style={{ marginTop: 16 }}>
          {/* Foreign currency */}
          <div className="q">
            <div className="t">Pay in another currency? <span>Card fees add up</span></div>
            <Seg value={p.foreignCurrency}
              options={[{ value: 'never', label: 'Never' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'often', label: 'Often' }]}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { foreignCurrency: v } })} />
          </div>

          {/* Bank fee */}
          <div className="q">
            <div className="t">Bank monthly fee?</div>
            <Seg value={p.bankFeeMonthly === undefined ? undefined : String(p.bankFeeMonthly)}
              options={[{ value: '0', label: 'No' }, { value: '2', label: '~€2' }, { value: '5', label: '~€5' }, { value: 'unknown', label: 'Not sure' }]}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { bankFeeMonthly: v === 'unknown' ? 'unknown' : (Number(v) as 0 | 2 | 5) } })} />
          </div>

          {/* Delivery / taxi */}
          <div className="q">
            <div className="t">Delivery or taxi?</div>
            <Seg value={p.delivery?.frequency}
              options={[{ value: 'never', label: 'Rarely' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'weekly', label: 'Weekly' }]}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { delivery: { frequency: v, ...(p.delivery?.typicalAmount ? { typicalAmount: p.delivery.typicalAmount } : {}) } } })} />
            {p.delivery && p.delivery.frequency !== 'never' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="lab" style={{ alignSelf: 'center', marginRight: 4 }}>Usually</span>
                {DELIVERY_AMOUNTS.map((a) => (
                  <BoardChip key={a} label={formatMoney(a, state.currency)} selected={p.delivery?.typicalAmount === a}
                    onClick={() => dispatch({ type: 'setProfile', profile: { delivery: { frequency: p.delivery!.frequency, typicalAmount: a } } })} />
                ))}
              </div>
            )}
          </div>

          {/* Recent trial */}
          <div className="q">
            <div className="t">Free trial lately?</div>
            <Seg value={p.recentTrials && p.recentTrials.length > 0 ? 'yes' : p.recentTrials ? 'no' : undefined}
              options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { recentTrials: v === 'yes' ? (p.recentTrials && p.recentTrials.length ? p.recentTrials : []) : [] } })} />
          </div>

          {/* Cash */}
          <div className="q">
            <div className="t">Paid in cash?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CASH_CHIPS.map((c) => {
                const added = cashItems.find((ci) => ci.label === c.name);
                return (
                  <BoardChip key={c.name} label={c.name} selected={!!added}
                    price={added ? `${formatMoney(added.monthly, state.currency)}/mo` : undefined}
                    onClick={() => {
                      if (added) { dispatch({ type: 'setProfile', profile: { cashItems: cashItems.filter((ci) => ci.label !== c.name) } }); return; }
                      setOpenCash(openCash === c.name ? null : c.name); setCashAmount('');
                    }} />
                );
              })}
            </div>
            {openCash && (
              <div className="field" style={{ maxWidth: 260 }}>
                <span className="m" style={{ color: 'var(--muted)' }}>{state.currency}</span>
                <input className="m" inputMode="decimal" autoFocus placeholder={`${openCash} a month`} value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCash(openCash); }} />
                <button type="button" className="btn" style={{ minHeight: 36, padding: '0 14px', fontSize: 14 }} disabled={!Number(cashAmount)} onClick={() => addCash(openCash)}>Add</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flow-foot flow-col" style={{ alignItems: 'center', gap: 4 }}>
        <button type="button" className="btn full" onClick={() => dispatch({ type: 'goto', step: 'result' })}>Show my result</button>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'goto', step: 'result' })}>Skip all</button>
      </div>
    </div>
  );
}
