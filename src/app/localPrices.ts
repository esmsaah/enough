// Enough — verified per-country plan prices.
// Data: research/plans/*.xlsx (official pricing pages, Perplexity research)
// → scripts/build_plans.py → plans.data.json. Re-run the script after adding a sheet.
// The tap list shows each service's typical plan (Standard / Individual) in the
// person's country instead of the US price; all plans stay available for Check.

import PLANS from './plans.data.json';
import GYMS from './gyms.data.json';
import { convert } from '../engine/rates';

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

export function withLocalPrice<T extends { merchantKey: string; price: number; currency?: string; yearlyPrice?: number; planName?: string }>(pick: T, country: string): T {
  const e = plansFor(pick.merchantKey, country);
  const p = e?.plans[e.default];
  if (!p) return pick;
  // A yearly price only when this country sells one (stored in EUR for rule 8).
  const { yearlyPrice: _drop, ...rest } = pick;
  const yearlyEur = p.yearly ? (p.currency === 'EUR' ? p.yearly : convert(p.yearly, p.currency, 'EUR')) : undefined;
  return { ...rest, price: p.monthly, currency: p.currency, planName: p.name, ...(yearlyEur ? { yearlyPrice: yearlyEur } : {}) } as T;
}

/** Plans someone could actually pick on the Check card (no student/family deals). */
export function personalPlans(merchantKey: string, country: string): Plan[] {
  return (plansFor(merchantKey, country)?.plans ?? []).filter((p) => !['student', 'family', 'duo'].includes(p.type));
}

/** The cheapest personal plan below the one the person has, if any. */
export function cheaperPlanFor(merchantKey: string | undefined, planName: string | undefined, monthly: number, currency: string, country: string, needPeople?: number): { name: string; monthly: number; currency: string } | undefined {
  if (!merchantKey) return undefined;
  const plans = personalPlans(merchantKey, country).filter((p) => !needPeople || (p.people ?? 1) >= needPeople);
  if (plans.length < 2) return undefined;
  // Storage tiers (50 GB, 2 TB…): a smaller plan only helps if the files fit, which we can't know.
  if (plans.every((p) => /^\d+(gb|tb)$/.test(p.type))) return undefined;
  const current = plans.find((p) => p.name === planName);
  const allowAds = current ? /ads/i.test(current.name) : false;
  const inCur = (p: Plan) => (p.currency === currency ? p.monthly : convert(p.monthly, p.currency, currency) ?? p.monthly);
  const cheapest = plans.filter((p) => allowAds || !/ads/i.test(p.name)).sort((a, b) => inCur(a) - inCur(b))[0];
  if (!cheapest || inCur(cheapest) >= monthly - 0.01) return undefined;
  return { name: cheapest.name, monthly: inCur(cheapest), currency };
}

/** A shared plan (Duo/Family) for two people who each pay for their own account. */
export function sharePlanFor(merchantKey: string | undefined, monthly: number, currency: string, country: string): { name: string; monthly: number; currency: string; people: number } | undefined {
  if (!merchantKey) return undefined;
  const shared = (plansFor(merchantKey, country)?.plans ?? []).filter((p) => (p.type === 'duo' || p.type === 'family') && (p.people ?? 2) >= 2);
  const inCur = (p: Plan) => (p.currency === currency ? p.monthly : convert(p.monthly, p.currency, currency) ?? p.monthly);
  const best = shared.sort((a, b) => inCur(a) - inCur(b))[0];
  if (!best || inCur(best) >= monthly * 2 - 0.01) return undefined;
  return { name: best.name, monthly: inCur(best), currency, people: best.people ?? 2 };
}

/** Whether a service sells plans for several screens or several people. */
export function planShape(merchantKey: string | undefined, country: string): { screens: boolean; shared: boolean } {
  const plans = merchantKey ? plansFor(merchantKey, country)?.plans ?? [] : [];
  const personal = plans.filter((p) => !['student', 'family', 'duo'].includes(p.type));
  return {
    screens: new Set(personal.map((p) => p.people ?? 1)).size > 1,
    shared: plans.some((p) => p.type === 'duo' || p.type === 'family'),
  };
}

/** Typical monthly gym fee in a country, in EUR (Numbeo, research/gyms.csv). */
export function typicalGymEur(country: string): number | undefined {
  return (GYMS as Record<string, number>)[normCountry(country)];
}
