# Price research status (2026-11-03)

All prices in `plans_verified.csv` have a source link and date. Tiers:
A official = the provider's own page. A app store = Apple App Store in-app price for that country (iPhone price).
B news = two or more independent articles agree. C = single source, never used by the app.

`scripts/build_verified_plans.py` writes them into `src/app/plans.data.json` with `verified: true`.
The app only uses verified plans (plus iCloud+, which comes from Apple's own table). Any service or
country without a verified price asks the person what they pay. No guessed price is shown.

## Coverage (countries with a verified price)
Spotify 82, Netflix 81 (Kosovo has no Netflix price page), Google One 79, ChatGPT 78, Disney+ 54,
Microsoft 365 54, HBO Max 42, Apple One / Music / TV+ / Arcade 34, Canva 10, Claude 7,
YouTube Premium 6 (US, DE, ES, NL, CH, HR), Perplexity 5, Audible 3, Amazon Prime 3 (DE, FR, AT),
Strava 2, Deezer 1 (US), Paramount+ 1 (US), iCloud+ all (Apple table). Flat-price: Claude, Notion, Grammarly.

## Still asks the person (no verified price yet)
- YouTube Premium elsewhere. IT and PT figures (20.99) came only from user reports, not used.
  GB, FR, BE, IE, Nordics, PL, LatAm, IN, TR, JP, AU only have blog conversions.
- Amazon Prime outside DE, FR, AT. US is unclear (Amazon help page and 2026 articles disagree).
- Deezer outside US (its site shows prices by visitor location).
- PlayStation Plus, Xbox Game Pass, Nintendo Switch Online (prices behind sign-in).
- Duolingo, Tinder, Bumble, Hinge (no clear monthly price, varies by age or offer).
- Disney+ in IL, AE, SA, ZA, MY, IN. Microsoft 365 in the Balkans, Middle East and Africa.
- Paramount+, DAZN, Crunchyroll, VPNs, Headspace, Calm and the rest of the global list.
- All local items except RTS taksa (RS), Rundfunkbeitrag (DE), Viaplay (NO). Bills, insurance, phone,
  internet, gyms and pay-TV depend on the person, so the app always asks for those.
- Gyms. The hint shows the Numbeo country average (research/gyms.csv), the person types their own price.
- Kazakhstan Google One rows wait for a KZT rate.

## Next rounds
Same method per service: official page first, App Store second, two articles third.
