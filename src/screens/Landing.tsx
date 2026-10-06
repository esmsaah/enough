// Screen 1 — Landing. Section 8. Two buttons; quick-pick path is the M1 route.
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
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>
          I have a bank statement
        </Button>
        <Button variant="primary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>
          I'll tap what I pay for
        </Button>
        <p className="muted center" style={{ fontSize: 13 }}>
          Reading a statement arrives next. For now, tap what you pay for.
        </p>
      </div>
    </div>
  );
}
