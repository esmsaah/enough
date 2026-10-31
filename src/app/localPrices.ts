// Enough — verified per-country plan prices.
// Data: research/plans/*.xlsx (official pricing pages, Perplexity research)
// → scripts/build_plans.py → plans.data.json. Re-run the script after adding a sheet.
// The tap list shows each service's typical plan (Standard / Individual) in the
// person's country instead of the US price; all plans stay available for Check.

import PLANS from './plans.data.json';

export type Plan = { name: string; type: string; monthly: number; currency: string; yearly?: number; people?: number };
export type CountryPlans = { plans: Plan[]; checked: string | null; default: number };
export type LocalPrice = { monthly: number; currency: string; plan: string };

const DATA = PLANS as Record<string, Record<string, CountryPlans>>;

/** The app calls Britain 'UK'; research sheets may say 'GB'. */
function normCountry(country: string): string {
  const c = country.toUpperCase();
  return c === 'GB' ? 'UK' : c;
}

/** All researched plans for a service in a country, or undefined if not researched. */
export function plansFor(merchantKey: string, country: string): CountryPlans | undefined {
  return DATA[merchantKey]?.[normCountry(country)];
}

/** The typical plan price for a service in a country. */
export function localPrice(merchantKey: string, country: string): LocalPrice | undefined {
  const e = plansFor(merchantKey, country);
  const p = e?.plans[e.default];
  return p ? { monthly: p.monthly, currency: p.currency, plan: p.name } : undefined;
}

export function withLocalPrice<T extends { merchantKey: string; price: number; currency?: string }>(pick: T, country: string): T {
  const p = localPrice(pick.merchantKey, country);
  return p ? { ...pick, price: p.monthly, currency: p.currency } : pick;
}
