// Screen 2B — Quick start. Section 8. Chips with a running yearly total.
import { QUICK_PICKS } from '../app/catalog';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, Chip, ProgressBar } from '../components/ui';

const GROUPS = [
  'Entertainment', 'AI & Software', 'Cloud & Storage', 'News & Media',
  'Learning', 'Fitness & Health', 'Shopping & Delivery', 'Bills & Utilities', 'Kids & Family',
] as const;

export function QuickStart() {
  const { state, dispatch, audit } = useStore();
  const selected = new Set(state.items.filter((i) => i.source === 'quickpick').map((i) => i.merchantKey));

  return (
    <>
      <div className="screen">
        <ProgressBar step={1} total={4} />
        <h1>What do you pay for?</h1>
        <p className="muted">Tap everything that sounds familiar. You can fix prices and add more later.</p>

        {GROUPS.map((group) => {
          const picks = QUICK_PICKS.filter((p) => p.displayCategory === group);
          if (picks.length === 0) return null;
          return (
            <section key={group}>
              <h2>{group}</h2>
              <div className="chip-wrap">
                {picks.map((p) => (
                  <Chip key={p.merchantKey} selected={selected.has(p.merchantKey)} onClick={() => dispatch({ type: 'toggleQuickPick', pick: p })}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="footer">
        <div className="total-line">
          <span className="muted">{selected.size} selected · per year</span>
          <span className="amount">{formatMoney(audit.yearlyTotal, state.currency, { round: true })}</span>
        </div>
        <Button full disabled={selected.size === 0} onClick={() => dispatch({ type: 'goto', step: 'anythingElse' })}>
          Continue
        </Button>
      </div>
    </>
  );
}
