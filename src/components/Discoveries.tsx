// What the statement showed that people rarely notice themselves: double charges,
// price rises, add-ons bought next to a plan, fees, small subscriptions and the
// yearly renewals coming up. Shown free on the result: this is the "I didn't know".
import { formatMoney } from '../app/money';
import type { Audit } from '../engine/types';

type Line = { title: string; detail: string; locked: string };

function day(iso: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

export function discoveries(audit: Audit): Line[] {
  const cur = audit.currency;
  const m = (n: number) => formatMoney(n, cur);
  const out: Line[] = [];
  for (const i of audit.items) {
    if (i.source !== 'statement') continue;
    if (i.possibleDuplicateCharge) out.push({ locked: 'A double charge', title: `${i.name} charged you twice`, detail: `${m(i.possibleDuplicateCharge.amount)} on ${day(i.possibleDuplicateCharge.firstCharge)} and ${day(i.possibleDuplicateCharge.secondCharge)}. You can ask for one back.` });
    if (i.priceIncrease) out.push({ locked: 'A price rise you didn\'t agree to', title: `${i.name} got more expensive`, detail: `From ${m(i.priceIncrease.from)} to ${m(i.priceIncrease.to)}, ${m(i.priceIncrease.yearlyIncrease)} more a year, without you doing anything.` });
    if (i.extraPurchases && i.extraPurchases.total > 0 && i.extraPurchases.label) out.push({ locked: 'Extras bought on top of a plan', title: `${i.name} costs more than the plan`, detail: `Besides the plan you paid ${m(i.extraPurchases.total)} for ${i.extraPurchases.label ?? 'extras'} (${i.extraPurchases.charges}×).` });
    if (i.frequency === 'yearly' && i.nextCharge) out.push({ locked: 'A yearly renewal that is easy to forget', title: `${i.name} renews once a year`, detail: `Next charge around ${day(i.nextCharge)}, ${m(i.price)} in one go. Easy to forget.` });
  }
  for (const h of audit.hiddenCosts) {
    if (h.kind === 'fx' && !h.estimate && h.yearly) out.push({ locked: 'Currency and transfer fees', title: 'Currency and transfer fees', detail: `${m(h.yearly)} a year in fees, read from your statement.` });
    if (h.kind === 'bankFee' && !h.estimate && h.yearly) out.push({ locked: 'Bank account fees', title: 'Bank account fees', detail: `${m(h.yearly)} a year. Many banks have accounts without a monthly fee.` });
    if (h.kind === 'smallSubs' && h.yearly) out.push({ locked: 'Small amounts that add up', title: 'Small amounts add up', detail: h.note });
  }
  return out;
}

/** locked: before payment, say what kind of thing was found, never which service or what to do (brief §1.4). */
export function Discoveries({ audit, locked = false }: { audit: Audit; locked?: boolean }) {
  const lines = discoveries(audit);
  if (lines.length === 0) return null;
  const fromStatement = audit.items.some((i) => i.source === 'statement');
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="lab">{fromStatement ? 'Found in your statement' : 'Worth knowing'}</span>
      <div className="r" style={{ marginTop: 8, paddingBottom: 10, borderBottom: '1.5px solid var(--ink)' }}>
        <span style={{ fontSize: 22, fontWeight: 800, fontStretch: '112%' }}>{lines.length} {lines.length === 1 ? 'thing' : 'things'} you might not know</span>
      </div>
      {lines.map((l, n) => (
        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{locked ? l.locked : l.title}</span>
          {!locked && <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{l.detail}</span>}
        </div>
      ))}
      {locked && <span style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 8 }}>Which services, and what to do about each, are in your full audit.</span>}
    </section>
  );
}
