import { clearEverything } from '../app/storage';
import { useStore } from '../app/store';

const STAGES = ['Pick', 'Statement', 'Check', 'Usage', 'Result'] as const;

export function DesktopHeader() {
  const { state, dispatch } = useStore();
  const active = state.step === 'quickstart' || state.step === 'addstatement' ? 0
    : state.step === 'keep' || state.step === 'found' || state.step === 'anythingElse' ? 1
      : state.step === 'usage' ? 3 : state.step === 'result' || state.step === 'cutlist' || state.step === 'emailShare' ? 4 : 2;
  return (
    <header className="desktop-header">
      <button className="desktop-header__brand" onClick={() => dispatch({ type: 'goto', step: 'landing' })}>Enough.</button>
      <nav className="desktop-stages" aria-label="Audit progress">
        {STAGES.map((stage, index) => <div className={`desktop-stage ${index <= active ? 'desktop-stage--active' : ''}`} key={stage} aria-current={index === active ? 'step' : undefined}>
          <span />{index + 1} {stage}
        </div>)}
      </nav>
      <button className="desktop-header__delete" onClick={async () => { await clearEverything(); dispatch({ type: 'reset' }); }}>Delete everything</button>
    </header>
  );
}
