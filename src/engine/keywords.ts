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
    words: ['cafe', 'kafa', 'coffee', 'kaffee', 'bar', 'restoran', 'restaurant', 'maci', 'zaokret'],
  },
];

// Supermarkets and fuel — ignored as habits unless the person adds them (rule 5).
const IGNORE_WORDS = [
  'maxi', 'idea', 'lidl', 'konzum', 'mercator', 'tempo', 'univerexport', 'bingo', 'aman', 'dm',
  'spar', 'aldi', 'kaufland', 'carrefour', 'supermarket', 'market', 'marketi', 'aroma marketi',
  'grocery', 'hipermarket', 'tommy', 'plodine', 'migros', 'super u', 'intermarché', 'intermarche',
  'apoteka', 'pharmacy', 'pharmacie', 'drugstore', 'drogerie',
  'ina', 'mol', 'omv', 'fuel', 'petrol', 'shell', 'gas station', 'benzin', 'crodux', 'eurotank',
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
  if (s === 'transfer to a person') return true;
  // English/German: "... to Firstname Lastname", with an optional transfer verb.
  if (/^(transfer|sent money|sent|payment|wire|standing order|outgoing transfer|ueberweisung|uberweisung|virement)?\s*to\s+[a-z]+(\s+[a-z]+){1,2}$/.test(s)) {
    return true;
  }
  // Balkan payment-order phrasing: "nalog za prenos <name>", "prenos <name>", …
  if (/^(nalog za (prenos|placanje|isplatu)|interni prenos|trajni nalog|prenos|prijenos|placanje prema|uplata za)\b/.test(s)) {
    return true;
  }
  return false;
}
