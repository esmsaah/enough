import { describe, expect, it } from 'vitest';
import { classifyHeader, looksLikeHeaderRow } from './headers';
import { classifyByKeyword, isIgnoredMerchant, isPrivateTransfer } from './keywords';
import { containsWord, matchMerchant, normalizeMerchant } from './merchants';
import { looksRedacted, redactDescription } from './redact';
import { serverItemName, toReportSummary, PRIVATE_TRANSFER_NAME } from './report';
import type { Item, Recommendation } from './types';

describe('redact.ts', () => {
  it('masks IBANs, card numbers, emails and phone numbers, keeps the merchant', () => {
    expect(redactDescription('APPLE.COM/BILL KARTICA 4111 1111 1111 1111')).toBe('APPLE.COM/BILL KARTICA •••');
    expect(redactDescription('SEPA BA39 1290 0794 0102 8494 Ana')).not.toMatch(/BA39 1290/);
    expect(redactDescription('paid ana@example.com for lunch')).toContain('•••');
    expect(redactDescription('call +387 61 234 567 now')).toContain('•••');
  });
  it('leaves a clean merchant string untouched', () => {
    expect(redactDescription('Spotify P2F8A9C1D2')).toBe('Spotify P2F8A9C1D2');
  });
  it('looksRedacted flags leftover IBANs / cards / emails', () => {
    expect(looksRedacted('Netflix.com')).toBe(true);
    expect(looksRedacted('BA39 1290 0794 0102 8494')).toBe(false);
    expect(looksRedacted('4111 1111 1111 1111')).toBe(false);
  });
});

describe('headers.ts', () => {
  it('classifies multilingual headers to roles', () => {
    expect(classifyHeader('Datum')).toBe('date');
    expect(classifyHeader('Datum valute')).toBe('valueDate'); // not mistaken for date
    expect(classifyHeader('Opis transakcije')).toBe('description');
    expect(classifyHeader('Isplata')).toBe('debit');
    expect(classifyHeader('Uplata')).toBe('credit');
    expect(classifyHeader('Задужење')).toBe('debit'); // Cyrillic
    expect(classifyHeader('Betrag')).toBe('amount');
    expect(classifyHeader('Saldo')).toBe('balance');
  });
  it('recognizes a header row by having a date-ish and money-ish column', () => {
    expect(looksLikeHeaderRow(['Datum', 'Opis transakcije', 'Isplata', 'Uplata'])).toBe(true);
    expect(looksLikeHeaderRow(['Vlasnik računa', 'Ana Testić', '', ''])).toBe(false);
  });
});

describe('merchants.ts — normalization', () => {
  it('strips prefixes, references and noise to a stable key', () => {
    expect(normalizeMerchant('Spotify P2F8A9C1D2 KARTICA 4111 1111 1111 1111')).toBe('spotify');
    expect(normalizeMerchant('Google*Youtubepremium')).toBe('youtubepremium');
    expect(normalizeMerchant('Netflix.Com')).toBe('netflix');
    expect(normalizeMerchant('Fit Zone Doo Sarajevo')).toBe('fit zone');
    expect(normalizeMerchant('Konzum Market 0412')).toBe('konzum market');
  });
  it('matches known merchants to the right key', () => {
    expect(matchMerchant('Netflix.Com')?.merchantKey).toBe('netflix');
    expect(matchMerchant('Google*Youtubepremium')?.merchantKey).toBe('youtube premium');
    expect(matchMerchant('Apple.Com/Bill')?.merchantKey).toBe('apple');
    expect(matchMerchant('OPENAI *CHATGPT SUBSCR')?.merchantKey).toBe('chatgpt');
    expect(matchMerchant('Telekom Mobile Postpaid')?.merchantKey).toBe('telekom');
  });

  // Finding #1 — whole-word matching. None of these may match a brand.
  it('does NOT match brands as substrings of longer words', () => {
    expect(matchMerchant('ANYTIME FITNESS')?.merchantKey).not.toBe('nyt');
    expect(matchMerchant('CALMAR RESTORAN')?.merchantKey).not.toBe('calm');
    expect(matchMerchant('HUBER GMBH')?.merchantKey).not.toBe('uber');
    expect(matchMerchant('CANVAS PRINT SHOP')?.merchantKey).not.toBe('canva');
    expect(matchMerchant('APPLEBEES')?.merchantKey).not.toBe('apple');
  });
  it('containsWord is whole-word only', () => {
    expect(containsWord('anytime fitness', 'nyt')).toBe(false);
    expect(containsWord('konzum market', 'market')).toBe(true);
    expect(containsWord('marketing tools', 'market')).toBe(false);
  });
});

describe('keywords.ts', () => {
  it('classifies by keyword only on whole words', () => {
    expect(classifyByKeyword('elektro distribucija')?.category).toBe('bill');
    expect(classifyByKeyword('fit zone')?.category).toBe('membership');
    expect(classifyByKeyword('plivacki klub delfin')?.category).toBe('membership');
  });
  it('ignore words never trigger on longer words (spar, ina, market)', () => {
    expect(isIgnoredMerchant('konzum market')).toBe(true);
    expect(isIgnoredMerchant('ina benzin')).toBe(true); // fuel
    expect(isIgnoredMerchant('marina bar')).toBe(false); // "ina" inside "marina"
    expect(isIgnoredMerchant('platina salon')).toBe(false); // "ina" inside "platina"
    expect(isIgnoredMerchant('sparkasse fee')).toBe(false); // "spar" inside "sparkasse"
    expect(isIgnoredMerchant('marketing tools')).toBe(false); // "market" inside "marketing"
  });
  it('detects private transfers, including where a name coincides with a brand', () => {
    expect(isPrivateTransfer('transfer to maja maric')).toBe(true);
    expect(isPrivateTransfer('to maja maric')).toBe(true);
    expect(isPrivateTransfer('transfer to claude dupont')).toBe(true);
    expect(isPrivateTransfer('spotify')).toBe(false);
  });
});

describe('report.ts — outbound name guard (finding #4)', () => {
  const baseItem = (p: Partial<Item>): Item => ({
    id: 'x', name: 'Maja Marić', category: 'other', displayCategory: 'Other',
    price: 50, frequency: 'monthly', source: 'statement', estimate: false, currency: 'EUR', ...p,
  });
  it('replaces a private transfer name before it leaves the device', () => {
    const flagged = baseItem({ redactNameOutbound: true });
    expect(serverItemName(flagged)).toBe(PRIVATE_TRANSFER_NAME);
    expect(serverItemName(baseItem({ name: 'Netflix' }))).toBe('Netflix');
  });
  it('the report summary never contains the private person name', () => {
    const item = baseItem({ redactNameOutbound: true, flaggedForReminder: true, nextCharge: '2026-10-10' });
    const rec: Recommendation = { itemId: 'x', verdict: 'keep', action: 'keep', reason: '', yearlyCost: 600, potentialYearlySaving: 0 };
    const summary = toReportSummary([item], [rec]);
    expect(JSON.stringify(summary)).not.toContain('Maja');
    expect(summary[0]!.name).toBe(PRIVATE_TRANSFER_NAME);
  });
});
