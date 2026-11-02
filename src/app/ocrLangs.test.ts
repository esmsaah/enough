import { describe, expect, it } from 'vitest';
import { ocrLanguages } from './ocrLangs';

describe('OCR language choice', () => {
  it('country and browser languages, English first', () => {
    expect(ocrLanguages('BA', ['bs-BA'])).toEqual(['eng', 'hrv', 'srp']);
    expect(ocrLanguages('AE', ['ar'])).toEqual(['eng', 'ara']);
    expect(ocrLanguages('IL', ['he-IL'])).toEqual(['eng', 'heb']);
    expect(ocrLanguages('TW', ['zh-TW'])).toEqual(['eng', 'chi_tra']);
    expect(ocrLanguages('US', ['zh-CN', 'en-US'])).toEqual(['eng', 'chi_sim']);
    expect(ocrLanguages('JP', ['ja'])).toEqual(['eng', 'jpn']);
  });
  it('never more than 4 packs', () => {
    expect(ocrLanguages('CH', ['de', 'fr', 'it', 'ru']).length).toBe(4);
  });
});
