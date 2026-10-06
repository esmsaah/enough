// Screen 6 — Anything else? Section 8. Optional yearly + cash costs, clear Skip.
import { useState } from 'react';
import { CASH_CHIPS, YEARLY_CHIPS } from '../app/catalog';
import { useStore } from '../app/store';
import { Button, Chip } from '../components/ui';
import type { Item } from '../engine/types';

export function AnythingElse() {
  const { state, dispatch } = useStore();
  const [openYearly, setOpenYearly] = useState<string | null>(null);
  const [openCash, setOpenCash] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  function addYearly(name: string) {
    const chip = YEARLY_CHIPS.find((c) => c.name === name)!;
    const price = Number(amount);
    if (!price) return;
    const item: Omit<Item, 'id'> = {
      name, category: chip.category, displayCategory: chip.displayCategory,
      price, frequency: 'yearly', source: 'manual', estimate: true, currency: state.currency,
    };
    dispatch({ type: 'addManual', item });
    setOpenYearly(null); setAmount('');
  }
  function addCash(name: string) {
    const chip = CASH_CHIPS.find((c) => c.name === name)!;
    const price = Number(amount);
    if (!price) return;
    const item: Omit<Item, 'id'> = {
      name, category: chip.category, displayCategory: chip.displayCategory,
      price, frequency: 'monthly', source: 'cash', estimate: true, currency: state.currency,
    };
    dispatch({ type: 'addManual', item });
    setOpenCash(null); setAmount('');
  }

  return (
    <>
      <div className="screen">
        <h1>Anything else?</h1>
        <p className="muted">Optional. These are easy to forget because they don't show up monthly.</p>

        <h2>Anything you pay yearly?</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Insurance, a domain, a licence, a membership.</p>
        <div className="chip-wrap">
          {YEARLY_CHIPS.map((c) => (
            <Chip key={c.name} selected={openYearly === c.name} onClick={() => { setOpenYearly(c.name); setOpenCash(null); setAmount(''); }}>
              {c.name}
            </Chip>
          ))}
        </div>
        {openYearly && (
          <div className="card">
            <label className="muted" style={{ fontSize: 13 }}>{openYearly} — amount per year ({state.currency})</label>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="amount-input mono" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <Button onClick={() => addYearly(openYearly)}>Add</Button>
            </div>
          </div>
        )}

        <h2>Anything you pay in cash?</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Gym, hairdresser, kids' training, lessons, cleaning, parking, coffee. Marked as an estimate.</p>
        <div className="chip-wrap">
          {CASH_CHIPS.map((c) => (
            <Chip key={c.name} selected={openCash === c.name} onClick={() => { setOpenCash(c.name); setOpenYearly(null); setAmount(''); }}>
              {c.name}
            </Chip>
          ))}
        </div>
        {openCash && (
          <div className="card">
            <label className="muted" style={{ fontSize: 13 }}>{openCash} — amount per month ({state.currency})</label>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="amount-input mono" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <Button onClick={() => addCash(openCash)}>Add</Button>
            </div>
          </div>
        )}

        {state.items.some((i) => i.source === 'manual' || i.source === 'cash') && (
          <>
            <h2>Added</h2>
            {state.items.filter((i) => i.source === 'manual' || i.source === 'cash').map((i) => (
              <div className="row card" key={i.id}>
                <span className="row__name">{i.name} <span className="muted" style={{ fontWeight: 400 }}>· estimate</span></span>
                <Button variant="ghost" onClick={() => dispatch({ type: 'removeItem', id: i.id })}>Remove</Button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="footer">
        <div className="row" style={{ gap: 12 }}>
          <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: state.statement ? 'found' : 'quickstart' })}>Back</Button>
          <Button full onClick={() => dispatch({ type: 'goto', step: 'usage' })}>
            {state.items.some((i) => i.source === 'manual' || i.source === 'cash') ? 'Continue' : 'Skip'}
          </Button>
        </div>
      </div>
    </>
  );
}
