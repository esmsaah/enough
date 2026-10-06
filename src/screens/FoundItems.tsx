import { useState } from 'react';
import { useStore } from '../app/store';
import { formatMoney, yearlyCost } from '../app/money';
import { Button, ProgressBar } from '../components/ui';
import type { Category, DisplayCategory } from '../engine/types';

const CATEGORIES: Array<{ label: DisplayCategory; type: Category }> = [
  { label: 'Entertainment', type: 'digital' },
  { label: 'AI & Software', type: 'digital' },
  { label: 'Cloud & Storage', type: 'digital' },
  { label: 'News & Media', type: 'digital' },
  { label: 'Learning', type: 'digital' },
  { label: 'Fitness & Health', type: 'membership' },
  { label: 'Kids & Family', type: 'membership' },
  { label: 'Shopping & Delivery', type: 'habit' },
  { label: 'Bills & Utilities', type: 'bill' },
  { label: 'Transport', type: 'bill' },
  { label: 'Other', type: 'other' },
];

export function FoundItems() {
  const { state, dispatch } = useStore();
  const [frequencyChoices, setFrequencyChoices] = useState<Record<string, 'monthly' | 'yearly' | 'oneTime'>>({});
  const statementItems = state.items.filter((item) => item.source === 'statement');
  const possibleRecurring = state.statement?.possibleRecurring.filter((candidate) => !state.items.some((item) => item.merchantKey === candidate.merchantKey)) ?? [];
  const ended = state.statement?.ended ?? [];
  const possibleDoubleCharges = state.statement?.possibleDoubleCharges ?? [];
  return (
    <>
      <div className="screen">
        <ProgressBar step={3} total={4} />
        <p className="muted mono">SCREEN 5</p>
        <h1>Found items</h1>
        <p className="muted">Add your last 3 months for the best result. Check recurring costs, change a category or add anything missing.</p>

        {state.statement?.needMoreData && (
          <div className="card"><strong>Add another month to find more.</strong><p className="muted">You can continue with what this statement shows.</p></div>
        )}

        {statementItems.length === 0 && possibleRecurring.length === 0 ? (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>No recurring costs found yet</h2>
            <p className="muted">Try another month of transactions or add costs by hand.</p>
          </div>
        ) : statementItems.map((item) => {
          const category = CATEGORIES.find((c) => c.label === item.displayCategory) ?? CATEGORIES[CATEGORIES.length - 1]!;
          return (
            <article className="card found-item" key={item.id}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="row__name">{item.name}</div>
                  <div className="row__meta muted">{item.category === 'bill'
                    ? `Bill · ${item.charges === 1 ? 'seen once, add more months to confirm' : item.frequency}`
                    : item.billingModel === 'usage' ? 'Pay-as-you-go · actual spend'
                      : item.frequency === 'oneTime' ? 'One-time · not recurring' : `${item.frequency} · ${formatMoney(item.price, item.currency)} per period`}</div>
                  <div className="found-item__year mono">{item.category === 'bill' ? 'Compare offers'
                    : item.frequency === 'oneTime' || item.billingModel === 'usage' ? 'Not annualized' : `${formatMoney(yearlyCost(item), item.currency)} / year`}</div>
                  {item.extraPurchases && <div className="row__meta muted">Extra purchases: {item.extraPurchases.charges} · {formatMoney(item.extraPurchases.total, item.currency)} total</div>}
                </div>
                {item.category === 'bill'
                  ? <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: 'usage' })}>Compare offers</Button>
                  : <Button variant="ghost" onClick={() => dispatch({ type: 'removeItem', id: item.id })}>Remove</Button>}
              </div>
              {item.category === 'other' ? (
                <label className="category-select-label">Choose a category
                  <select className="category-select" value={category.label} onChange={(e) => {
                    const choice = CATEGORIES.find((c) => c.label === e.target.value)!;
                    dispatch({ type: 'setClassification', id: item.id, category: choice.type, displayCategory: choice.label });
                  }}>
                    {CATEGORIES.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
                  </select>
                </label>
              ) : <span className="category-tag">{item.displayCategory}</span>}
            </article>
          );
        })}

        {possibleRecurring.length > 0 && (
          <section className="card" aria-label="Possible recurring costs">
            <h2 style={{ marginTop: 0 }}>Possible recurring</h2>
            <p className="muted">These known services appeared once or without a clear rhythm. Confirm the ones you still pay for.</p>
            {possibleRecurring.map((item) => {
              const needsChoice = item.askBilling === true;
              const selected = frequencyChoices[item.merchantKey] ?? (item.frequency === 'unknown' ? undefined : item.frequency);
              const allowed = selected === 'monthly' || selected === 'yearly' || selected === 'oneTime';
              return (
                <div className="possible-recurring-row" key={item.merchantKey}>
                  <div>
                    <div className="row__name">{item.name}</div>
                    <div className="row__meta muted">{item.category === 'bill' ? `Bill · ${item.charges === 1 ? 'seen once, add more months to confirm' : `${item.charges} charges`}` : `${formatMoney(item.price, item.currency)} · ${item.charges} ${item.charges === 1 ? 'charge' : 'charges'}`}{item.estimate ? ' · estimate' : ''}</div>
                  </div>
                  {needsChoice || item.estimate ? (
                    <label className="category-select-label">{needsChoice ? 'How often do you pay?' : 'Adjust estimate'}
                      <select
                        className="category-select"
                        aria-label={`${needsChoice ? 'Billing frequency' : 'Adjust estimated billing frequency'} for ${item.name}`}
                        value={selected ?? ''}
                        onChange={(event) => setFrequencyChoices((current) => ({ ...current, [item.merchantKey]: event.target.value as 'monthly' | 'yearly' | 'oneTime' }))}
                      >
                        <option value="" disabled>Choose one</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="oneTime">One-time</option>
                      </select>
                    </label>
                  ) : <span className="category-tag">{item.frequency} {item.estimate ? 'estimate' : 'plan'}</span>}
                  <Button
                    variant="secondary"
                    disabled={!allowed}
                    onClick={() => dispatch({ type: 'confirmPossible', merchantKey: item.merchantKey, frequency: selected as 'monthly' | 'yearly' | 'oneTime' })}
                  >
                    {selected === 'oneTime' ? 'Add as one-time' : 'Confirm'}
                  </Button>
                </div>
              );
            })}
          </section>
        )}

        {possibleDoubleCharges.length > 0 && (
          <section className="card" aria-label="Possible double charges">
            <h2 style={{ marginTop: 0 }}>Check possible double charges</h2>
            {possibleDoubleCharges.map((charge) => (
              <p key={`${charge.merchantKey}-${charge.firstCharge}-${charge.secondCharge}`}>
                {charge.name}: {formatMoney(charge.amount, charge.currency)} on {charge.firstCharge} and {charge.secondCharge}.
              </p>
            ))}
          </section>
        )}

        {ended.length > 0 && (
          <section className="card" aria-label="Ended services">
            <h2 style={{ marginTop: 0 }}>Ended</h2>
            <p className="muted">These appeared in the statement but have not been charged for over 60 days.</p>
            {ended.map((item) => <p key={item.merchantKey}>{item.name} · last charge {item.lastCharge}</p>)}
          </section>
        )}

        <div className="stack" style={{ marginTop: 20 }}>
          <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>Add another month</Button>
          <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>Add items by hand</Button>
        </div>
      </div>
      <div className="footer">
        <Button full onClick={() => dispatch({ type: 'goto', step: 'anythingElse' })}>Continue</Button>
      </div>
    </>
  );
}
