// Enough — verified per-country Netflix prices (research/Netflix Plans by Country).
// The Standard plan is the typical price most people pay; used as the tap-list
// default for Netflix so a country sees a realistic amount, not the US price.
// Source: Netflix help pages, checked 2026-10-25.

export type LocalPrice = { monthly: number; currency: string };

export const NETFLIX_BY_COUNTRY: Record<string, LocalPrice> = {
  AE: { monthly: 49, currency: 'AED' },
  AL: { monthly: 7.99, currency: 'EUR' },
  AR: { monthly: 14999, currency: 'ARS' },
  AT: { monthly: 15.99, currency: 'EUR' },
  AU: { monthly: 20.99, currency: 'AUD' },
  BA: { monthly: 7.99, currency: 'EUR' },
  BD: { monthly: 7.99, currency: 'USD' },
  BE: { monthly: 16.99, currency: 'EUR' },
  BG: { monthly: 8.99, currency: 'EUR' },
  BH: { monthly: 10.49, currency: 'USD' },
  BR: { monthly: 51.9, currency: 'BRL' },
  CA: { monthly: 18.99, currency: 'CAD' },
  CH: { monthly: 22.9, currency: 'CHF' },
  CL: { monthly: 9990, currency: 'CLP' },
  CO: { monthly: 32900, currency: 'COP' },
  CY: { monthly: 12.49, currency: 'EUR' },
  CZ: { monthly: 339, currency: 'CZK' },
  DE: { monthly: 15.99, currency: 'EUR' },
  DK: { monthly: 149, currency: 'DKK' },
  DZ: { monthly: 7.99, currency: 'USD' },
  EE: { monthly: 9.99, currency: 'EUR' },
  EG: { monthly: 190, currency: 'EGP' },
  ES: { monthly: 14.99, currency: 'EUR' },
  FI: { monthly: 15.99, currency: 'EUR' },
  FR: { monthly: 14.99, currency: 'EUR' },
  GH: { monthly: 7.99, currency: 'USD' },
  GR: { monthly: 12.49, currency: 'EUR' },
  HK: { monthly: 98, currency: 'HKD' },
  HR: { monthly: 9.99, currency: 'EUR' },
  HU: { monthly: 4490, currency: 'HUF' },
  ID: { monthly: 120000, currency: 'IDR' },
  IE: { monthly: 18.99, currency: 'EUR' },
  IL: { monthly: 54.9, currency: 'ILS' },
  IN: { monthly: 499, currency: 'INR' },
  IS: { monthly: 16.99, currency: 'EUR' },
  IT: { monthly: 13.99, currency: 'EUR' },
  JO: { monthly: 7.99, currency: 'USD' },
  JP: { monthly: 1590, currency: 'JPY' },
  KE: { monthly: 700, currency: 'KES' },
  KR: { monthly: 13500, currency: 'KRW' },
  KW: { monthly: 11.99, currency: 'USD' },
  KZ: { monthly: 9.99, currency: 'EUR' },
  LB: { monthly: 7.99, currency: 'USD' },
  LT: { monthly: 10.99, currency: 'EUR' },
  LU: { monthly: 16.99, currency: 'EUR' },
  LV: { monthly: 9.99, currency: 'EUR' },
  MA: { monthly: 80, currency: 'MAD' },
  MD: { monthly: 9.99, currency: 'EUR' },
  ME: { monthly: 7.99, currency: 'EUR' },
  MK: { monthly: 7.99, currency: 'EUR' },
  MT: { monthly: 13.99, currency: 'EUR' },
  MX: { monthly: 269, currency: 'MXN' },
  MY: { monthly: 55.9, currency: 'MYR' },
  NG: { monthly: 6500, currency: 'NGN' },
  NL: { monthly: 15.99, currency: 'EUR' },
  NO: { monthly: 149, currency: 'NOK' },
  NZ: { monthly: 25.99, currency: 'NZD' },
  OM: { monthly: 10.49, currency: 'USD' },
  PA: { monthly: 9.99, currency: 'USD' },
  PE: { monthly: 44.9, currency: 'PEN' },
  PH: { monthly: 449, currency: 'PHP' },
  PK: { monthly: 800, currency: 'PKR' },
  PL: { monthly: 55, currency: 'PLN' },
  PT: { monthly: 12.99, currency: 'EUR' },
  QA: { monthly: 11.99, currency: 'USD' },
  RO: { monthly: 10.99, currency: 'EUR' },
  RS: { monthly: 8.99, currency: 'EUR' },
  SA: { monthly: 49, currency: 'SAR' },
  SE: { monthly: 169, currency: 'SEK' },
  SG: { monthly: 22.98, currency: 'SGD' },
  SI: { monthly: 8.99, currency: 'EUR' },
  SK: { monthly: 11.49, currency: 'EUR' },
  TH: { monthly: 349, currency: 'THB' },
  TR: { monthly: 389.99, currency: 'TRY' },
  TW: { monthly: 380, currency: 'TWD' },
  UA: { monthly: 7.49, currency: 'EUR' },
  UG: { monthly: 7.99, currency: 'USD' },
  GB: { monthly: 13.99, currency: 'GBP' },
  US: { monthly: 19.99, currency: 'USD' },
  VN: { monthly: 231000, currency: 'VND' },
  XK: { monthly: 7.99, currency: 'EUR' },
  ZA: { monthly: 179, currency: 'ZAR' },
};

/** Verified per-country default prices, keyed by merchant then ISO country. */
export const LOCAL_PRICES: Record<string, Record<string, LocalPrice>> = {
  netflix: NETFLIX_BY_COUNTRY,
};

/** If we have a verified local price for this merchant + country, return a copy
 *  of the pick priced in the local currency; otherwise the pick unchanged. */
export function withLocalPrice<T extends { merchantKey: string; price: number; currency?: string }>(pick: T, country: string): T {
  const p = LOCAL_PRICES[pick.merchantKey]?.[country.toUpperCase()];
  return p ? { ...pick, price: p.monthly, currency: p.currency } : pick;
}
