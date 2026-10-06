import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button } from '../components/ui';

/** Shared result breakdown for the paywall and good-shape outcomes. */
export function AuditSections() {
  return <div className="audit-sections"><SubscriptionsSection /><BreakdownSections /></div>;
}

export function SubscriptionsSection() {
  const { state, audit, dispatch } = useStore();
  const cur = audit.currency;
  const increases = audit.items.filter((item) => item.priceIncrease);
  const increaseTotal = increases.reduce((sum, item) => sum + (item.priceIncrease?.yearlyIncrease ?? 0), 0);

  return (
      <section className="audit-subscriptions" aria-labelledby="subscriptions-heading">
        <h2 id="subscriptions-heading">Subscriptions</h2>
        {increases.length > 0 && (
          <p className="muted" role="status">
            {increases.length} {increases.length === 1 ? 'subscription got' : 'subscriptions got'} more expensive, +{formatMoney(increaseTotal, cur, { round: true })} a year
          </p>
        )}
        {audit.items.map((item) => (
          <div className="card" key={item.id}>
            <div className="row"><strong>{item.name}</strong><span>{formatMoney(item.price, cur, { round: true })}/{item.frequency === 'yearly' ? 'yr' : item.frequency === 'monthly' ? 'mo' : item.frequency}</span></div>
            {item.priceIncrease && <p className="muted" style={{ marginBottom: 0 }}>
              {item.name} went up from {formatMoney(item.priceIncrease.from, cur, { round: true })} to {formatMoney(item.priceIncrease.to, cur, { round: true })}, +{formatMoney(item.priceIncrease.yearlyIncrease, cur, { round: true })} a year{item.approxConverted ? ' (approx.)' : ''}
            </p>}
          </div>
        ))}
        {audit.items.length === 0 && <p className="muted">No subscriptions found.</p>}
        {audit.rotationPlan && <div className="card">
          <h3>Streaming rotation</h3>
          <p>New monthly cost: {formatMoney(audit.rotationPlan.newMonthlyCost, cur, { round: true })}. Yearly saving: {formatMoney(audit.rotationPlan.yearlySaving, cur, { round: true })}{audit.rotationPlan.estimate ? ' approx.' : ''}.</p>
          <div className="stack">
            {audit.rotationPlan.services.map((service) => <label key={service.id} className="row">
              <span>{service.name}</span>
              <span><input type="checkbox" aria-label={`Always keep ${service.name}`} checked={state.rotationPinnedIds.includes(service.id)} onChange={(event) => dispatch({ type: 'setRotationPinned', itemId: service.id, pinned: event.target.checked })} /> Always keep</span>
            </label>)}
          </div>
          <ol>{audit.rotationPlan.months.map((month) => <li key={`${month.month}-${month.reminderDate}`}>
            {month.month}: {month.activeServiceName ?? 'Pinned services only'} <span className="muted">· {formatMoney(month.monthlyCost, cur, { round: true })}</span>
          </li>)}</ol>
          <label className="row"><span>Email rotation reminders</span><input type="checkbox" checked={state.rotationRemindersEnabled} onChange={(event) => dispatch({ type: 'setRotationReminders', enabled: event.target.checked })} /></label>
        </div>}
      </section>
  );
}

export function BreakdownSections() {
  const { audit, dispatch } = useStore();
  const cur = audit.currency;
  const categories = Object.entries(audit.spendingByCategory).filter(([, amount]) => amount > 0);
  return (
    <div className="audit-breakdown">
      <section aria-labelledby="bills-heading">
        <h2 id="bills-heading">Bills</h2>
        <div className="row"><span>Yearly total</span><strong>{formatMoney(audit.billYearlyTotal, cur, { round: true })}</strong></div>
        {audit.bills.map((bill) => <p className="muted" key={bill.id}>{bill.name} · {formatMoney(bill.price, cur, { round: true })}/{bill.frequency === 'yearly' ? 'yr' : bill.frequency === 'monthly' ? 'mo' : bill.frequency}</p>)}
        <Button type="button" variant="secondary" onClick={() => dispatch({ type: 'goto', step: 'emailShare' })}>Compare offers</Button>
      </section>

      {categories.length > 0 && <section aria-labelledby="spending-heading">
        <h2 id="spending-heading">Spending by category</h2>
        {categories.map(([category, amount]) => <div className="row" key={category}><span>{category}</span><strong>{formatMoney(amount, cur, { round: true })}</strong></div>)}
      </section>}
    </div>
  );
}
