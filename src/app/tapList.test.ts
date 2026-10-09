import { describe, expect, it } from 'vitest';
import { tapListForCountry } from './tapList';

const regionalSamples: Array<[string, string]> = [
  ['SE', 'telia'], ['NO', 'telenor norge'], ['DK', 'yousee'], ['FI', 'dna'], ['IS', 'siminn'],
  ['BD', 'grameenphone'], ['VN', 'viettel'], ['TH', 'ais fibre'], ['AR', 'personal'],
  ['ZA', 'vodacom'], ['UA', 'kyivstar'], ['ES', 'movistar'], ['IT', 'tim'], ['NL', 'kpn'],
  ['PL', 'orange polska'], ['SA', 'stc'], ['AE', 'etisalat'],
];

describe('regional researched tap lists', () => {
  it.each(regionalSamples)('%s includes its researched local entries', (country, merchantKey) => {
    const picks = tapListForCountry(country);
    expect(picks.some((pick) => pick.merchantKey === merchantKey)).toBe(true);
    expect(new Set(picks.map((pick) => pick.merchantKey)).size).toBe(picks.length);
  });

  it('keeps insurance in the bills flow', () => {
    const countries = [...new Set(regionalSamples.map(([country]) => country))];
    for (const country of countries) {
      const insurers = tapListForCountry(country).filter((pick) => pick.group === 'Insurance');
      expect(insurers.length, country).toBeGreaterThan(0);
      expect(insurers.every((pick) => pick.category === 'bill'), country).toBe(true);
    }
  });

  it('keeps distinct legacy services from the superseded ES-region sheet', () => {
    const picks = tapListForCountry('ES');
    expect(picks.some((pick) => pick.name === 'Digi Fibra')).toBe(true);
    expect(picks.some((pick) => pick.name === 'Movistar Plus+')).toBe(true);
  });
});
