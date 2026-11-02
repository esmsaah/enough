// Enough — money formatting. Section 6: always Intl.NumberFormat in the display
// currency. Never hardcode €.

export function formatMoney(amount: number, currency: string, opts: { round?: boolean } = {}): string {
  const maximumFractionDigits = opts.round ? 0 : 2;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits }).format(amount);
  } catch {
    return `${amount.toFixed(maximumFractionDigits)} ${currency}`;
  }
}

/** Per-year cost of an item, by frequency. */
export const YEARLY: Record<'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'oneTime', number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  oneTime: 0,
};

export function yearlyCost(item: { price: number; frequency: keyof typeof YEARLY }): number {
  return Math.round((item.price * YEARLY[item.frequency] + Number.EPSILON) * 100) / 100;
}

/** One-time audit list price. Decided 2026-10-06: €5.99. */
export const AUDIT_PRICE_EUR = 5.99;

/** Fair price by country (Dodo Purchasing Power Parity). These lists must match
 *  the country percentages set in the Dodo dashboard. Every country not listed
 *  pays the full price. 50% is the floor so each sale still pays after fees. */
export const PRICE_TIERS: Array<{ percent: number; countries: string[] }> = [
  { percent: 70, countries: ['HR', 'SI', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'EE', 'LV', 'LT', 'PT', 'GR', 'CY', 'MT', 'CL', 'UY', 'CR', 'PA', 'MY', 'CN'] },
  { percent: 50, countries: [
    'BA', 'RS', 'ME', 'MK', 'AL', 'XK', 'MD', 'UA', 'GE', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'TJ', 'TR',
    'MX', 'BR', 'AR', 'CO', 'PE', 'EC', 'BO', 'PY', 'VE', 'DO', 'GT', 'HN', 'SV', 'NI', 'JM',
    'IN', 'PK', 'BD', 'LK', 'NP', 'ID', 'PH', 'VN', 'TH', 'KH', 'LA', 'MM', 'MN',
    'EG', 'MA', 'DZ', 'TN', 'JO', 'LB', 'IQ', 'PS',
    'NG', 'KE', 'GH', 'ZA', 'ET', 'TZ', 'UG', 'RW', 'SN', 'CI', 'CM', 'ZM', 'ZW', 'MZ', 'AO',
  ] },
];

/** The audit price for a country, in EUR, rounded to cents the way checkout shows it. */
export function auditPrice(country?: string): number {
  const code = (country ?? '').toUpperCase();
  const tier = PRICE_TIERS.find((t) => t.countries.includes(code));
  return tier ? Math.round(AUDIT_PRICE_EUR * tier.percent) / 100 : AUDIT_PRICE_EUR;
}
