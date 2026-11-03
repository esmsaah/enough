// Enough — the "how" behind every change in the full list. Each recommendation
// gets concrete steps and a deadline, so the paid list is a plan, not a verdict
// the person already knew. Only stable, well-known account pages are linked;
// everything else gets the general path, which works for almost every service.

import type { Advice, Audit, Item, Recommendation } from './types';

/** Account/cancel pages that have been stable for years. */
const ACCOUNT_PAGES: Record<string, string> = {
  netflix: 'https://www.netflix.com/cancelplan',
  spotify: 'https://www.spotify.com/account/subscription/',
  'disney+': 'https://www.disneyplus.com/account/subscription',
  'youtube premium': 'https://www.youtube.com/paid_memberships',
  dropbox: 'https://www.dropbox.com/account/plan',
  // Checked November 2026.
  chatgpt: 'https://help.openai.com/en/articles/7232927-how-do-i-cancel-my-chatgpt-plus-subscription',
  adobe: 'https://account.adobe.com/plans',
  'adobe creative cloud': 'https://account.adobe.com/plans',
  'google one': 'https://one.google.com/settings',
  nordvpn: 'https://my.nordaccount.com/',
  expressvpn: 'https://www.expressvpn.com/subscriptions',
  microsoft: 'https://account.microsoft.com/services',
  'microsoft 365': 'https://account.microsoft.com/services',
  // Apple services are all cancelled in the Apple account.
  apple: 'https://support.apple.com/en-us/118428',
  icloud: 'https://support.apple.com/en-us/118428',
  'icloud+': 'https://support.apple.com/en-us/118428',
  'apple music': 'https://support.apple.com/en-us/118428',
  'apple tv+': 'https://support.apple.com/en-us/118428',
  'apple arcade': 'https://support.apple.com/en-us/118428',
};

export type HowTo = { steps: string[]; link?: string; deadline?: string };

function accountLink(item: Item): string | undefined {
  return item.cancelUrl ?? (item.merchantKey ? ACCOUNT_PAGES[item.merchantKey] : undefined);
}

function humanDate(iso: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

function cancelSteps(item: Item): string[] {
  const link = accountLink(item);
  if (item.merchantKey === 'youtube premium') {
    return [
      'Pause instead of cancelling. In YouTube, go to Purchases and memberships, choose YouTube Premium, then Pause, for 1 to 6 months.',
      'Pausing is not offered for yearly plans or when you pay through Apple. Then cancel instead.',
    ];
  }
  if (item.category === 'membership') {
    return [
      `Tell ${item.name} at the desk or in writing that you are cancelling, and ask for a confirmation.`,
      'Stopping the bank payment alone does not end a membership.',
    ];
  }
  return [
    ...(item.frequency === 'yearly' ? ['Yearly plan: cancel now so it does not renew. You keep it until the paid year ends.'] : []),
    link ? `Open your ${item.name} account page (link below) and choose Cancel.` : `Open ${item.name} in a browser, go to Account, then Subscription or Billing, and choose Cancel.`,
    'Paying through the App Store or Google Play? Cancel on the phone instead. iPhone: Settings, your name, Subscriptions. Android: Play Store, Payments & subscriptions.',
  ];
}

/** The next charge on or after today: an older statement's prediction is rolled forward. */
export function upcomingCharge(item: Item, today: string): string | undefined {
  if (!item.nextCharge) return undefined;
  const step = item.frequency === 'yearly' ? 12 : item.frequency === 'quarterly' ? 3 : item.frequency === 'monthly' ? 1 : 0;
  let d = item.nextCharge.slice(0, 10);
  if (step === 0) return d >= today ? d : undefined;
  for (let n = 0; d < today && n < 60; n++) d = plusMonths(d, step);
  return d;
}

function deadlineFor(item: Item, money: (n: number) => string, today: string): string {
  const next = upcomingCharge(item, today);
  return next
    ? `Before ${humanDate(next)}, when the next ${money(item.price)} would be charged. You keep access until then.`
    : 'Any time. You usually keep access until the end of the period you already paid.';
}

export function howToFor(rec: Recommendation, item: Item, audit: Audit, money: (n: number) => string): HowTo {
  const link = accountLink(item);
  const withLink = (h: HowTo): HowTo => (link ? { ...h, link } : h);
  switch (rec.action) {
    case 'cancel':
      if (item.category === 'membership' && (item.contract === 'unsure' || item.contract === 'contract')) return gymContractHowTo(item);
      return withLink({ steps: cancelSteps(item), deadline: deadlineFor(item, money, audit.createdAt) });
    case 'removeOverlap': {
      const save = item.overlapGroup === 'cloud' || item.displayCategory === 'Cloud & Storage'
        ? 'Move your files to the service you keep first. Check the storage there is big enough.'
        : item.overlapGroup === 'music' || item.merchantKey === 'spotify'
          ? 'Save your playlists first. Playlist transfer tools can copy them to the app you keep.'
          : 'Save anything you would lose first.';
      return withLink({ steps: [save, ...cancelSteps(item)], deadline: deadlineFor(item, money, audit.createdAt) });
    }
    case 'changePlan': {
      const np = rec.opp?.newPlan;
      return withLink({
        steps: [
          np ? `In your ${item.name} account, choose Change plan and pick ${np.name}.` : `In your ${item.name} account, choose Change plan.`,
          'The change starts with your next payment, so nothing you already paid is lost.',
          'Paying through the App Store or Google Play? Change the plan there instead.',
        ],
        ...(rec.opp?.deadline ? { deadline: `Before ${humanDate(rec.opp.deadline)}.` } : {}),
      });
    }
    case 'sharePlan': {
      const np = rec.opp?.newPlan;
      return withLink({
        steps: [
          np ? `One of you switches to ${np.name} and invites the other from the account page.` : 'One of you switches to the shared plan and invites the other.',
          'The other person cancels their own plan once they are in, before their next payment.',
          'Everyone on the plan must live at the same address.',
        ],
        ...(rec.opp?.deadline ? { deadline: `Before ${humanDate(rec.opp.deadline)}.` } : {}),
      });
    }
    case 'rotate': {
      const mine = rec.opp?.schedule?.find((x) => x.service === item.name);
      if (mine) {
        return withLink({
          steps: [
            ...mine.steps.map((st) => st.charAt(0).toUpperCase() + st.slice(1).replace(/(\d{4}-\d{2}-\d{2})/g, (d) => humanDate(d)) + '.'),
            'Your account and profiles stay when you cancel a monthly plan, so restarting takes a minute.',
            'The calendar file below reminds you of every date.',
          ],
        });
      }
      const months = (rec.pauseMonths ?? []).map((ym) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`)));
      return withLink({
        steps: [
          months.length ? `Cancel ${item.name} before ${months[0]} and restart it in the month after ${months[months.length - 1]}.` : `Pause ${item.name} for four months.`,
          item.merchantKey === 'netflix'
            ? 'Netflix keeps your profiles and viewing history for 24 months after you cancel, so restarting takes a minute.'
            : 'Your account stays when you cancel a monthly plan, so restarting later takes a minute. A new trial is usually not offered.',
          'Paying through the App Store or Google Play? Cancel and restart it on the phone.',
          'The calendar file below reminds you when to pause and when to restart.',
        ],
      });
    }
    case 'payPerVisit':
      if (item.contract === 'unsure' || item.contract === 'contract') return gymContractHowTo(item);
      return { steps: [
        'Ask at the desk for a single-visit price or a 10-visit card.',
        'Then cancel or freeze the membership before the next monthly payment.',
      ], ...(upcomingCharge(item, audit.createdAt) ? { deadline: `Before ${humanDate(upcomingCharge(item, audit.createdAt)!)}.` } : {}) };
    case 'switchYearly':
      return withLink({ steps: [`In your ${item.name} account, change billing from monthly to yearly.`, 'Do it right before the next monthly charge so no month is paid twice.'] });
    case 'checkRefund': {
      const d = item.possibleDuplicateCharge;
      return withLink({ steps: [
        d ? `Write to ${item.name} support. Say you were charged ${money(d.amount)} twice, on ${humanDate(d.firstCharge)} and ${humanDate(d.secondCharge)}, and ask for a refund of one.` : `Write to ${item.name} support and ask for a refund of the double charge.`,
        'No answer in a week? Your bank can dispute the second charge.',
      ] });
    }
    case 'familyPlan':
      return withLink({ steps: ['You pay for this twice. Keep one account, or move both people to one family plan.'] });
    default:
      return { steps: [] };
  }
}

/** Memberships under contract: notice on time, not "cancel now". */
function gymContractHowTo(item: Item): HowTo {
  if (item.contract === 'unsure' || !item.contractEnds) {
    return { steps: [
      'Find your contract or ask at the desk: how long it runs, and how much notice you must give.',
      'If it renews by itself, note the last day to give notice. Ask whether a freeze is possible, but it usually makes the contract longer.',
    ] };
  }
  const notice = noticeDate(item.contractEnds);
  return { steps: [
    `Give written notice before ${humanDate(notice)}. Most contracts need about a month, so check yours.`,
    'Keep the confirmation. Stopping the payments alone does not end a contract.',
    'Until it ends, go as often as you like, it is already paid.',
  ], deadline: `Before ${humanDate(notice)}.` };
}

/** About five weeks before the contract's last month ends. */
function noticeDate(contractEnds: string): string {
  const [y, m] = contractEnds.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return minusDays(lastDay, 35);
}

/** The one thing to say or do for a piece of advice. */
export function howToForAdvice(a: Advice): string {
  switch (a.kind) {
    case 'compareOffers':
      return `Call ${a.name} and say: "I've been a customer for a while and new customers get better prices. Can you give me your current offer, or I'll compare and switch."`;
    case 'cheaperPlan':
      return `In your ${a.name} account, choose Change plan.`;
    case 'habit':
      return 'Set yourself a monthly amount for it and check it once a month. No need to stop, just to see it.';
    case 'sharePlan':
      return `One of you switches to the shared plan and invites the other. Then the second account is cancelled.`;
    case 'spending':
      return '';
  }
}

/** "A plan for the money": what the yearly saving equals in something they already pay for. */
export function moneyPlan(audit: Audit): { months: number; name: string } | undefined {
  const saving = audit.potentialYearlySaving;
  if (saving <= 0) return undefined;
  const cutIds = new Set(audit.recommendations.filter((r) => r.potentialYearlySaving > 0).map((r) => r.itemId));
  const monthly = (i: Item) => (i.frequency === 'yearly' ? i.price / 12 : i.frequency === 'weekly' ? (i.price * 52) / 12 : i.frequency === 'quarterly' ? i.price / 3 : i.price);
  const candidates = [...audit.bills, ...audit.items].filter((i) => !cutIds.has(i.id) && monthly(i) > 0 && saving / monthly(i) >= 2);
  const best = candidates.sort((a, b) => monthly(b) - monthly(a))[0];
  return best ? { months: Math.floor(saving / monthly(best)), name: best.name } : undefined;
}

// ---------------------------------------------------------------------------
// Calendar file: every deadline and switch, so the plan runs itself for a year.
// ---------------------------------------------------------------------------

export type CalendarEvent = { date: string; title: string; note: string };

export function calendarEvents(audit: Audit, money: (n: number) => string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const byId = new Map(audit.items.map((i) => [i.id, i]));
  for (const r of audit.recommendations) {
    const item = byId.get(r.itemId);
    if (!item || r.potentialYearlySaving <= 0) continue;
    const next = upcomingCharge(item, audit.createdAt);
    const actNow = r.action === 'cancel' || r.action === 'removeOverlap' || r.action === 'payPerVisit';
    // No charge date known (tapped, not from a statement): remind tomorrow, so it gets done.
    if (!next && actNow && !(item.category === 'membership' && (item.contract === 'contract' || item.contract === 'unsure'))) {
      out.push({ date: plusDays(audit.createdAt, 1), title: `Cancel ${item.name}`, note: `${r.reason} Saves about ${money(r.potentialYearlySaving)} a year.` });
      continue;
    }
    if (!next) continue;
    if (actNow) {
      out.push({ date: minusDays(next, 2), title: `Cancel ${item.name}`, note: `${item.name} charges ${money(item.price)} on ${humanDate(next)}. Cancel before then.` });
    }
  }
  for (const item of audit.items) {
    if (item.category !== 'membership' || item.contract !== 'contract' || !item.contractEnds) continue;
    const notice = noticeDate(item.contractEnds);
    if (notice >= audit.createdAt) out.push({ date: minusDays(notice, 7), title: `Give notice: ${item.name}`, note: `Your contract ends ${item.contractEnds}. Send written notice before ${humanDate(notice)} so it doesn't renew.` });
  }
  const seenSchedules = new Set<string>();
  for (const r of audit.recommendations) {
    if ((r.action === 'changePlan' || r.action === 'sharePlan') && r.opp?.deadline) {
      const item = byId.get(r.itemId);
      if (item) out.push({ date: minusDays(r.opp.deadline, 2), title: `${item.name}: switch to ${r.opp.newPlan?.name ?? 'the cheaper plan'}`, note: `${r.reason} Saves about ${money(r.potentialYearlySaving)} in the next 12 months.` });
    }
    if (r.action !== 'rotate' || !r.opp?.schedule) continue;
    const key = r.opp.schedule.map((x) => x.service).join('+');
    if (seenSchedules.has(key)) continue;
    seenSchedules.add(key);
    for (const block of r.opp.schedule) {
      const cancel = block.steps.map((st) => st.match(/cancel before (\d{4}-\d{2}-\d{2})/)?.[1]).filter((d): d is string => !!d);
      for (const d of cancel) out.push({ date: minusDays(d, 2), title: `Cancel ${block.service}`, note: `Your streaming rotation: cancel ${block.service} before ${humanDate(d)}. You keep access until then.` });
      const restart = block.steps.map((st) => st.match(/subscribe again on (\d{4}-\d{2}-\d{2})/)?.[1]).find((d) => !!d);
      if (restart) out.push({ date: restart, title: `Restart ${block.service}`, note: `Your streaming rotation: ${block.service} is on from today until ${humanDate(block.off)}.` });
    }
  }
  for (const r of audit.recommendations) {
    if (r.action !== 'rotate' || r.opp || !r.pauseMonths?.length) continue;
    const item = byId.get(r.itemId);
    if (!item) continue;
    const first = `${r.pauseMonths[0]}-01`;
    const after = plusMonths(`${r.pauseMonths[r.pauseMonths.length - 1]}-01`, 1);
    out.push({ date: minusDays(first, 2), title: `Pause ${item.name}`, note: `Cancel ${item.name} now. Its four-month pause starts ${humanDate(first)}.` });
    out.push({ date: after, title: `Restart ${item.name} if you want it`, note: `The pause is over. Restart ${item.name} only if there's something you want to watch.` });
  }
  for (const r of audit.reminders) out.push({ date: r.date, title: r.kind === 'trial' ? `${r.label}: trial turns paid soon` : `${r.label} renews soon`, note: r.note });
  out.push({ date: plusMonths(audit.createdAt, 12), title: 'Enough: check your subscriptions again', note: 'A year has passed. Prices change and new subscriptions creep in.' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function toIcs(events: CalendarEvent[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const day = (iso: string) => iso.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Enough//Audit//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e, n) => {
    const next = new Date(Date.parse(`${e.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    lines.push('BEGIN:VEVENT', `UID:enough-${day(e.date)}-${n}@enough`, `DTSTAMP:${day(e.date)}T090000Z`, `DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(next)}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.note)}`, 'BEGIN:VALARM', 'TRIGGER:PT9H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function plusDays(iso: string, d: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
}

function minusDays(iso: string, d: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
}
function plusMonths(iso: string, m: number): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, mo! - 1 + m, d!)).toISOString().slice(0, 10);
}
