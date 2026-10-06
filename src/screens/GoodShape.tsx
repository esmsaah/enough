// Screen 8b — Good shape. Section 8. Shown when nothing is worth paying for.
// No payment. Offers a share line. The word "free" never appears.
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button } from '../components/ui';
import { ShareCard } from '../components/ShareCard';
import { AuditSections } from './AuditSections';

export function GoodShape() {
  const { state, audit, dispatch } = useStore();
  return (
    <div className="screen screen--navy on-navy">
      <p className="muted mono">YOUR AUDIT</p>
      <h1>You're in good shape.</h1>
      <p className="muted">
        We looked at {audit.items.length} {audit.items.length === 1 ? 'item' : 'items'} worth{' '}
        {formatMoney(audit.yearlyTotal, state.currency, { round: true })} a year and found nothing worth cutting. Nothing to pay.
      </p>

      <AuditSections />

      <ShareCard currency={audit.currency} goodShape />

      <div style={{ marginTop: 22 }}>
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>Add more and check again</Button>
      </div>
    </div>
  );
}
