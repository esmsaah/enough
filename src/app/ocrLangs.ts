// Which OCR language packs to load for a picture: English plus the languages of the
// person's country and browser. Only those packs are downloaded (lazy), all from our
// own /ocr folder. Covers Latin, Cyrillic, Greek, Arabic, Hebrew, Persian, Urdu,
// Chinese, Japanese, Korean, Thai, Devanagari, Bengali and Tamil scripts.

/** Every pack shipped in /ocr (scripts/copy-ocr-assets.mjs keeps the same list). */
export const OCR_PACKS = ['eng', 'hrv', 'srp', 'ara', 'heb', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'tha', 'hin', 'ell', 'rus', 'ukr', 'bul', 'tur', 'deu',
  'fra', 'spa', 'por', 'ita', 'nld', 'pol', 'vie', 'ind', 'msa', 'ces', 'hun', 'ron', 'slv', 'mkd', 'sqi', 'swe', 'nor', 'dan', 'fin', 'fas', 'urd', 'ben', 'tam'] as const;
export type OcrPack = (typeof OCR_PACKS)[number];

const BY_COUNTRY: Record<string, OcrPack[]> = {
  BA: ['hrv', 'srp'], RS: ['srp', 'hrv'], HR: ['hrv'], ME: ['hrv', 'srp'], MK: ['mkd'], SI: ['slv'], AL: ['sqi'], XK: ['sqi', 'srp'],
  DE: ['deu'], AT: ['deu'], CH: ['deu', 'fra', 'ita'], FR: ['fra'], BE: ['fra', 'nld'], LU: ['fra', 'deu'], NL: ['nld'], ES: ['spa'], PT: ['por'],
  IT: ['ita'], PL: ['pol'], CZ: ['ces'], SK: ['ces'], HU: ['hun'], RO: ['ron'], BG: ['bul'], GR: ['ell'], CY: ['ell', 'tur'], TR: ['tur'],
  RU: ['rus'], UA: ['ukr', 'rus'], SE: ['swe'], NO: ['nor'], DK: ['dan'], FI: ['fin', 'swe'], IS: ['dan'],
  AE: ['ara'], SA: ['ara'], QA: ['ara'], KW: ['ara'], BH: ['ara'], OM: ['ara'], JO: ['ara'], EG: ['ara'], MA: ['ara', 'fra'], DZ: ['ara', 'fra'], TN: ['ara', 'fra'], LB: ['ara', 'fra'], IQ: ['ara'],
  IL: ['heb'], IR: ['fas'], PK: ['urd'], IN: ['hin'], BD: ['ben'], LK: ['tam'],
  CN: ['chi_sim'], TW: ['chi_tra'], HK: ['chi_tra'], SG: ['chi_sim', 'msa'], JP: ['jpn'], KR: ['kor'], TH: ['tha'], VN: ['vie'], ID: ['ind'], MY: ['msa'], PH: [],
  BR: ['por'], MX: ['spa'], AR: ['spa'], CL: ['spa'], CO: ['spa'], PE: ['spa'], UY: ['spa'], CA: ['fra'],
};

const BY_LOCALE: Record<string, OcrPack> = {
  bs: 'hrv', hr: 'hrv', sr: 'srp', mk: 'mkd', sl: 'slv', sq: 'sqi', de: 'deu', fr: 'fra', nl: 'nld', es: 'spa', pt: 'por', it: 'ita', pl: 'pol', cs: 'ces', sk: 'ces',
  hu: 'hun', ro: 'ron', bg: 'bul', el: 'ell', tr: 'tur', ru: 'rus', uk: 'ukr', sv: 'swe', nb: 'nor', no: 'nor', nn: 'nor', da: 'dan', fi: 'fin', ar: 'ara', he: 'heb',
  iw: 'heb', fa: 'fas', ur: 'urd', hi: 'hin', bn: 'ben', ta: 'tam', ja: 'jpn', ko: 'kor', th: 'tha', vi: 'vie', id: 'ind', ms: 'msa',
};

/** English, then the country's languages, then the browser's, at most 4 packs. */
export function ocrLanguages(country: string | undefined, locales: readonly string[] = []): OcrPack[] {
  const out: OcrPack[] = ['eng'];
  const add = (l?: OcrPack) => { if (l && !out.includes(l)) out.push(l); };
  for (const l of BY_COUNTRY[(country ?? '').toUpperCase() === 'UK' ? 'GB' : (country ?? '').toUpperCase()] ?? []) add(l);
  for (const loc of locales) {
    const tag = loc.toLowerCase();
    if (tag === 'zh-tw' || tag === 'zh-hk' || tag.startsWith('zh-hant')) add('chi_tra');
    else if (tag.startsWith('zh')) add('chi_sim');
    else add(BY_LOCALE[tag.split('-')[0]!]);
  }
  return out.slice(0, 4);
}
