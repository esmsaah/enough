# Price research status (2026-11-03)

All prices in `plans_verified.csv` have a source link and date. Tiers:
A official = the provider's own page. A app store = Apple App Store in-app price for that country (iPhone price).
B news = two or more independent articles agree. C = single source, never used by the app.

`scripts/build_verified_plans.py` writes them into `src/app/plans.data.json` with `verified: true`.
The app only uses verified plans (plus iCloud+, which comes from Apple's own table). Any service or
country without a verified price asks the person what they pay. No guessed price is shown.

## Coverage (countries)
Spotify 82, Netflix 81 (Kosovo has no Netflix price page), Disney+ 54, Microsoft 365 52,
Apple One / Music / TV+ / Arcade 34, Google One 32, HBO Max 30, ChatGPT 13 + flat $20,
Canva 10, iCloud+ all (Apple table). Flat-price: Claude, Notion, Grammarly.

## Still asks the person (no verified price yet)
- YouTube Premium outside DE, CH, HR (no official price page readable, not in App Store).
- Amazon Prime, Prime Video, Kindle Unlimited (amazon blocks automated reading) except DE.
- PlayStation Plus, Xbox Game Pass, Nintendo Switch Online (prices behind sign-in).
- Duolingo, Tinder, Bumble, Hinge (App Store lists no clear monthly price; prices vary by age or offer).
- Deezer, Paramount+, DAZN, Audible, Crunchyroll, VPNs, Headspace, Calm and the rest of the global list.
- All local items except RTS taksa (RS), Rundfunkbeitrag (DE), Viaplay (NO). Bills, insurance, phone,
  internet, gyms and pay-TV depend on the person, so the app always asks for those.
- Gyms: the hint shows the Numbeo country average (research/gyms.csv), the person types their own price.

## Next rounds
Same method per service: official page first, App Store second, two articles third.
