import { useState } from 'react';
import { resolveStatementDates } from '../app/statementImport';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { Button, Chip, ProgressBar } from '../components/ui';
import type { DateFormat } from '../engine/parse';

export function WhatWeKeep() {
  const { state, dispatch } = useStore();
  const result = state.statement;
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  if (!result) return null;

  async function chooseDateFormat(format: Extract<DateFormat, 'dmy' | 'mdy'>) {
    setResolving(true);
    setError('');
    try {
      const updated = await resolveStatementDates(format);
      dispatch({ type: 'statementDateFormat', result: updated });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read those dates.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <>
      <div className="screen">
        <ProgressBar step={2} total={4} />
        <p className="muted mono">SCREEN 4 · REDACTED ON THIS PHONE</p>
        <h1>What we keep</h1>
        <p className="muted">Names, account details and other personal information are removed before anything is saved.</p>

        <div className="redaction-bars" aria-label="Removed information">
          {result.meta.redactedCategories.map((category) => (
            <div className="redaction-bar" key={category}><span>{category}</span><strong>REMOVED</strong></div>
          ))}
        </div>
        {result.meta.redactedCategories.length === 0 && <p className="muted">No extra personal fields were found in this export.</p>}

        <h2>Kept rows</h2>
        {result.transactions.length === 0 ? (
          <div className="card"><p>No transaction rows could be read from this file. Try a CSV with date, description and amount columns.</p></div>
        ) : (
          <div className="kept-rows">
            {result.transactions.slice(0, 12).map((row, index) => (
              <div className="kept-row" key={`${row.date}-${index}`}>
                <span className="mono kept-row__date">{row.date}</span>
                <span className="kept-row__merchant">{row.merchantRaw}</span>
                <span className="mono kept-row__amount">{formatMoney(row.amount, row.currency)}</span>
              </div>
            ))}
            {result.transactions.length > 12 && <p className="muted">And {result.transactions.length - 12} more redacted rows.</p>}
          </div>
        )}

        {result.meta.dateAmbiguous && (
          <div className="card" role="group" aria-label="Choose date format">
            <h2 style={{ marginTop: 0 }}>Which way should we read these dates?</h2>
            <p className="muted">Both day / month and month / day fit the dates in this statement.</p>
            <div className="chip-wrap">
              <Chip onClick={() => void chooseDateFormat('dmy')}>Day / month / year</Chip>
              <Chip onClick={() => void chooseDateFormat('mdy')}>Month / day / year</Chip>
            </div>
            {resolving && <p className="muted">Updating dates…</p>}
            {error && <p role="alert" className="error-message">{error}</p>}
          </div>
        )}
      </div>
      <div className="footer">
        <div className="row">
          <Button variant="secondary" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>Back</Button>
          <Button full disabled={result.meta.dateAmbiguous} onClick={() => dispatch({ type: 'acceptStatement' })}>Continue</Button>
        </div>
      </div>
    </>
  );
}
