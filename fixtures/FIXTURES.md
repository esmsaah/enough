# Enough test fixtures

Synthetic bank statements for testing the import, redaction and detection engine. Copy this folder to `/fixtures` in the project.

**Everything here is fake.** The account holder "Ana Testić", the address, the IBANs and the card number (4111 1111 1111 1111, the public test card) are invented. No real person's data is included.

## The test persona

The same six months (April to September 2026) of spending appear in every file, converted to the file's currency. That way one set of expected results covers all formats. `expected/<file>.json` lists what the engine must find.

| What | Examples | What the engine must do |
| --- | --- | --- |
| Monthly digital | Netflix, Spotify, Disney+, Dropbox, Apple, YouTube Premium, ChatGPT | detect as monthly, predict next charge |
| Price increase | Spotify 10.99 → 11.99 in August (+9%) | still one item, latest price, show "price went up" |
| Overlap | Spotify + YouTube Premium (music), Dropbox + Apple/iCloud (storage) | flag overlap |
| Membership | FIT ZONE DOO (gym, monthly), PLIVACKI KLUB DELFIN (kids' swimming, quarterly) | detect, ask visits |
| Bills with varying amounts | Telekom (24–28), Elektro distribucija (38–61) | detect as bills, use average |
| Yearly, seen once | Duolingo annual, UNIQA insurance | cannot confirm from 6 months, surface through the yearly question |
| Habit | Wolt, 3–6 irregular orders a month | habit, monthly average |
| Noise | Konzum supermarket weekly | ignore |
| Private transfer | Transfer to Maja Marić monthly | never auto-classify, ask |
| Foreign currency | ChatGPT billed USD 20.00 | convert, mark approx. |
| Personal data to redact | name, address, IBAN, card number in descriptions, balances | must never reach storage |

## Files and formats

| File | Country | Bank style | Status | Format notes |
| --- | --- | --- | --- | --- |
| csv/revolut_en.csv | global | Revolut | header verified | comma, dot decimals, `YYYY-MM-DD HH:MM:SS`, negative = out |
| csv/wise.csv | global | Wise | header verified, date assumed | 19 columns incl. card holder name and payee account, both must be redacted |
| csv/n26_en.csv | DE / EU | N26 English | headers verified | `YYYY-MM-DD`, quoted fields, Partner Iban column must be redacted |
| csv/de_sparkasse_style.csv | DE | Sparkasse / Haspa style | partly verified | semicolon, comma decimals, `DD.MM.YY`, ISO-8859-1 |
| csv/uk_monzo_style.csv | GB | Monzo-like | modeled | `DD/MM/YYYY` |
| csv/us_generic.csv | US | large US bank style | modeled | `MM/DD/YYYY`, must not be read as DD/MM |
| csv/ba_modeled.csv | BA | generic BiH bank | modeled | junk header block with name, address, IBAN; Isplata / Uplata columns; windows-1250; footer balance |
| csv/rs_latin_modeled.csv | RS | Serbian, Latin | modeled | date with trailing dot `27.09.2026.`, whole-dinar amounts, running balance |
| csv/rs_cyrillic_modeled.csv | RS | Serbian, Cyrillic | modeled | UTF-8 with BOM, Cyrillic headers |
| csv/hr_modeled.csv | HR | generic Croatian bank | modeled | single signed amount, comma decimals, EUR |
| xlsx/ba_modeled.xlsx | BA | generic BiH bank | modeled | table starts on row 6, real Excel dates, balance column |
| pdf/ba_modeled_text.pdf | BA | generic BiH bank | modeled | text PDF, multi-page, header repeats on each page |
| pdf/de_modeled_text.pdf | DE | generic German bank | modeled | German labels |
| images/phone_subscriptions_ios_like.png | global | iPhone subscription list look-alike | synthetic | name, price with period, renewal date |
| images/phone_subscriptions_android_like.png | global | Google Play list look-alike | synthetic | same |
| images/bank_app_screenshot_bs_like.png | BA | banking app look-alike | synthetic | dates grouped as headers, cut merchant names, name and IBAN on top |
| csv/edge/overlap_part1 + part2 | any | edge case | synthetic | 30 overlapping rows, merge must dedupe |
| csv/edge/one_month_only.csv | any | edge case | synthetic | shows "add another month" |
| csv/edge/mixed_currency.csv | any | edge case | synthetic | EUR and USD rows |
| csv/edge/ambiguous_dates.csv | any | edge case | synthetic | all days ≤ 12, app must ask dd/mm or mm/dd once |

**Status meanings.** *Verified* means the column headers match a public source. *Modeled* means built from common conventions in that country and must be checked against a real export. *Synthetic* means an invented test case.

## Sources for verified headers

- Revolut: example header in github.com/brucify/revolutax
- Wise: column list at dativery.com/en/apps/wise-csv
- N26 English and Haspa (German savings bank) headers and date formats: github.com/daniel1v/bankimport

## How to use in tests

```ts
// for each file in fixtures/, run the full pipeline and compare with expected/<name>.json
// assert: every expected.recurring item is found with the right frequency and price
// assert: nothing from expected.mustIgnore appears
// assert: expected.mustAsk items are marked for a question, not auto-classified
// assert: none of expected.mustRedact values appear in stored data (search the IndexedDB dump for
//         "Ana", "Testić", "BA39", "4111", "Primjera" and the balance figures)
```

## Still needed from real people

Modeled files prove the rules work. Only real exports prove the app works. See the list in the Build Brief, section 14.

## Layout twins added 2026-10-06

| File | Country | Modeled on | Notes |
| --- | --- | --- | --- |
| pdf/layout-twins/de_sparkasse_layout.pdf | DE | German savings bank (Sparkasse) PDF | one merged text item per date line, trailing +/- sign, counterparty on the line under the booking type, "Kontostand" closing line. Invented holder, IBAN and account. Expected results in de_sparkasse_expected.json |
