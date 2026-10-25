// Enough — reminders (section 7). Dates worth a nudge: a yearly plan about to
// renew, and a free trial about to turn into a paid charge. Shown and (if the
// person opts in) sent; never counted as money found.

import type { Item, Profile, Reminder } from './types';

/** Remind this many days before the charge lands. */
const RENEWAL_LEAD_DAYS = 7;
const TRIAL_LEAD_DAYS = 2;
/** A trial typically runs this long when the person didn't say otherwise. */
const DEFAULT_TRIAL_DAYS = 30;

export function buildReminders(items: Item[], profile: Profile | undefined, createdAt: string): Reminder[] {
  const out: Reminder[] = [];
  const base = isoDay(createdAt);

  // --- Yearly plans: remind before the renewal month comes around. ---
  for (const item of items) {
    const isYearly = item.frequency === 'yearly' || item.billingModel === 'yearly';
    if (!isYearly || typeof item.renewalMonth !== 'number') continue;
    if (item.renewalMonth < 1 || item.renewalMonth > 12) continue;
    const renewal = nextRenewalDate(base, item.renewalMonth);
    out.push({
      kind: 'renewal',
      itemId: item.id,
      label: item.name,
      date: addDays(renewal, -RENEWAL_LEAD_DAYS),
      note: `${item.name} renews for the year around ${humanMonthDay(renewal)} — decide before it charges.`,
    });
  }

  // --- Trials: an explicit per-item end date, or a start date from the profile. ---
  const trialStartByKey = new Map((profile?.recentTrials ?? []).map((t) => [t.merchantKey, t.startDate]));
  for (const item of items) {
    let endsOn = item.trialEndsOn;
    if (!endsOn && item.merchantKey && trialStartByKey.has(item.merchantKey)) {
      endsOn = addDays(isoDay(trialStartByKey.get(item.merchantKey)!), DEFAULT_TRIAL_DAYS);
    }
    if (!endsOn) continue;
    out.push({
      kind: 'trial',
      itemId: item.id,
      label: item.name,
      date: addDays(isoDay(endsOn), -TRIAL_LEAD_DAYS),
      note: `${item.name}'s trial ends ${humanMonthDay(isoDay(endsOn))} — cancel first if you don't want the charge.`,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The next occurrence of day-1 of `month` strictly after `fromIso`. */
function nextRenewalDate(fromIso: string, month: number): string {
  const [y] = fromIso.split('-').map(Number);
  let candidate = isoFromYmd(y!, month, 1);
  if (candidate <= fromIso) candidate = isoFromYmd(y! + 1, month, 1);
  return candidate;
}

function isoDay(value: string): string {
  return value.slice(0, 10);
}
function isoFromYmd(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function humanMonthDay(iso: string): string {
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
