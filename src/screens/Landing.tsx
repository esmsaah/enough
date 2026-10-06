// Screen 1 — Landing. Section 8. Two clear paths into the audit.
import { useStore } from '../app/store';
import { Button } from '../components/ui';

export function Landing() {
  const { dispatch } = useStore();
  return (
    <div className="screen screen--navy on-navy">
      <p className="muted mono">ENOUGH</p>
      <h1>Audit what you pay for, once.</h1>
      <p className="muted">
        Find what to cut, pause or keep. We never see your statement — everything happens on your phone.
      </p>

      <div className="stack" style={{ marginTop: 28 }}>
        <Button variant="primary" full onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>
          I have a bank statement
        </Button>
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>
          I'll tap what I pay for
        </Button>
      </div>
    </div>
  );
}
