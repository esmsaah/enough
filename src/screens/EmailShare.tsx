// Screen 10 — email report, renewal reminders and share card (§8, §10).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatMoney } from '../app/money';
import { useStore } from '../app/store';
import { clearEverything } from '../app/storage';
import { Button, ProgressBar } from '../components/ui';
import { toReportSummary } from '../engine/report';
import './email-share.css';

export function EmailShare() {
  const { state, audit, dispatch } = useStore();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const reminderItems = useMemo(
    () => state.items.filter((item) => item.flaggedForReminder && item.nextCharge),
    [state.items],
  );
  const rotationReminderCount = state.rotationRemindersEnabled && audit.rotationPlan ? audit.rotationPlan.months.length : 0;
  const reminderCount = reminderItems.length + rotationReminderCount;
  const doneIds = new Set(state.items.filter((item) => item.done).map((item) => item.id));
  const doneSavings = audit.recommendations
    .filter((recommendation) => doneIds.has(recommendation.itemId))
    .reduce((total, recommendation) => total + recommendation.potentialYearlySaving, 0);
  const hasDoneItems = doneIds.size > 0;
  const shareAmount = hasDoneItems ? doneSavings : audit.potentialYearlySaving;
  const shareStatement = hasDoneItems ? 'I cut' : 'I could cut';
  const hasOptions = state.sendReport || state.enableReminders || state.newsConsent;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.reportEmail);
  const canSubmit = hasOptions && emailValid && (!state.enableReminders || reminderCount > 0) && !sending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!canSubmit) return;
    setSending(true);
    try {
      const safeItems = toReportSummary(audit.items, audit.recommendations);
      const payload = {
        email: state.reportEmail.trim(),
        options: { report: state.sendReport, reminders: state.enableReminders, news: state.newsConsent },
        items: state.sendReport ? safeItems : state.enableReminders ? safeItems.filter((item) => item.nextCharge) : [],
        ...(rotationReminderCount && audit.rotationPlan ? {
          rotationReminders: {
            currency: audit.currency,
            monthlyCost: audit.rotationPlan.newMonthlyCost,
            yearlySaving: audit.rotationPlan.yearlySaving,
            schedule: audit.rotationPlan.months.map(({ month, reminderDate, activeServiceName }) => ({ month, reminderDate, activeServiceName })),
          },
        } : {}),
      };
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; reportSent?: boolean; remindersSaved?: number; newsSaved?: boolean };
      if (!response.ok) throw new Error(result.error || 'We could not send that just now. Please try again.');
      const confirmations = [
        result.reportSent ? 'Your report is on its way.' : '',
        result.remindersSaved ? `${result.remindersSaved} renewal ${result.remindersSaved === 1 ? 'reminder is' : 'reminders are'} set.` : '',
        result.newsSaved ? 'Your news preference is saved.' : '',
      ].filter(Boolean);
      setMessage(confirmations.join(' '));
      setSent(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not send that just now. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="screen email-share-screen">
      <ProgressBar step={4} total={4} />
      <p className="muted mono">YOUR NEXT STEPS</p>
      <h1>Email and share.</h1>
      <p className="muted">Your statement and transaction rows stay on this device. We send only the summary you choose below.</p>

      <ShareCard
        amount={shareAmount}
        currency={audit.currency}
        statement={shareStatement}
        hasDoneItems={hasDoneItems}
      />

      <form className="email-share-form" onSubmit={submit}>
        <label className="email-share-label" htmlFor="report-email">Email address</label>
        <input
          id="report-email"
          className="amount-input email-share-input"
          type="email"
          autoComplete="email"
          required={hasOptions}
          value={state.reportEmail}
          onChange={(event) => dispatch({ type: 'setReportEmail', email: event.target.value })}
          placeholder="you@example.com"
        />

        <label className="consent-card">
          <input type="checkbox" checked={state.sendReport} onChange={(event) => dispatch({ type: 'setEmailConsent', key: 'sendReport', value: event.target.checked })} />
          <span><strong>Send me my audit report.</strong><small>Cut, Look again and Keep, with yearly costs and actions.</small></span>
        </label>
        <label className={`consent-card ${reminderCount ? '' : 'consent-card--muted'}`}>
          <input
            type="checkbox"
            checked={state.enableReminders}
            disabled={reminderCount === 0}
            onChange={(event) => dispatch({ type: 'setEmailConsent', key: 'enableReminders', value: event.target.checked })}
          />
          <span><strong>Remind me 2 days before renewals and streaming switches.</strong><small>{reminderCount ? `${reminderItems.length} renewals and ${rotationReminderCount} rotation switches · reminders for 12 months` : 'Flag an item with a renewal date or choose a streaming rotation first.'}</small></span>
        </label>
        <label className="consent-card">
          <input type="checkbox" checked={state.newsConsent} onChange={(event) => dispatch({ type: 'setEmailConsent', key: 'newsConsent', value: event.target.checked })} />
          <span><strong>Email me occasional news about Enough.</strong><small>A separate choice. You can unsubscribe whenever you like.</small></span>
        </label>

        {message && <p className={sent ? 'email-share-success' : 'error-message'} role="status">{message}</p>}
        {sent ? (
          <Button full type="button" onClick={() => dispatch({ type: 'goto', step: 'cutlist' })}>Back to my audit</Button>
        ) : (
          <Button full type="submit" disabled={!canSubmit}>{sending ? 'Sending…' : 'Send my choices'}</Button>
        )}
      </form>

      <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'cutlist' })}>Back to full list</Button>
      <button
        className="delete-all"
        onClick={async () => {
          await clearEverything();
          dispatch({ type: 'reset' });
        }}
      >Delete everything</button>
    </div>
  );
}

function ShareCard({ amount, currency, statement, hasDoneItems }: { amount: number; currency: string; statement: string; hasDoneItems: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayAmount = formatMoney(amount, currency, { round: true });
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = 1200;
    canvas.height = 630;
    context.fillStyle = '#14204a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#d4ee8a';
    context.fillRect(76, 82, 16, 16);
    context.fillStyle = '#a9b1d6';
    context.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText('ENOUGH  /  MY AUDIT', 118, 100);
    context.fillStyle = '#ffffff';
    context.font = '800 65px system-ui, sans-serif';
    context.fillText(statement, 76, 250);
    context.fillStyle = '#d4ee8a';
    context.font = '800 100px ui-monospace, SFMono-Regular, Menlo, monospace';
    const fittedAmount = displayAmount.length > 12 ? 76 : 100;
    context.font = `800 ${fittedAmount}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.fillText(displayAmount, 76, 385);
    context.fillStyle = '#a9b1d6';
    context.font = '600 36px system-ui, sans-serif';
    context.fillText(hasDoneItems ? 'a year · today' : 'a year · my next move', 80, 462);
    context.fillStyle = '#ffffff';
    context.font = '700 30px system-ui, sans-serif';
    context.fillText('I checked what I pay for.', 80, 548);
  }, [displayAmount, hasDoneItems, statement]);

  async function shareOrDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'enough-audit.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Enough audit' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'enough-audit.png';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="share-card-section" aria-label="Share card">
      <canvas ref={canvasRef} className="share-card-canvas" aria-label={`${statement} ${displayAmount} a year`} />
      <p className="muted share-card-note">{hasDoneItems ? 'Based on the items you marked Done.' : 'Planned saving until you mark an item Done.'}</p>
      <Button variant="secondary" full onClick={shareOrDownload}>Share or save card</Button>
    </section>
  );
}
