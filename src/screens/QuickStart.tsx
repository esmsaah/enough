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

// Sub-group order inside the Subscriptions section (digital only).
const GROUP_ORDER = [
  'Entertainment', 'Music', 'Social', 'AI & Software', 'Work & Freelance', 'Cloud & Storage',
  'Gaming', 'News & Media', 'Learning', 'Fitness & Health', 'Dating', 'Adult', 'VPN & Security',
  'Shopping & Delivery', 'Finance', 'Everyday costs', 'Other',
];
const SHOWN_PER_GROUP = 6;
const SHOWN_FLAT = 10;

// The five cost TYPES. Each tap gets bucketed into one, which also decides how
// the audit treats it (membership = pay-per-visit; fixed = never cut; etc.).
type SectionKey = 'Subscriptions' | 'Memberships (in person)' | 'Bills you can switch' | 'Fixed costs';
const SECTION_DEFS: Array<{ key: SectionKey; sub: boolean; note?: string }> = [
  { key: 'Subscriptions', sub: true },
  { key: 'Memberships (in person)', sub: false },
  { key: 'Bills you can switch', sub: false },
  { key: 'Fixed costs', sub: false, note: "Optional — we can't cut these, but add them to see your full monthly cost." },
];
const SWITCHABLE_BILL_GROUPS = new Set(['Phone & Internet', 'Insurance']);
const FIXED_BILL_GROUPS = new Set(['Utilities', 'Housing', 'Transport']);

const TV_LICENCE = /\b(tv licen[cs]e|tv fee|licen[cs]e fee|rtv|rts|rundfunk|gez|pretplata|canon rai)\b/i;

function sectionFor(p: QuickPick): SectionKey {
  if (p.category === 'membership') return 'Memberships (in person)';
  // A TV/radio licence is a fixed fee you can't switch away from.
  if (TV_LICENCE.test(p.name)) return 'Fixed costs';
  if (p.billingModel === 'usage' || FIXED_BILL_GROUPS.has(p.group ?? '')) return 'Fixed costs';
  if (p.category === 'bill' || SWITCHABLE_BILL_GROUPS.has(p.group ?? '')) return 'Bills you can switch';
  return 'Subscriptions';
}

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
  const [askFor, setAskFor] = useState<QuickPick | null>(null);
  const [askAmount, setAskAmount] = useState('');
  const selected = new Set(state.items.filter((i) => i.source === 'quickpick').map((i) => i.merchantKey));
  const ownItems = state.items.filter((i) => i.source === 'manual');
  const backStep = state.statement ? 'found' : 'landing';

  const sections = useMemo(() => {
    const bySection = new Map<SectionKey, QuickPick[]>();
    for (const pick of tapListForCountry(country)) {
      const s = sectionFor(pick);
      bySection.set(s, [...(bySection.get(s) ?? []), pick]);
    }
    const out: Array<{ key: string; note?: string; flat: boolean; subgroups: Array<{ name: string; picks: QuickPick[] }> }> = [];
    for (const def of SECTION_DEFS) {
      const list = bySection.get(def.key) ?? [];
      if (list.length === 0) continue;
      if (def.sub) {
        const byG = new Map<string, QuickPick[]>();
        for (const p of list) byG.set(p.group ?? 'Other', [...(byG.get(p.group ?? 'Other') ?? []), p]);
        const subgroups = GROUP_ORDER.filter((g) => byG.has(g)).map((g) => ({ name: g, picks: byG.get(g)! }));
        out.push({ key: def.key, flat: false, subgroups });
      } else {
        out.push({ key: def.key, note: def.note, flat: true, subgroups: [{ name: def.key, picks: list }] });
      }
    }
    return out;
  }, [country]);
  const results = useMemo(() => searchCatalog(query), [query]);

  function onChip(p: QuickPick) {
    if (selected.has(p.merchantKey)) { dispatch({ type: 'toggleQuickPick', pick: p }); return; } // remove
    if (p.askPrice) { setAskFor(p); setAskAmount(''); return; } // ask the amount first
    dispatch({ type: 'toggleQuickPick', pick: p }); // known price → add with the estimate
  }

  function addAsked() {
    if (!askFor) return;
    const price = Number(askAmount);
    if (!price) return;
    dispatch({ type: 'addPricedPick', pick: askFor, price });
    setAskFor(null);
    setAskAmount('');
  }

  const chip = (p: QuickPick) => (
    <Chip key={p.merchantKey} selected={selected.has(p.merchantKey)} onClick={() => onChip(p)}>
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

        {askFor && (
          <div className="card">
            <label style={{ fontWeight: 700 }}>How much do you pay for {askFor.name}?</label>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>Prices vary a lot, so just tell us yours.</p>
            <div className="row" style={{ gap: 8 }}>
              <input className="amount-input mono" inputMode="decimal" autoFocus value={askAmount} placeholder="0"
                onChange={(e) => setAskAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAsked(); }} />
              <span className="muted">/{askFor.frequency === 'yearly' ? 'yr' : 'mo'} · {state.currency}</span>
            </div>
            <div className="row" style={{ gap: 12, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setAskFor(null)}>Cancel</Button>
              <Button full disabled={!Number(askAmount)} onClick={addAsked}>Add {askFor.name}</Button>
            </div>
          </div>
        )}

        {query.trim().length >= 2 ? (
          <section>
            <h2>Results</h2>
            {results.length
              ? <div className="chip-wrap">{results.map(chip)}</div>
              : <p className="muted">Nothing found — add it with “+ Add your own” below.</p>}
          </section>
        ) : sections.map((sec) => (
          <div key={sec.key} className="tap-section">
            <h2>{sec.key}</h2>
            {sec.note && <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>{sec.note}</p>}
            {sec.subgroups.map((sg) => {
              const limit = sec.flat ? SHOWN_FLAT : SHOWN_PER_GROUP;
              const open = expanded[sg.name];
              const shown = open ? sg.picks : sg.picks.slice(0, limit);
              return (
                <section key={sg.name}>
                  {!sec.flat && <h3 className="tap-subhead">{sg.name}</h3>}
                  <div className="chip-wrap">
                    {shown.map(chip)}
                    {sg.picks.length > limit && (
                      <button type="button" className="link-button" onClick={() => setExpanded((e) => ({ ...e, [sg.name]: !open }))}>
                        {open ? 'Show less' : `+${sg.picks.length - limit} more`}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ))}

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
