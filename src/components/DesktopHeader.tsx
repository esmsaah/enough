import { clearEverything } from '../app/storage';
import { useStore } from '../app/store';

// Three steps only — the statement is a way IN to Pick, not its own step.
const STAGES = ['Pick', 'Usage', 'Result'] as const;

export function DesktopHeader() {
  const { state, dispatch } = useStore();
  const active = state.step === 'usage' ? 1
    : (state.step === 'result' || state.step === 'cutlist' || state.step === 'emailShare') ? 2
      : 0; // quickstart / addstatement / keep / found / anythingElse → Pick
  return (
    <header className="desktop-header">
      <button className="desktop-header__brand" onClick={() => dispatch({ type: 'goto', step: 'landing' })}>Enough<span className="desktop-header__dot">.</span></button>
      <nav className="desktop-stages" aria-label="Audit progress">
        {STAGES.map((stage, index) => <div className={`desktop-stage ${index <= active ? 'desktop-stage--active' : ''}`} key={stage} aria-current={index === active ? 'step' : undefined}>
          <span />{index + 1} {stage}
        </div>)}
      </nav>
      <button className="desktop-header__delete" onClick={async () => { await clearEverything(); dispatch({ type: 'reset' }); }}>Delete everything</button>
    </header>
  );
}
