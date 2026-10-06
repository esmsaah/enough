// Enough — outbound summary. Sections 3 & 10 of ENOUGH_BRIEF.md.
// The ONLY item data that may cross to the server (email report, reminders).
// Never merchant strings from the statement, never transaction rows — and for
// a transfer to a private person, never that person's name.

import type { Item, Recommendation } from './types';

export const PRIVATE_TRANSFER_NAME = 'Transfer to a person';

export type ReportLine = {
  name: string; // server-safe display name
  displayCategory: Item['displayCategory'];
  price: number; // per period
  frequency: Item['frequency'];
  yearlyCost: number;
  verdict: Recommendation['verdict'];
  action: Recommendation['action'];
  reason: string;
  priceIncrease?: { from: number; to: number; yearlyIncrease: number };
  nextCharge?: string; // only for flagged items
};

/** The display name that is safe to send to the server for one item. */
export function serverItemName(item: Item): string {
  return item.redactNameOutbound ? PRIVATE_TRANSFER_NAME : item.name;
}

/**
 * Build the summary sent to /api/report. Only whitelisted fields, and a
 * private person's name is replaced before it ever leaves the device.
 * nextCharge is included only for items flagged for a reminder.
 */
export function toReportSummary(items: Item[], recs: Recommendation[]): ReportLine[] {
  const recById = new Map(recs.map((r) => [r.itemId, r]));
  const lines: ReportLine[] = [];
  for (const item of items) {
    const rec = recById.get(item.id);
    if (!rec) continue;
    lines.push({
      name: serverItemName(item),
      displayCategory: item.displayCategory,
      price: item.price,
      frequency: item.frequency,
      yearlyCost: rec.yearlyCost,
      verdict: rec.verdict,
      action: rec.action,
      reason: rec.reason,
      ...(item.priceIncrease ? { priceIncrease: item.priceIncrease } : {}),
      ...(item.flaggedForReminder && item.nextCharge ? { nextCharge: item.nextCharge } : {}),
    });
  }
  return lines;
}
