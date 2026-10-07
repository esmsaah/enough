// Screen 2B — Quick start. Section 8. Tap list for the person's country,
// with search across the whole catalog and a running yearly total.
import { useMemo, useState } from 'react';
import { picksForCountry, searchCatalog, type QuickPick } from '../app/catalog';
import { COUNTRIES, countryFlag, countryName, guessCountry } from '../app/country';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, Chip, ProgressBar } from '../components/ui';

const GROUP_ORDER = [
  'Entertainment', 'Music', 'AI & Software', 'Work & Freelance', 'Cloud & Storage', 'Phone & Internet', 'Utilities', 'Everyday costs',
  'Fitness & Health', 'Insurance', 'Transport', 'News & Media', 'Learning', 'Kids & Family', 'Shopping & Delivery', 'Gaming', 'Dating',
  'VPN & Security', 'Finance', 'Housing', 'Other',
];
const SHOWN_PER_GROUP = 8;

export function QuickStart() {
  const { state, dispatch, audit } = useStore();
  const country = state.country ?? guessCountry();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const selected = new Set(state.items.filter((i) => i.source === 'quickpick').map((i) => i.merchantKey));
  const backStep = state.statement ? 'found' : 'landing';

  const groups = useMemo(() => {
    const byGroup = new Map<string, QuickPick[]>();
    for (const pick of picksForCountry(country)) {
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

        <input className="search-input" type="search" placeholder="Search 1,300 services" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search services" />

        {query.trim().length >= 2 ? (
          <section>
            <h2>Results</h2>
            {results.length ? <div className="chip-wrap">{results.map(chip)}</div> : <p className="muted">Nothing found. Add it by hand on the next step.</p>}
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
      </div>

      <div className="footer">
        <div className="total-line">
          <span className="muted">{selected.size} selected · per year</span>
          <span className="amount">{formatMoney(audit.yearlyTotal, state.currency, { round: true })}</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: backStep })}>Back</Button>
          <Button full disabled={selected.size === 0} onClick={() => dispatch({ type: 'goto', step: 'anythingElse' })}>
            Continue
          </Button>
        </div>
      </div>
    </>
  );
}
