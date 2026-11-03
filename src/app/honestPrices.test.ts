import { describe, expect, it } from 'vitest';
import localCore from './localCore.data.json';
import plans from './plans.data.json';
import { tapListForCountry, PLACEHOLDER_PRICES } from './tapList';
import { RATES_PER_EUR } from '../engine/rates';

/** Real prices that happen to be round numbers (checked on the official page). */
const VERIFIED = new Set(['grammarly']);
const COUNTRIES = [...new Set((localCore as Array<{ region: string }>).map((x) => x.region))];

describe('no guessed prices on the tap list', () => {
  for (const c of COUNTRIES) {
    it(c, () => {
      for (const p of tapListForCountry(c)) {
        if (p.askPrice || p.priceUnknown || VERIFIED.has(p.merchantKey) || (plans as Record<string, Record<string, { verified?: boolean }>>)[p.merchantKey]?.[c]?.verified) continue;
        expect(PLACEHOLDER_PRICES.has(p.price), `${c} ${p.name} has a placeholder price ${p.price}`).toBe(false);
        expect(RATES_PER_EUR[p.currency ?? 'EUR'], `${c} ${p.name} currency ${p.currency} has no rate`).toBeTypeOf('number');
      }
    });
  }
  it('Serbian utilities are asked, not guessed', () => {
    const rs = tapListForCountry('RS');
    for (const n of ['EPS Snabdevanje', 'Infostan', 'Srbijagas']) expect(rs.find((p) => p.name === n)?.askPrice).toBe(true);
    expect(rs.find((p) => p.name === 'RTS taksa')?.price).toBe(349);
  });
});

describe('plan prices are in a sane range after conversion', () => {
  it('every plan is between €0.5 and €100 a month', () => {
    const bad: string[] = [];
    for (const [svc, byCountry] of Object.entries(plans as Record<string, Record<string, { plans: Array<{ currency: string; monthly: number; name: string }> }>>)) {
      for (const [c, v] of Object.entries(byCountry)) for (const p of v.plans) {
        const r = RATES_PER_EUR[p.currency];
        if (!r) { bad.push(`${svc} ${c} ${p.currency} no rate`); continue; }
        const eur = p.monthly / r;
        if (eur < 0.5 || eur > 100) bad.push(`${svc} ${c} ${p.name} ${p.monthly} ${p.currency} = €${eur.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
