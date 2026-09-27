import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import {
  PAYWALL_MIN_SAVING_EUR,
  monthlyEquivalent,
  paywallThreshold,
  runAudit,
  yearlyCost,
} from './score';

let counter = 0;
function item(partial: Partial<Item> = {}): Item {
  counter += 1;
  return {
    id: partial.id ?? `i${counter}`,
    name: partial.name ?? 'Some Service',
    category: 'digital',
    displayCategory: 'Entertainment',
    price: 10,
    frequency: 'monthly',
    source: 'statement',
    estimate: false,
    currency: 'EUR',
    ...partial,
  };
}

/** Run the audit over a single item and return its recommendation. */
function scoreOne(partial: Partial<Item>) {
  const it = item(partial);
  const audit = runAudit([it]);
  return audit.recommendations[0]!;
}

describe('yearly cost by frequency', () => {
  it('multiplies price by 52 / 12 / 4 / 1', () => {
    expect(yearlyCost({ price: 2, frequency: 'weekly' })).toBe(104);
    expect(yearlyCost({ price: 10, frequency: 'monthly' })).toBe(120);
    expect(yearlyCost({ price: 90, frequency: 'quarterly' })).toBe(360);
    expect(yearlyCost({ price: 84.99, frequency: 'yearly' })).toBe(84.99);
  });
  it('monthly equivalent divides the yearly cost by 12', () => {
    expect(monthlyEquivalent({ price: 90, frequency: 'quarterly' })).toBe(30);
  });
});

describe('rule 1 — clearly unused → cancel, saving = full yearly cost', () => {
  it('cuts a digital item used almost never', () => {
    const r = scoreOne({ category: 'digital', usage: 'almostNever', price: 10.99, frequency: 'monthly' });
    expect(r.verdict).toBe('cut');
    expect(r.action).toBe('cancel');
    expect(r.potentialYearlySaving).toBe(131.88);
  });
  it('cuts a membership with zero visits', () => {
    const r = scoreOne({ category: 'membership', displayCategory: 'Fitness & Health', visitsPerMonth: 0, price: 40 });
    expect(r.verdict).toBe('cut');
    expect(r.action).toBe('cancel');
    expect(r.potentialYearlySaving).toBe(480);
  });
  it('cuts a digital item used sometimes and not missed', () => {
    const r = scoreOne({ category: 'digital', usage: 'sometimes', wouldMiss: false, price: 10, frequency: 'monthly' });
    expect(r.verdict).toBe('cut');
    expect(r.action).toBe('cancel');
    expect(r.potentialYearlySaving).toBe(120);
  });
  it('keeps a digital item used sometimes but missed', () => {
    const r = scoreOne({ category: 'digital', usage: 'sometimes', wouldMiss: true });
    expect(r.verdict).toBe('keep');
  });
});

describe('rule 2 — same service charged twice → look again, family plan', () => {
  it('flags the extra charge, keeps the primary', () => {
    const a = item({ id: 'sp1', name: 'Spotify', merchantKey: 'spotify', usage: 'always', price: 10.99 });
    const b = item({ id: 'sp2', name: 'Spotify', merchantKey: 'spotify', usage: 'sometimes', price: 10.99, wouldMiss: true });
    const audit = runAudit([a, b]);
    const recA = audit.recommendations.find((r) => r.itemId === 'sp1')!;
    const recB = audit.recommendations.find((r) => r.itemId === 'sp2')!;
    expect(recA.action).toBe('keep'); // most used is primary
    expect(recB.action).toBe('familyPlan');
    expect(recB.verdict).toBe('lookAgain');
    expect(recB.potentialYearlySaving).toBe(131.88); // yearly cost of the second charge
  });
});

describe('rule 3 — overlap groups (music/cloud/ai): keep most used, drop the rest', () => {
  it('drops the less-used member of a music overlap', () => {
    const spotify = item({ id: 'sp', name: 'Spotify', merchantKey: 'spotify', overlapGroup: 'music', usage: 'always', price: 10.99 });
    const yt = item({ id: 'yt', name: 'YouTube Premium', merchantKey: 'youtube premium', overlapGroup: 'music', usage: 'sometimes', wouldMiss: true, price: 13.99 });
    const audit = runAudit([spotify, yt]);
    const recSp = audit.recommendations.find((r) => r.itemId === 'sp')!;
    const recYt = audit.recommendations.find((r) => r.itemId === 'yt')!;
    expect(recSp.action).toBe('keep');
    expect(recYt.action).toBe('removeOverlap');
    expect(recYt.verdict).toBe('lookAgain');
    expect(recYt.reason).toContain('Spotify');
    expect(recYt.potentialYearlySaving).toBe(yearlyCost(yt));
  });
  it('on a tie in usage keeps the cheaper one', () => {
    const a = item({ id: 'a', name: 'iCloud+', merchantKey: 'icloud', overlapGroup: 'cloud', usage: 'sometimes', wouldMiss: true, price: 2.99 });
    const b = item({ id: 'b', name: 'Dropbox', merchantKey: 'dropbox', overlapGroup: 'cloud', usage: 'sometimes', wouldMiss: true, price: 11.99 });
    const audit = runAudit([a, b]);
    expect(audit.recommendations.find((r) => r.itemId === 'a')!.action).toBe('keep');
    expect(audit.recommendations.find((r) => r.itemId === 'b')!.action).toBe('removeOverlap');
  });
  it('video is NOT handled by the generic overlap rule', () => {
    const netflix = item({ id: 'n', name: 'Netflix', overlapGroup: 'video', usage: 'always', price: 15.99 });
    const disney = item({ id: 'd', name: 'Disney+', overlapGroup: 'video', usage: 'always', price: 10.99 });
    const audit = runAudit([netflix, disney]);
    // both used "always" → neither is a rotate loser, both keep
    expect(audit.recommendations.every((r) => r.action === 'keep')).toBe(true);
  });
});

describe('rule 4 — two+ video services watched sometimes → rotate, saving = monthly × 4', () => {
  it('keeps one and pauses the other', () => {
    const netflix = item({ id: 'n', name: 'Netflix', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true, price: 15.99 });
    const max = item({ id: 'm', name: 'Max', overlapGroup: 'video', usage: 'sometimes', wouldMiss: true, price: 10.99 });
    const audit = runAudit([netflix, max]);
    const recN = audit.recommendations.find((r) => r.itemId === 'n')!;
    const recM = audit.recommendations.find((r) => r.itemId === 'm')!;
    // most used tie → cheaper kept (Max)
    expect(recM.action).toBe('keep');
    expect(recN.action).toBe('rotate');
    expect(recN.verdict).toBe('lookAgain');
    expect(recN.potentialYearlySaving).toBe(63.96); // 15.99 × 4
  });
});

describe('rules 5 & 6 — memberships vs per-visit cost', () => {
  it('rule 5: single price × visits < monthly → cut, payPerVisit with a number', () => {
    // €40/mo gym, 2 visits, €13.33 single → 26.66 < 40 → cut
    const r = scoreOne({
      category: 'membership', displayCategory: 'Fitness & Health',
      price: 40, frequency: 'monthly', visitsPerMonth: 2, singleVisitPrice: 13.33,
    });
    expect(r.verdict).toBe('cut');
    expect(r.action).toBe('payPerVisit');
    expect(r.potentialYearlySaving).toBe(160.08); // (40 - 13.33×2) × 12 = 160.08
  });
  it('rule 6: <=4 visits, no single price → look again, saving 0 (no invented number)', () => {
    const r = scoreOne({
      category: 'membership', displayCategory: 'Fitness & Health',
      price: 40, frequency: 'monthly', visitsPerMonth: 3,
    });
    expect(r.verdict).toBe('lookAgain');
    expect(r.action).toBe('payPerVisit');
    expect(r.potentialYearlySaving).toBe(0);
    expect(r.reason).toContain('per-visit');
  });
  it('keeps a well-used membership (many visits, no cheaper per-visit option)', () => {
    const r = scoreOne({
      category: 'membership', displayCategory: 'Fitness & Health',
      price: 40, frequency: 'monthly', visitsPerMonth: 12,
    });
    expect(r.verdict).toBe('keep');
  });
});

describe('rule 7 — bill not compared in over a year → look again, saving 0', () => {
  it('flags compareOffers', () => {
    const r = scoreOne({ category: 'bill', displayCategory: 'Bills & Utilities', price: 26, compareState: 'overAYear' });
    expect(r.verdict).toBe('lookAgain');
    expect(r.action).toBe('compareOffers');
    expect(r.potentialYearlySaving).toBe(0);
  });
  it('keeps a bill compared this year', () => {
    const r = scoreOne({ category: 'bill', displayCategory: 'Bills & Utilities', price: 26, compareState: 'thisYear' });
    expect(r.verdict).toBe('keep');
  });
});

describe('rule 8 — heavily used monthly digital with a cheaper yearly price → switch', () => {
  it('flags switchYearly, saving = monthly×12 − yearly', () => {
    const r = scoreOne({
      category: 'digital', usage: 'always', frequency: 'monthly', price: 9.99, yearlyPrice: 99,
    });
    expect(r.verdict).toBe('lookAgain');
    expect(r.action).toBe('switchYearly');
    expect(r.potentialYearlySaving).toBe(20.88); // 119.88 − 99
  });
  it('skips the rule when no yearly price is known', () => {
    const r = scoreOne({ category: 'digital', usage: 'always', frequency: 'monthly', price: 9.99 });
    expect(r.action).toBe('keep');
  });
});

describe('rule 9 — everything else keeps', () => {
  it('keeps a used digital item with a plain reason', () => {
    const r = scoreOne({ category: 'digital', usage: 'always', price: 15.99 });
    expect(r.verdict).toBe('keep');
    expect(r.action).toBe('keep');
    expect(r.potentialYearlySaving).toBe(0);
    expect(r.reason).toBe("You use this. It's earning its place.");
  });
});

describe('totals, the paywall gate, and never double counting', () => {
  it('every keep saves exactly 0', () => {
    const items = [
      item({ usage: 'always', price: 15.99 }),
      item({ category: 'bill', displayCategory: 'Bills & Utilities', compareState: 'thisYear', price: 26 }),
    ];
    const audit = runAudit(items);
    for (const r of audit.recommendations) {
      if (r.verdict === 'keep') expect(r.potentialYearlySaving).toBe(0);
    }
    expect(audit.potentialYearlySaving).toBe(0);
    expect(audit.paywall).toBe(false);
    expect(audit.goodShape).toBe(true);
  });

  it('gives exactly one action per item', () => {
    const items = [
      item({ usage: 'almostNever', price: 10 }),
      item({ name: 'Spotify', merchantKey: 'spotify', overlapGroup: 'music', usage: 'always', price: 10.99 }),
      item({ name: 'YouTube Premium', merchantKey: 'youtube premium', overlapGroup: 'music', usage: 'sometimes', wouldMiss: true, price: 13.99 }),
    ];
    const audit = runAudit(items);
    expect(audit.recommendations).toHaveLength(3);
    // one recommendation per item id, no duplicates
    expect(new Set(audit.recommendations.map((r) => r.itemId)).size).toBe(3);
  });

  it('shows the paywall only with an actionable item AND saving >= threshold', () => {
    // one cut worth €120 → paywall
    const big = runAudit([item({ usage: 'almostNever', price: 10, frequency: 'monthly' })]);
    expect(big.potentialYearlySaving).toBe(120);
    expect(big.paywall).toBe(true);

    // an actionable item but tiny saving (below €10) → good shape, no paywall
    const tiny = runAudit([
      item({ usage: 'almostNever', price: 0.5, frequency: 'monthly' }), // €6/yr
    ]);
    expect(tiny.potentialYearlySaving).toBeLessThan(PAYWALL_MIN_SAVING_EUR);
    expect(tiny.paywall).toBe(false);
    expect(tiny.goodShape).toBe(true);
  });

  it('converts the €10 paywall threshold into the display currency (RSD, BAM)', () => {
    // ~1172 RSD ≈ €10. A cut worth 800 RSD is below threshold; 2000 RSD is above.
    expect(paywallThreshold('RSD')).toBeGreaterThan(1000);
    const belowRsd = runAudit(
      [item({ usage: 'almostNever', price: 66, frequency: 'monthly', currency: 'RSD' })], // ~792 RSD/yr
      { displayCurrency: 'RSD' },
    );
    expect(belowRsd.potentialYearlySaving).toBeLessThan(paywallThreshold('RSD'));
    expect(belowRsd.paywall).toBe(false);
    const aboveRsd = runAudit(
      [item({ usage: 'almostNever', price: 300, frequency: 'monthly', currency: 'RSD' })], // 3600 RSD/yr
      { displayCurrency: 'RSD' },
    );
    expect(aboveRsd.paywall).toBe(true);

    // BAM is pegged near 1.96 per EUR → threshold ~19.56 BAM.
    expect(paywallThreshold('BAM')).toBeGreaterThan(19);
    expect(paywallThreshold('BAM')).toBeLessThan(20);
  });
});

describe('rule 8 — yearly price from the map is EUR, converted per currency', () => {
  it('converts the EUR yearly price into BAM and marks the saving approx.', () => {
    // €99/yr ≈ 193.63 BAM. Monthly 20 BAM × 12 = 240 BAM → saving ≈ 46.37 BAM.
    const r = scoreOne({
      category: 'digital', usage: 'always', frequency: 'monthly',
      price: 20, currency: 'BAM', yearlyPrice: 99,
    });
    expect(r.action).toBe('switchYearly');
    expect(r.approx).toBe(true);
    expect(r.potentialYearlySaving).toBeCloseTo(240 - 99 * 1.95583, 1);
  });

  it('rule 1 wins over overlap: an almost-never item in a group is cut, not removeOverlap', () => {
    const kept = item({ id: 'k', name: 'Spotify', merchantKey: 'spotify', overlapGroup: 'music', usage: 'always', price: 10.99 });
    const dead = item({ id: 'x', name: 'Tidal', merchantKey: 'tidal', overlapGroup: 'music', usage: 'almostNever', price: 9.99 });
    const audit = runAudit([kept, dead]);
    expect(audit.recommendations.find((r) => r.itemId === 'x')!.action).toBe('cancel');
  });
});
