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

/** One-time audit price. Decided 2026-10-06: €5.99 (≈ €4 net after VAT, Lemon Squeezy fee and AI cost). */
export const AUDIT_PRICE_EUR = 5.99;
