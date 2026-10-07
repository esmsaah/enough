// Enough — guess the person's country on the device (no IP lookup, no network).
import { CATALOG } from '../engine/catalog';

const TZ: Record<string, string> = {
  'Europe/Sarajevo': 'BA', 'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Podgorica': 'ME', 'Europe/Skopje': 'MK',
  'Europe/Tirane': 'AL', 'Europe/London': 'UK', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/Luxembourg': 'LU', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT',
  'Europe/Rome': 'IT', 'Europe/Athens': 'GR', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI',
  'Atlantic/Reykjavik': 'IS', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Chisinau': 'MD', 'Asia/Nicosia': 'CY', 'Europe/Malta': 'MT', 'Europe/Istanbul': 'TR', 'America/New_York': 'US', 'America/Chicago': 'US',
  'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Asia/Amman': 'JO', 'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Asia/Jerusalem': 'IL', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Manila': 'PH', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ',
};

/** Countries with a local list in the catalog, plus "Other". */
export const COUNTRIES: string[] = [...new Set(CATALOG.flatMap((e) => e.r))].filter((c) => /^[A-Z]{2}$/.test(c)).sort();

export function guessCountry(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && TZ[zone]) return TZ[zone]!;
    const region = (navigator.languages?.[0] ?? navigator.language ?? '').split('-')[1]?.toUpperCase();
    if (region && COUNTRIES.includes(region === 'GB' ? 'UK' : region)) return region === 'GB' ? 'UK' : region;
  } catch {
    /* fall through */
  }
  return 'GLOBAL';
}

export function countryName(code: string): string {
  if (code === 'GLOBAL') return 'Everywhere';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code === 'UK' ? 'GB' : code) ?? code;
  } catch {
    return code;
  }
}

export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  const iso = code === 'UK' ? 'GB' : code;
  return String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
