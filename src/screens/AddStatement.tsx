import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useStore } from '../app/store';
import { importStatement } from '../app/statementImport';
import { Button, ProgressBar } from '../components/ui';

export function AddStatement() {
  const { dispatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function onFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await importStatement(files);
      dispatch({ type: 'statementParsed', result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This statement could not be read.');
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

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
        <p className="muted">Your file is read on this phone. It is never uploaded.</p>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Bank statement</h2>
          <p>Add your last 3 months for the best result. Choose one or more CSV, Excel, or text PDF exports from your bank. Never enter your bank login.</p>
          <p className="muted" style={{ fontSize: 13 }}>Scanned PDFs and photos are coming next.</p>
          <div
            className={`file-dropzone${dragging ? ' file-dropzone--active' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={onDrop}
          >
            <p className="file-dropzone__hint">Drop statement files here</p>
            <input ref={input} className="sr-only" type="file" accept=".csv,.txt,.xls,.xlsx,.pdf,text/csv,text/plain,application/pdf" multiple onChange={onFile} />
            <Button full disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Reading on this device…' : 'Choose statement file(s)'}
            </Button>
          </div>
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Screenshot of your phone's subscription list</h2>
          <p className="muted">iPhone: Settings › your name › Subscriptions. Android: Google Play › Payments and subscriptions › Subscriptions.</p>
          <p className="muted" style={{ fontSize: 13 }}>On-device screenshot reading is coming next.</p>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Finish on my computer</h2>
          <p className="muted">This option will send a continuation link by email. It is not available yet.</p>
        </section>
      </div>
      <div className="footer">
        <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'landing' })}>Back</Button>
      </div>
    </>
  );
}
