// Enough — cloud storage plan catalog. §7 cloud-overlap rule.
// Used to suggest the cheapest single plan that fits a person's combined
// storage, instead of paying for two overlapping cloud subscriptions.
// Prices are monthly list prices in EUR; converted to the audit currency by the
// caller and marked estimate. One entry per real plan tier.

import { convert } from './rates';

export type CloudPlan = { provider: string; name: string; gb: number; monthlyEur: number };

// Sorted small→large is not required; the finder scans all.
export const CLOUD_PLANS: CloudPlan[] = [
  { provider: 'Google One', name: 'Google One 100 GB', gb: 100, monthlyEur: 1.99 },
  { provider: 'Google One', name: 'Google One 200 GB', gb: 200, monthlyEur: 2.99 },
  { provider: 'Google One', name: 'Google One 2 TB', gb: 2048, monthlyEur: 9.99 },
  { provider: 'iCloud+', name: 'iCloud+ 50 GB', gb: 50, monthlyEur: 0.99 },
  { provider: 'iCloud+', name: 'iCloud+ 200 GB', gb: 200, monthlyEur: 2.99 },
  { provider: 'iCloud+', name: 'iCloud+ 2 TB', gb: 2048, monthlyEur: 9.99 },
  { provider: 'iCloud+', name: 'iCloud+ 6 TB', gb: 6144, monthlyEur: 29.99 },
  { provider: 'iCloud+', name: 'iCloud+ 12 TB', gb: 12288, monthlyEur: 59.99 },
  { provider: 'Dropbox', name: 'Dropbox Plus 2 TB', gb: 2048, monthlyEur: 11.99 },
  { provider: 'OneDrive', name: 'OneDrive 100 GB', gb: 100, monthlyEur: 2 },
  { provider: 'Microsoft 365', name: 'Microsoft 365 1 TB', gb: 1024, monthlyEur: 7 },
];

/**
 * The cheapest single plan that fits `storageGb`, in the audit currency.
 * Returns the EUR monthly price converted (marked estimate by the caller).
 */
export function cheapestCloudPlan(storageGb: number, currency: string): { name: string; gb: number; monthly: number } | undefined {
  const fitting = CLOUD_PLANS.filter((p) => p.gb >= storageGb).sort((a, b) => a.monthlyEur - b.monthlyEur || a.gb - b.gb);
  const best = fitting[0];
  if (!best) return undefined;
  const monthly = currency.toUpperCase() === 'EUR' ? best.monthlyEur : (convert(best.monthlyEur, 'EUR', currency) ?? best.monthlyEur);
  return { name: best.name, gb: best.gb, monthly: Math.round((monthly + Number.EPSILON) * 100) / 100 };
}
