# Global format fixtures (synthetic)

Same persona as the other fixtures, invented merchants and people. All modeled from common conventions, not verified against real exports.

| File | Country | Currency | What it tests |
| --- | --- | --- | --- |
| csv/global/ae_arabic_digits.csv | AE | AED | Arabic headers and Arabic-Indic digits |
| csv/global/sa_hijri.csv | SA | SAR | Hijri calendar dates only |
| csv/global/jp_yen.csv | JP | JPY | Japanese headers, YYYY/MM/DD, no decimals |
| csv/global/in_inr.csv | IN | INR | DD-Mon-YYYY, Indian lakh grouping |
| csv/global/ch_chf.csv | CH | CHF | apostrophe thousands |
| csv/global/tr_try.csv | TR | TRY | Turkish headers, "TL" suffix in amounts |
| csv/global/br_brl.csv | BR | BRL | R$ prefix, comma decimals |
| csv/global/th_buddhist.csv | TH | THB | Thai digits, Buddhist Era year |

rates.ts must include AED, SAR, JPY, INR, CHF, TRY, BRL and THB.
