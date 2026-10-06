import { afterEach, describe, expect, it } from 'vitest';
import { detect, type ImportMeta } from './detect';
import { clearResearchedMerchants, registerMerchantProfiles } from './merchants';
import { looksLikePersonName, merchantInfoFromResearch, merchantNamesForResearch, validateResearchProfile } from './research';
import { analystPayload, validateAnalystAnswer } from './analyst';
import type { Item, Transaction } from './types';

const meta: ImportMeta = { displayCurrency: 'RSD', dateFormat: 'iso', dateAmbiguous: false, monthsSpan: 3, redactedCategories: [], columnQuestions: [], columnCount: 3 };

afterEach(() => clearResearchedMerchants());

describe('what leaves the device for merchant research', () => {
  const rows: Transaction[] = [
    { date: '2026-09-01', merchantRaw: 'MAXI 123 BEOGRAD', amount: 2400, currency: 'RSD' },
    { date: '2026-09-02', merchantRaw: 'Transfer to Jon Fakeman', amount: 5000, currency: 'RSD' },
    { date: '2026-09-03', merchantRaw: 'Ruzica Petrovic', amount: 3000, currency: 'RSD' },
    { date: '2026-09-04', merchantRaw: 'Crna Ovca bar', amount: 900, currency: 'RSD' },
    { date: '2026-09-05', merchantRaw: 'Netflix.com', amount: 1200, currency: 'RSD' },
    { date: '2026-09-06', merchantRaw: 'REF 445566778899', amount: 10, currency: 'RSD' },
  ];

  it('sends only unknown merchant names, never people, amounts or known brands', () => {
    const names = merchantNamesForResearch(rows);
    expect(names).toEqual(['maxi', 'crna ovca bar']);
    const wire = JSON.stringify({ names });
    expect(wire).not.toMatch(/\d/);
    expect(wire).not.toMatch(/fakeman|petrovic|netflix/i);
  });

  it('treats two plain words without a business word as a possible person', () => {
    expect(looksLikePersonName('ruzica petrovic')).toBe(true);
    expect(looksLikePersonName('crna ovca bar')).toBe(false);
    expect(looksLikePersonName('maxi')).toBe(false);
  });
});

describe('researched profiles', () => {
  it('rejects malformed or unsafe model output', () => {
    expect(validateResearchProfile({ key: 'x', kind: 'nonsense', name: 'X', confidence: 1 })).toBeUndefined();
    const p = validateResearchProfile({ key: 'maxi', name: 'Maxi', kind: 'spending', spendingCategory: 'Groceries', confidence: 0.95, cancelUrl: 'javascript:alert(1)', extra: 'dropped' });
    expect(p).toMatchObject({ key: 'maxi', kind: 'spending', spendingCategory: 'Groceries' });
    expect(p).not.toHaveProperty('cancelUrl');
    expect(p).not.toHaveProperty('extra');
  });

  it('a researched supermarket becomes Groceries spending, never a subscription', () => {
    registerMerchantProfiles([merchantInfoFromResearch(validateResearchProfile({ key: 'maxi', name: 'Maxi', kind: 'spending', spendingCategory: 'Groceries', confidence: 0.95 })!)!]);
    const result = detect([
      { date: '2026-07-01', merchantRaw: 'MAXI 123', amount: 1000, currency: 'RSD' },
      { date: '2026-08-01', merchantRaw: 'MAXI 123', amount: 1000, currency: 'RSD' },
      { date: '2026-09-01', merchantRaw: 'MAXI 123', amount: 1000, currency: 'RSD' },
    ], meta);
    expect([...result.recurring, ...result.possibleRecurring, ...result.habits].some((item) => item.merchantKey === 'maxi')).toBe(false);
    expect(result.spendingByCategory.Groceries).toBe(3000);
  });

  it('a researched utility becomes a bill', () => {
    registerMerchantProfiles([merchantInfoFromResearch(validateResearchProfile({ key: 'eps snabdevanje', name: 'EPS', kind: 'bill', confidence: 0.9 })!)!]);
    const result = detect([{ date: '2026-09-10', merchantRaw: 'EPS SNABDEVANJE', amount: 4200, currency: 'RSD' }], meta);
    expect(result.possibleRecurring.find((item) => item.merchantKey === 'eps snabdevanje')?.category).toBe('bill');
  });

  it('low confidence answers are not used', () => {
    expect(merchantInfoFromResearch(validateResearchProfile({ key: 'zzz', name: 'Zzz', kind: 'subscription', confidence: 0.3 })!)).toBeUndefined();
  });
});

describe('AI analyst', () => {
  const item = (over: Partial<Item>): Item => ({ id: 'a', name: 'Upwork', merchantKey: 'upwork', category: 'digital', displayCategory: 'AI & Software', price: 19.99, frequency: 'monthly', source: 'statement', estimate: false, currency: 'USD', ...over });

  it('sends an anonymous list with opaque refs', () => {
    const { items, refs } = analystPayload([item({ id: 'secret-id' }), item({ id: 'p', name: 'Ruzica Petrovic' })]);
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain('secret-id');
    expect(refs).toEqual({ i1: 'secret-id' });
  });

  it('drops reasons with numbers and unknown refs, keeps max 3 questions', () => {
    const answer = validateAnalystAnswer({
      notes: { i1: { reason: 'You use it to earn, keep it.' }, i2: { reason: 'Save 120 a year.' }, i9: { reason: 'x' } },
      questions: [{ ref: 'i1', question: 'Do you earn through Upwork?', options: ['Yes', 'No'] }],
    }, ['i1', 'i2']);
    expect(answer.notes).toEqual({ i1: { reason: 'You use it to earn, keep it.' } });
    expect(answer.questions).toHaveLength(1);
  });
});
