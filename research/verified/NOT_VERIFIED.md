# Price research status (2026-11-03)

All prices in `plans_verified.csv` have a source link and date. Tiers:
A official = the provider's own page. A app store = Apple App Store in-app price for that country (iPhone price).
B news = two or more independent articles agree. C = single source, never used by the app.

`scripts/build_verified_plans.py` writes them into `src/app/plans.data.json` with `verified: true`.
The app only uses verified plans (plus iCloud+, which comes from Apple's own table). Any service or
country without a verified price asks the person what they pay. No guessed price is shown.

## Coverage (countries with a verified price)
Spotify 82, Netflix 81 (Kosovo has no Netflix price page), Google One 79, ChatGPT 78, Disney+ 56,
Microsoft 365 59, HBO Max 42, Apple One / Music / TV+ / Arcade 34, YouTube Premium 15, Canva 10,
Claude 7, PlayStation Plus 6, Perplexity 5, Amazon Prime 4 (US, DE, FR, AT), Audible 3,
Xbox Game Pass 2 (US, DE), Strava 2, Deezer 1 (US), Paramount+ 1 (US), iCloud+ all (Apple table).
Flat-price: Claude, Notion, Grammarly.

YouTube Premium in GB, FR, IT, PL, SE, CA, AU, IN, TR is the iPhone (App Store) price. Paying on the
web is usually cheaper, and the app always lets the person correct it.

## Still asks the person (no verified price yet)
- YouTube Premium in BE, IE, NO, DK, AT, MX, BR, JP, RS and the Balkans. Student plans everywhere.
- Amazon Prime outside US, DE, FR, AT (GB, CA, AU have only one source each).
- PlayStation Plus Extra/Premium in the eurozone, yearly plans, and everything outside US, GB, DE, FR, ES, NL.
- Xbox Game Pass outside US and DE. Eurozone tiers other than Ultimate and PC have only one source.
- Disney+ in IL, AE, SA, ZA (App Store lists are unclear, no news source).
- Microsoft 365 in BA, ME, MK, AL, XK, MA, KE, GH, BD.
- Deezer outside US (its site shows prices by visitor location).
- Duolingo, Tinder, Bumble, Hinge (no clear monthly price, varies by age or offer).
- Paramount+, DAZN, Crunchyroll, Nintendo, VPNs, Headspace, Calm and the rest of the global list.
- All local items except RTS taksa (RS), Rundfunkbeitrag (DE), Viaplay (NO). Bills, insurance, phone,
  internet, gyms and pay-TV depend on the person, so the app always asks for those.
- Gyms. The hint shows the Numbeo country average (research/gyms.csv), the person types their own price.
- Kazakhstan Google One rows wait for a KZT rate.

## Next rounds
Same method per service: official page first, App Store second, two articles third.
