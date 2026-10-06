import { resetStatements } from '../app/statementImport';
// Screen 10 — email report, renewal reminders and share card (§8, §10).
import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { clearEverything } from '../app/storage';
import { Button, ProgressBar } from '../components/ui';
import { ShareCard } from '../components/ShareCard';
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
        ...(state.enableReminders && rotationReminderCount && audit.rotationPlan ? {
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
      <h1>Keep it close.</h1>
      <p className="muted email-share-intro">We’ll send a short letter with your cut list, and nudge you before the things you flagged renew.</p>

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
        <p className="muted">The one you used at checkout. Change it if you like.</p>

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

      <ShareCard currency={audit.currency} yearlyTotal={audit.yearlyTotal} saving={shareAmount} doneSaving={hasDoneItems} />

      <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'cutlist' })}>Back to full list</Button>
      <button
        className="delete-all"
        onClick={async () => {
          await clearEverything();
          resetStatements();
          dispatch({ type: 'reset' });
        }}
      >Delete everything</button>
    </div>
  );
}
