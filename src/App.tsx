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

function Flow() {
  const { state, audit } = useStore();
  switch (state.step) {
    case 'landing':
      return <Landing />;
    case 'addstatement':
      return <AddStatement />;
    case 'keep':
      return <WhatWeKeep />;
    case 'found':
      return <FoundItems />;
    case 'quickstart':
      return <QuickStart />;
    case 'anythingElse':
      return <AnythingElse />;
    case 'usage':
      return <Usage />;
    case 'result':
      // No actionable saving over the threshold → good shape, no paywall (§8b).
      return audit.paywall ? <Result /> : <GoodShape />;
    case 'cutlist':
      return <CutList />;
    default:
      return <Landing />;
  }
}

export function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Flow />
      </div>
    </StoreProvider>
  );
}
