import { describe, expect, it } from 'vitest';
import { continueLink, readContinueHash } from './continueLink';
import type { Item } from '../engine/types';

const it1 = (p: Partial<Item>): Item => ({ id: 'x', name: 'Netflix', category: 'digital', displayCategory: 'Entertainment', price: 7.99, frequency: 'monthly', source: 'quickpick', estimate: true, currency: 'EUR', ...p });

describe('finish on my computer link', () => {
  it('carries tapped items and answers, never statement items', () => {
    const link = continueLink('https://enough.app', [it1({ usage: 'sometimes', planName: 'Standard' }), it1({ id: 's', name: 'Bank thing', source: 'statement' })], 'BA');
    expect(link.startsWith('https://enough.app/#continue=')).toBe(true);
    const back = readContinueHash(link.slice(link.indexOf('#')))!;
    expect(back.country).toBe('BA');
    expect(back.items).toHaveLength(1);
    expect(back.items[0]).toMatchObject({ name: 'Netflix', usage: 'sometimes', planName: 'Standard', price: 7.99 });
    expect(JSON.stringify(back)).not.toContain('Bank thing');
  });
  it('ignores damaged links', () => {
    expect(readContinueHash('#continue=%%%')).toBeUndefined();
    expect(readContinueHash('#continue=abc')).toBeUndefined();
  });
});
