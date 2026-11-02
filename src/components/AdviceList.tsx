// Advice worth acting on that is never counted as money found: bills to compare,
// a cheaper plan, habits shown as a yearly total (value doc levers 7, 9, 11).
import { formatMoney } from '../app/money';
import type { Advice } from '../engine/types';
import { howToForAdvice } from '../engine/howto';

const SUBLABEL: Record<Advice['kind'], string> = {
  compareOffers: 'Compare offers',
  cheaperPlan: 'Cheaper plan',
  habit: 'Habit',
  sharePlan: 'Share one plan',
  spending: 'From your statement',
};

export function AdviceList({ advice, cur }: { advice: Advice[]; cur: string }) {
  if (advice.length === 0) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="lab">Worth a look</span>
      <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
        <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{advice.length} {advice.length === 1 ? 'tip' : 'tips'}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Not counted in money found</span>
      </div>
      {advice.map((a) => (
        <div key={a.kind + a.itemId} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
          <div className="r">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{a.name}</span>
              <span style={{ fontSize: 13, color: 'var(--indigo)', fontWeight: 600 }}>{SUBLABEL[a.kind]}</span>
            </span>
            {a.yearly !== undefined && <span className="m" style={{ fontSize: 15 }}>{formatMoney(a.yearly, cur)} a year</span>}
          </div>
          <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>{a.note}</span>
          {howToForAdvice(a) && <span style={{ fontSize: 14, lineHeight: 1.5 }}>{howToForAdvice(a)}</span>}
        </div>
      ))}
    </section>
  );
}
