import { useStore } from '../app/store';
import { BoardReceipt } from './ReceiptPanel';

export function DesktopReceipt() {
  const { state } = useStore();
  // On the Pick step the receipt lists picks as "to check" with no total yet;
  // amounts and the total appear from the Check step on as prices are confirmed.
  const showTotal = state.step !== 'quickstart' && state.step !== 'picks';
  return (
    <aside className="desktop-receipt" aria-label="Audit total">
      <BoardReceipt items={state.items} currency={state.currency} showTotal={showTotal} />
      <p className="desktop-receipt__privacy">Your statement stays on this device.</p>
    </aside>
  );
}
