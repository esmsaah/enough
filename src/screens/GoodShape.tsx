// Screen — Good shape (step 4). Shown when nothing is worth cutting: the year's
// total, every item kept with its exact/estimate tag, and nothing to pay. The
// word "free" never appears.
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { FlowHeader, StatementIcon } from '../components/board';
import { isExactAmount, yearlyCost } from '../engine/score';

export function GoodShape() {
  const { state, audit, dispatch } = useStore();
  const cur = audit.currency;
  const kept = [...audit.items].sort((a, b) => yearlyCost(b) - yearlyCost(a));

  return (
    <div className="board">
      <FlowHeader step={4} onBack={() => dispatch({ type: 'goto', step: 'anythingElse' })} />

      <section style={{ flexShrink: 0, background: 'var(--navy)', color: 'var(--white)', padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="lab" style={{ color: 'var(--muted-on-navy)' }}>Your year in recurring costs</span>
        <span style={{ fontSize: 56, lineHeight: 0.9, fontWeight: 800, fontStretch: '118%', letterSpacing: '-2px' }}>{formatMoney(audit.yearlyTotal, cur)}</span>
        <span style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>You're in good shape.</span>
        <span style={{ fontSize: 15, color: 'var(--muted-on-navy)' }}>Everything is earning its place, so there's nothing to buy.</span>
      </section>

      <div className="flow-body flow-col" style={{ padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', alignItems: 'baseline' }}>
          <span className="tag ex">EXACT</span> from your statement <span className="tag es">ESTIMATE</span> from your answers
        </div>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="lab">Kept</span>
          <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{kept.length} {kept.length === 1 ? 'thing' : 'things'}</span>
            <span className="m" style={{ fontSize: 15 }}>{formatMoney(audit.yearlyTotal, cur)}</span>
          </div>
          {kept.map((i) => {
            const exact = isExactAmount(i);
            return (
              <div key={i.id} className="r" style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: 16 }}>{i.name}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span className="m" style={{ fontSize: 15 }}>{formatMoney(yearlyCost(i), cur)}</span>
                  <span className={`tag ${exact ? 'ex' : 'es'}`}>{exact ? 'EXACT' : 'ESTIMATE'}</span>
                </span>
              </div>
            );
          })}
        </section>

        <div className="r" style={{ borderTop: '1.5px solid var(--ink)', paddingTop: 12 }}>
          <span style={{ fontWeight: 700 }}>To pay</span>
          <span className="m" style={{ fontSize: 18 }}>{formatMoney(0, 'EUR')}</span>
        </div>

        {!state.statement && (
          <button type="button" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}
            style={{ border: '1.5px dashed var(--chip-border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}>
            <StatementIcon />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>Upload one statement to turn estimates into exact numbers.</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Optional. Read on your device.</span>
            </span>
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <button type="button" className="btn full" onClick={() => dispatch({ type: 'goto', step: 'emailShare' })}>Make my share card</button>
          <button type="button" className="ghost" onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>Add something I forgot</button>
        </div>
      </div>
    </div>
  );
}
