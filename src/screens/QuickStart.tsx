// Screen 2B — Quick start. Section 8. A curated, RELEVANT tap list (global core
// + the country's local services), search across the whole catalog, "Add your
// own" for anything missing, and a running yearly total.
import { useMemo, useState } from 'react';
import { searchCatalog, type QuickPick } from '../app/catalog';
import { tapListForCountry } from '../app/tapList';
import { COUNTRIES, countryFlag, countryName, guessCountry } from '../app/country';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, Chip, ProgressBar } from '../components/ui';
import type { Category, DisplayCategory, Item } from '../engine/types';

const GROUP_ORDER = [
  'Entertainment', 'Music', 'Social', 'AI & Software', 'Work & Freelance', 'Cloud & Storage',
  'Gaming', 'News & Media', 'Learning', 'Fitness & Health', 'Dating', 'VPN & Security',
  'Shopping & Delivery', 'Finance', 'Phone & Internet', 'Utilities', 'Transport',
  'Insurance', 'Kids & Family', 'Everyday costs', 'Housing', 'Other',
];
const SHOWN_PER_GROUP = 6;

const DISPLAY_CATEGORIES: DisplayCategory[] = [
  'Entertainment', 'AI & Software', 'Cloud & Storage', 'News & Media', 'Learning',
  'Fitness & Health', 'Kids & Family', 'Shopping & Delivery', 'Bills & Utilities', 'Transport', 'Other',
];

function analysisFor(dc: DisplayCategory): Category {
  if (dc === 'Bills & Utilities' || dc === 'Transport') return 'bill';
  if (dc === 'Fitness & Health' || dc === 'Kids & Family') return 'membership';
  return 'digital';
}

export function QuickStart() {
  const { state, dispatch, audit } = useStore();
  const country = state.country ?? guessCountry();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [custom, setCustom] = useState({ name: '', price: '', period: 'monthly' as 'monthly' | 'yearly', dc: 'Entertainment' as DisplayCategory });
  const selected = new Set(state.items.filter((i) => i.source === 'quickpick').map((i) => i.merchantKey));
  const ownItems = state.items.filter((i) => i.source === 'manual');
  const backStep = state.statement ? 'found' : 'landing';

  const groups = useMemo(() => {
    const byGroup = new Map<string, QuickPick[]>();
    for (const pick of tapListForCountry(country)) {
      const group = pick.group ?? 'Other';
      byGroup.set(group, [...(byGroup.get(group) ?? []), pick]);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ name: g, picks: byGroup.get(g)! }));
  }, [country]);
  const results = useMemo(() => searchCatalog(query), [query]);

  const chip = (p: QuickPick) => (
    <Chip key={p.merchantKey} selected={selected.has(p.merchantKey)} onClick={() => dispatch({ type: 'toggleQuickPick', pick: p })}>
      {p.name}
    </Chip>
  );

  function addOwn() {
    const name = custom.name.trim();
    const price = Number(custom.price);
    if (!name || !price) return;
    const item: Omit<Item, 'id'> = {
      name, price, frequency: custom.period, source: 'manual', estimate: true, currency: state.currency,
      category: analysisFor(custom.dc), displayCategory: custom.dc,
    };
    dispatch({ type: 'addManual', item });
    setCustom({ name: '', price: '', period: 'monthly', dc: 'Entertainment' });
    setAddOpen(false);
  }

  return (
    <>
      <div className="screen">
        <ProgressBar step={1} total={4} />
        <h1>What do you pay for?</h1>
        <p className="muted">Tap everything that sounds familiar. You can fix prices and add more later.</p>

        <label className="country-line">
          <span>Showing services in {countryFlag(country)}</span>
          <select value={country} onChange={(e) => dispatch({ type: 'setCountry', country: e.target.value })} aria-label="Country">
            {[...COUNTRIES, 'GLOBAL'].map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
          </select>
        </label>

        <input className="search-input" type="search" placeholder="Search for anything you pay for" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search services" />

        {query.trim().length >= 2 ? (
          <section>
            <h2>Results</h2>
            {results.length
              ? <div className="chip-wrap">{results.map(chip)}</div>
              : <p className="muted">Nothing found — add it with “+ Add your own” below.</p>}
          </section>
        ) : groups.map(({ name, picks }) => {
          const open = expanded[name];
          const shown = open ? picks : picks.slice(0, SHOWN_PER_GROUP);
          return (
            <section key={name}>
              <h2>{name}</h2>
              <div className="chip-wrap">
                {shown.map(chip)}
                {picks.length > SHOWN_PER_GROUP && (
                  <button type="button" className="link-button" onClick={() => setExpanded((e) => ({ ...e, [name]: !open }))}>
                    {open ? 'Show less' : `+${picks.length - SHOWN_PER_GROUP} more`}
                  </button>
                )}
              </div>
            </section>
          );
        })}

        {/* Add your own — the escape hatch so the tap path is complete everywhere */}
        <section>
          <h2>Don't see it?</h2>
          {ownItems.length > 0 && (
            <div className="chip-wrap" style={{ marginBottom: 10 }}>
              {ownItems.map((i) => (
                <span key={i.id} className="chip chip--on" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  {i.name}
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => dispatch({ type: 'removeItem', id: i.id })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
          {addOpen ? (
            <div className="card">
              <input className="amount-input" style={{ marginBottom: 8 }} autoFocus placeholder="Name (e.g. HBO Max, local gym)" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
              <div className="row" style={{ gap: 8 }}>
                <input className="amount-input mono" inputMode="decimal" placeholder="Amount" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} />
                <select aria-label="Period" value={custom.period} onChange={(e) => setCustom({ ...custom, period: e.target.value as 'monthly' | 'yearly' })}>
                  <option value="monthly">/mo</option>
                  <option value="yearly">/yr</option>
                </select>
              </div>
              <select aria-label="Category" style={{ marginTop: 8, width: '100%' }} value={custom.dc} onChange={(e) => setCustom({ ...custom, dc: e.target.value as DisplayCategory })}>
                {DISPLAY_CATEGORIES.map((dc) => <option key={dc} value={dc}>{dc}</option>)}
              </select>
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button full disabled={!custom.name.trim() || !Number(custom.price)} onClick={addOwn}>Add</Button>
              </div>
            </div>
          ) : (
            <button type="button" className="link-button" onClick={() => setAddOpen(true)}>+ Add your own</button>
          )}
        </section>
      </div>

      <div className="footer">
        <div className="total-line">
          <span className="muted">{selected.size + ownItems.length} selected · per year</span>
          <span className="amount">{formatMoney(audit.yearlyTotal, state.currency, { round: true })}</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: backStep })}>Back</Button>
          <Button full disabled={selected.size + ownItems.length === 0} onClick={() => dispatch({ type: 'goto', step: 'anythingElse' })}>
            Continue
          </Button>
        </div>
      </div>
    </>
  );
}
