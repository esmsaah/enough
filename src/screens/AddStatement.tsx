import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useStore } from '../app/store';
import { importStatement } from '../app/statementImport';
import { Button, ProgressBar } from '../components/ui';
import { parseSubscriptionList, type PhoneSubscription } from '../engine/subscriptionList';
import { matchMerchant } from '../engine/merchants';
import { continueLink, portableItems } from '../app/continueLink';
import { formatMoney } from '../app/money';
import { guessCountry } from '../app/country';
import type { Item } from '../engine/types';

export function AddStatement() {
  const { state, dispatch } = useStore();
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function onFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await importStatement(files, setStatus);
      // Shop-name recognition runs only after the person has seen "What we keep" (brief §11.8).
      dispatch({ type: 'statementParsed', result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This statement could not be read.');
      setBusy(false);
      setStatus('');
      if (input.current) input.current.value = '';
    }
  }

  // Phone subscription list screenshots → recognised entries to confirm.
  const shotInput = useRef<HTMLInputElement>(null);
  const [shotBusy, setShotBusy] = useState('');
  const [shotError, setShotError] = useState('');
  const [found, setFound] = useState<Array<PhoneSubscription & { keep: boolean }> | null>(null);
  async function onShots(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setShotError(''); setFound(null); setShotBusy('Reading the screenshot on this device…');
    try {
      const { ocr } = await import('../app/ocr');
      const pages = await ocr(files, (d, t) => setShotBusy(`Reading screenshot ${d} of ${t} on this device…`));
      const subs = parseSubscriptionList(pages.flatMap((p) => p.lines), new Date().toISOString().slice(0, 10));
      if (!subs.length) setShotError("We couldn't find subscriptions in that picture. Make sure the list with prices is visible, or tap them instead.");
      setFound(subs.map((s) => ({ ...s, keep: true })));
    } catch {
      setShotError("That picture couldn't be read. Try another screenshot, or tap your services instead.");
    } finally {
      setShotBusy('');
      if (shotInput.current) shotInput.current.value = '';
    }
  }
  function addFound() {
    const items = (found ?? []).filter((s) => s.keep).map((s) => {
      const info = matchMerchant(s.name);
      return {
        name: info?.name ?? s.name, merchantKey: info?.merchantKey ?? s.name.toLowerCase(), category: info?.category ?? 'digital',
        displayCategory: info?.displayCategory ?? 'Other', price: s.price, currency: s.currency, frequency: s.frequency, billingModel: s.frequency === 'yearly' ? 'yearly' : 'monthly',
        source: 'manual', estimate: false, priceConfirmed: true, ...(s.nextCharge ? { nextCharge: s.nextCharge } : {}),
        ...(info?.overlapGroup ? { overlapGroup: info.overlapGroup } : {}), ...(info?.cancelUrl ? { cancelUrl: info.cancelUrl } : {}),
      } as Omit<Item, 'id'>;
    });
    if (items.length) dispatch({ type: 'addPhoneSubscriptions', items });
  }

  // Finish on my computer: a link with only tapped items, sent from the person's own email app.
  const portable = portableItems(state.items);
  const link = portable.length ? continueLink(window.location.origin, state.items, state.country ?? guessCountry()) : '';
  const [copied, setCopied] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    await onFiles(Array.from(event.target.files ?? []));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <>
      <div className="screen">
        <ProgressBar step={1} total={4} />
        <p className="muted mono">SCREEN 2A</p>
        <h1>Add a statement</h1>
        <p className="muted">Your file is read on this device and never uploaded. Only shop names are checked online, never amounts, dates or your details.</p>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Bank statement</h2>
          <p>Add your last 3 months for the best result. Choose CSV, Excel or PDF exports from your bank, or a photo of a paper statement. Never enter your bank login.</p>
          <p className="muted" style={{ fontSize: 13 }}>Scanned PDFs and photos are read on this device too. It takes a little longer.</p>
          <div
            className={`file-dropzone${dragging ? ' file-dropzone--active' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={onDrop}
          >
            <p className="file-dropzone__hint">Drop statement files here</p>
            <input ref={input} className="sr-only" type="file" accept=".csv,.txt,.xls,.xlsx,.pdf,text/csv,text/plain,application/pdf,image/*" multiple onChange={onFile} />
            <Button full disabled={busy} onClick={() => input.current?.click()}>
              {busy ? (status || 'Reading on this device…') : 'Choose statement file(s)'}
            </Button>
          </div>
          <label className="ai-toggle">
            <input type="checkbox" checked={state.aiRecognition} onChange={(event) => dispatch({ type: 'setAiRecognition', enabled: event.target.checked })} />
            Use AI to recognise shop names (names only)
          </label>
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Screenshot of your phone's subscription list</h2>
          <p>The safest way in. It holds no bank data.</p>
          <p className="muted" style={{ fontSize: 14 }}>iPhone: Settings › your name › Subscriptions. Android: Google Play › your profile › Payments &amp; subscriptions › Subscriptions. Take a screenshot, then choose it here.</p>
          <input ref={shotInput} className="sr-only" type="file" accept="image/*" multiple onChange={onShots} />
          <Button full variant="secondary" disabled={!!shotBusy} onClick={() => shotInput.current?.click()}>{shotBusy || 'Choose screenshot(s)'}</Button>
          {shotError && <p role="alert" className="error-message">{shotError}</p>}
          {found && found.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <strong>We found these. Untick anything wrong.</strong>
              {found.map((s, n) => (
                <label key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                  <input type="checkbox" checked={s.keep} onChange={() => setFound(found.map((f, k) => (k === n ? { ...f, keep: !f.keep } : f)))} style={{ width: 20, height: 20 }} />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="mono">{formatMoney(s.price, s.currency)}{s.frequency === 'yearly' ? '/yr' : '/mo'}</span>
                </label>
              ))}
              <Button full disabled={!found.some((s) => s.keep)} onClick={addFound}>Add these</Button>
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Finish on my computer</h2>
          {portable.length ? (
            <>
              <p>Send yourself a link with the {portable.length} {portable.length === 1 ? 'service' : 'services'} you picked and your answers, then open it on the computer.</p>
              {state.statement && <p className="muted" style={{ fontSize: 13 }}>Your statement stays on this phone. Add it again on the computer.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  href={`mailto:?subject=${encodeURIComponent('My Enough audit')}&body=${encodeURIComponent(`Open this on your computer to continue your audit:\n\n${link}`)}`}>Email the link to myself</a>
                <Button full variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Link copied' : 'Copy link'}</Button>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>The link holds only what you tapped, never statement data. It opens in your own email app; we don't see or store your address.</p>
            </>
          ) : (
            <p className="muted">Tap a few services first, then come back here to send yourself a link.</p>
          )}
        </section>
      </div>
      <div className="footer">
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'landing' })}>Back</Button>
      </div>
    </>
  );
}
