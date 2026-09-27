// Enough — multilingual category keywords. Section 7 of ENOUGH_BRIEF.md.
// Used only when the merchant map (merchants.ts) has no match. Pure data.

import { containsWord } from './merchants';
import type { Category, DisplayCategory } from './types';

type KeywordRule = {
  category: Category;
  displayCategory: DisplayCategory;
  words: string[];
};

// Order matters — the first rule whose keyword appears wins.
const KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'membership',
    displayCategory: 'Fitness & Health',
    words: [
      'gym', 'fitness', 'teretana', 'fitnessstudio', 'gimnasio', 'palestra',
      'salle de sport', 'crossfit', 'yoga', 'pilates', 'bazen', 'swim',
      'plivacki', 'klub', 'club', 'fit zone', 'fitzone', 'wellness', 'sport',
    ],
  },
  {
    category: 'bill',
    displayCategory: 'Bills & Utilities',
    words: [
      'telekom', 'telecom', 'mobile', 'internet', 'struja', 'elektro',
      'electricity', 'power', 'osiguranje', 'insurance', 'versicherung',
      'seguro', 'assurance', 'voda', 'water', 'gas', 'plin', 'grijanje',
      'komunalac', 'utility',
    ],
  },
  {
    category: 'habit',
    displayCategory: 'Shopping & Delivery',
    words: [
      'wolt', 'glovo', 'uber eats', 'bolt food', 'donesi', 'delivery',
    ],
  },
  {
    category: 'habit',
    displayCategory: 'Transport',
    words: ['taxi', 'cab', 'uber', 'bolt', 'parking', 'parkiranje'],
  },
  {
    category: 'habit',
    displayCategory: 'Other',
    words: ['cafe', 'kafa', 'coffee', 'kaffee', 'bar', 'restoran', 'restaurant'],
  },
];

// Supermarkets and fuel — ignored as habits unless the person adds them (rule 5).
const IGNORE_WORDS = [
  'konzum', 'mercator', 'lidl', 'spar', 'aldi', 'kaufland', 'bingo',
  'supermarket', 'market', 'grocery', 'hipermarket', 'tommy', 'plodine',
  'ina', 'omv', 'petrol', 'shell', 'gas station', 'benzin', 'crodux', 'eurotank',
];

export function classifyByKeyword(
  normalizedMerchant: string,
): { category: Category; displayCategory: DisplayCategory } | undefined {
  for (const rule of KEYWORD_RULES) {
    for (const w of rule.words) {
      if (containsWord(normalizedMerchant, w)) {
        return { category: rule.category, displayCategory: rule.displayCategory };
      }
    }
  }
  return undefined;
}

/** Supermarkets and fuel — ignored as habits unless the person adds them.
 *  Whole-word: "ina" (fuel) never matches "marina"; "spar" never "sparkasse". */
export function isIgnoredMerchant(normalizedMerchant: string): boolean {
  return IGNORE_WORDS.some((w) => containsWord(normalizedMerchant, w));
}

/** A transfer to a private person — never auto-classified, always ask. */
export function isPrivateTransfer(normalizedMerchant: string): boolean {
  const s = normalizedMerchant.toLowerCase().trim();
  // "... to Firstname Lastname" ending, with or without a leading transfer verb.
  if (/^(transfer\s+)?to\s+[a-z]+(\s+[a-z]+){1,2}$/.test(s)) return true;
  // A transfer verb (any language) followed by a person's name at the end.
  const verb = /^(transfer|sent money|sent|payment|wire|standing order|prijenos|prenos|uplata|nalog|placanje|ueberweisung|uberweisung|virement)\b/;
  if (verb.test(s) && /\bto\s+[a-z]+(\s+[a-z]+){1,2}$/.test(s)) return true;
  return false;
}
