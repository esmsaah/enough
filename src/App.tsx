import { StoreProvider, useStore } from './app/store';
import { AnythingElse } from './screens/AnythingElse';
import { CutList } from './screens/CutList';
import { GoodShape } from './screens/GoodShape';
import { Landing } from './screens/Landing';
import { AddStatement } from './screens/AddStatement';
import { WhatWeKeep } from './screens/WhatWeKeep';
import { FoundItems } from './screens/FoundItems';
import { QuickStart } from './screens/QuickStart';
import { Result } from './screens/Result';
import { Usage } from './screens/Usage';
import { EmailShare } from './screens/EmailShare';
import { DesktopHeader } from './components/DesktopHeader';
import { DesktopReceipt } from './components/DesktopReceipt';

function Flow() {
  const { state, audit } = useStore();
  switch (state.step) {
    case 'landing':
      return <Landing />;
    case 'picks': // legacy step removed from the flow; land on the full Pick list
    case 'quickstart':
      return <QuickStart />;
    case 'addstatement':
      return <AddStatement />;
    case 'keep':
      return <WhatWeKeep />;
    case 'found':
      return <FoundItems />;
    case 'anythingElse':
      return <AnythingElse />;
    case 'usage':
      return <Usage />;
    case 'result':
      // No actionable saving over the threshold → good shape, no paywall (§8b).
      return audit.paywall ? <Result /> : <GoodShape />;
    case 'cutlist':
      return <CutList />;
    case 'emailShare':
      return <EmailShare />;
    default:
      return <Landing />;
  }
}

export function App() {
  return (
    <StoreProvider>
      <AppFrame />
    </StoreProvider>
  );
}

function AppFrame() {
  const { state } = useStore();
  const showDesktopHeader = state.step !== 'landing';
  // Desktop side receipt: from the Pick step on (on Pick it lists picks as "to check", no total).
  const showReceipt = ['quickstart', 'picks', 'addstatement', 'keep', 'found', 'usage', 'anythingElse', 'cutlist'].includes(state.step);
  return (
    <div className={`app${showReceipt ? ' app--with-receipt' : ''}${state.step === 'landing' ? ' app--landing' : ''}`}>
      {showDesktopHeader && <DesktopHeader />}
      <main className="app-content"><Flow /></main>
      {showReceipt && <DesktopReceipt />}
    </div>
  );
}
