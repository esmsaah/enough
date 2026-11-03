// Proof of concept: verified German plans (Netflix, Spotify, iCloud+), checked 2026-11-03.
// Each scenario states the expected money by hand, so the engine is checked against
// arithmetic a person can redo, not against itself.
import { describe, expect, it } from 'vitest';
import market from './plans.de.json';
import { report, runOpportunities, type Market, type Sub } from './engine';

const DE = market as Market;
const TODAY = '2026-11-03';
const level = (r: ReturnType<typeof runOpportunities>, l: 0 | 1 | 2) => r.levels[l]!.saving12;
const print = process.env.POC_PRINT ? (t: string, s: string) => console.log(`\n===== ${t} =====\n${s}`) : () => {};

describe('S1 couple in Berlin, statement: plan fit, one home, pay per visit, contract timing', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Premium', monthly: 21.99, priceSource: 'statement', nextCharge: '2026-11-15', importance: 'wouldMiss', needs: { viewersAtOnce: 1, needs4K: false, adsOk: false } },
    { id: 'sp', name: 'Spotify', service: 'spotify', plan: 'Premium Individual', monthly: 12.99, priceSource: 'statement', nextCharge: '2026-11-20', importance: 'wouldMiss', household: [{ id: 'sp-partner', monthly: 12.99, sameAddress: true }] },
    { id: 'ic', name: 'iCloud+', service: 'icloud', plan: '2 TB', monthly: 9.99, priceSource: 'statement', nextCharge: '2026-11-08', importance: 'wouldMiss', needs: { storageUsedGb: 140 } },
    { id: 'au', name: 'Audible', monthly: 9.95, priceSource: 'typed', importance: 'canLiveWithout' },
    { id: 'gym', name: 'FitX', monthly: 39.9, priceSource: 'statement', nextCharge: '2026-12-01', lockedUntil: '2027-03-31', importance: 'wouldMiss', membership: { visitsPerMonth: 3, singleVisit: 8 } },
    { id: 'power', name: 'Vattenfall', monthly: 85, priceSource: 'statement', importance: 'unknown', fixedBill: true },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  print('S1', report(r, subs, DE));
  it('Netflix Premium for one viewer, no 4K → Standard, €6 × 12 = €72', () => expect(r.options.find((o) => o.id === 'fit:nf')?.saving12).toBe(72));
  it('two Spotify Individual at one address → Duo, (25.98 − 17.99) × 12 = €95.88', () => expect(r.options.find((o) => o.id === 'home:sp')?.saving12).toBe(95.88));
  it('iCloud 2 TB with 140 GB used → 200 GB, €7 × 12 = €84', () => expect(r.options.find((o) => o.id === 'fit:ic')?.saving12).toBe(84));
  it('gym locked until 31 Mar 2027: only Apr–Nov 2027 count, (39.90 − 24) × 8 = €127.20', () => expect(r.options.find((o) => o.id === 'visit:gym')?.saving12).toBe(127.2));
  it('no loss level = 72 + 95.88 + 84 + 127.20 = €379.08', () => expect(level(r, 0)).toBe(379.08));
  it('Audible is added only at the "can live without" level: + €119.40', () => expect(level(r, 2)).toBe(498.48));
  it('fixed bill gets no option and is reported as fixed', () => expect(r.noOpportunity.find((n) => n.itemId === 'power')?.why).toMatch(/Fixed/));
  it('exposure splits the €179.82 a month', () => expect(r.exposure).toMatchObject({ total: 179.82, fixed: 85, freeNow: 54.92 }));
});

describe('S2 three streaming services used sometimes: rotation with dates', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Standard', monthly: 15.99, priceSource: 'statement', nextCharge: '2026-11-10', importance: 'wouldMiss', rotatable: true, needs: { viewersAtOnce: 2, adsOk: false, needs4K: false } },
    { id: 'dp', name: 'Disney+', monthly: 9.99, priceSource: 'typed', importance: 'wouldMiss', rotatable: true },
    { id: 'wow', name: 'WOW', monthly: 9.98, priceSource: 'typed', importance: 'wouldMiss', rotatable: true },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  print('S2', report(r, subs, DE));
  it('nothing without waiting: Netflix Standard is already the cheapest ad-free plan for 2 viewers', () => expect(level(r, 0)).toBe(0));
  it('rotation 4 months each: (15.99 + 9.99 + 9.98) × 12 − 4 × (15.99 + 9.99 + 9.98) = €287.68', () => expect(level(r, 1)).toBe(287.68));
  it('schedule chains blocks with no gap and no overlap, from the statement billing day', () => {
    const s = r.options.find((o) => o.kind === 'rotation')!.schedule!;
    expect(s[0]).toMatchObject({ service: 'Netflix', off: '2027-03-09' });
    expect(s[1]).toMatchObject({ service: 'Disney+', on: '2027-03-10', off: '2027-07-09' });
    expect(s[1]!.steps[0]).toBe('cancel before 2026-12-02 (paid until then)');
    expect(s[2]).toMatchObject({ service: 'WOW', on: '2027-07-10' });
  });
  it('typed prices without a billing day lower confidence', () => expect(r.options.find((o) => o.kind === 'rotation')!.confidence).toBe('medium'));
});

describe('S3 already optimal: zero opportunities, no manufactured saving', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Standard with ads', monthly: 6.99, priceSource: 'statement', importance: 'wouldMiss', needs: { viewersAtOnce: 1, adsOk: true, needs4K: false } },
    { id: 'sp', name: 'Spotify', service: 'spotify', plan: 'Premium Individual', monthly: 12.99, priceSource: 'statement', importance: 'wouldMiss' },
    { id: 'ic', name: 'iCloud+', service: 'icloud', plan: '50 GB', monthly: 0.99, priceSource: 'statement', importance: 'wouldMiss', needs: { storageUsedGb: 30 } },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  print('S3', report(r, subs, DE));
  it('returns no options and €0 at every level', () => { expect(r.options).toEqual([]); expect(r.levels.map((l) => l.saving12)).toEqual([0, 0, 0]); });
  it('explains each item', () => expect(r.noOpportunity).toHaveLength(3));
});

describe('S4 needs unknown: abstain, ask the one question, count nothing', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Premium', monthly: 21.99, priceSource: 'typed', importance: 'wouldMiss' },
    { id: 'ic', name: 'iCloud+', service: 'icloud', plan: '2 TB', monthly: 9.99, priceSource: 'typed', importance: 'wouldMiss' },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  print('S4', report(r, subs, DE));
  it('no counted saving', () => expect(level(r, 2)).toBe(0));
  it('asks about viewers/4K for Netflix with what it would unlock (€72, not counted)', () => expect(r.conditionals.find((c) => c.itemId === 'nf')?.saving12IfYes).toBe(72));
  it('asks storage for iCloud', () => expect(r.conditionals.find((c) => c.itemId === 'ic')?.question).toMatch(/storage/));
});

describe('S5 rotation with an old cheaper price: rejoining costs today\'s list price', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Standard', monthly: 13.99, priceSource: 'statement', nextCharge: '2026-12-20', importance: 'wouldMiss', rotatable: true, needs: { viewersAtOnce: 2, adsOk: false, needs4K: false } },
    { id: 'dp', name: 'Disney+', monthly: 9.99, priceSource: 'statement', nextCharge: '2026-11-10', importance: 'wouldMiss', rotatable: true },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  it('Netflix comes back at €15.99, so (13.99 + 9.99) × 12 − (6 × 9.99 + 6 × 15.99) = €131.88, not €143.82', () => expect(level(r, 1)).toBe(131.88));
});

describe('S6 sharing rules', () => {
  it('partner at another address: no Duo', () => {
    const r = runOpportunities([{ id: 'sp', name: 'Spotify', service: 'spotify', monthly: 12.99, priceSource: 'statement', importance: 'wouldMiss', household: [{ id: 'p', monthly: 12.99, sameAddress: false }] }], DE, TODAY);
    expect(r.options).toEqual([]);
  });
});

describe('S7 incompatible options on the same account are never added together', () => {
  const subs: Sub[] = [
    { id: 'ic', name: 'iCloud+', service: 'icloud', plan: '2 TB', monthly: 9.99, priceSource: 'statement', importance: 'wouldMiss', needs: { storageUsedGb: 140 }, household: [{ id: 'ic-p', monthly: 2.99, storageUsedGb: 100, sameAddress: true }] },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  it('both options exist: own 200 GB (€84) and one shared 2 TB (€35.88)', () => {
    expect(r.options.find((o) => o.id === 'fit:ic')?.saving12).toBe(84);
    expect(r.options.find((o) => o.id === 'home:ic')?.saving12).toBe(35.88);
  });
  it('the engine picks the better one, €84, never €119.88', () => expect(level(r, 0)).toBe(84));
});

describe('S8 plan fit and rotation on the same service', () => {
  const subs: Sub[] = [
    { id: 'nf', name: 'Netflix', service: 'netflix', plan: 'Premium', monthly: 21.99, priceSource: 'statement', nextCharge: '2026-11-10', importance: 'wouldMiss', rotatable: true, needs: { viewersAtOnce: 1, adsOk: false, needs4K: false } },
    { id: 'dp', name: 'Disney+', monthly: 9.99, priceSource: 'typed', importance: 'wouldMiss', rotatable: true },
  ];
  const r = runOpportunities(subs, DE, TODAY);
  it('without waiting: only the downgrade, €72', () => expect(level(r, 0)).toBe(72));
  it('with waiting: rotation on the cheaper plan (383.76 − 6 × 15.99 − 6 × 9.99 = €227.88), not 72 + rotation', () => expect(level(r, 1)).toBe(227.88));
});
