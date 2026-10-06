# Enough — Claude Code Build Brief

_As of 2026-09-27 · Esma_

> Source of truth for V1. Saved from the Enough build-brief doc. If a rule is ambiguous, pick the simplest reading, record it in `DECISIONS.md`, and continue. Do not add features outside this brief — list ideas in `LATER.md`.

## 1. What to build

Enough is a mobile-first web app, opened from a link with no install and no account, that audits a person's recurring costs once and tells them what to cut, pause or keep. It costs €5.99 once, charged only if the audit finds money the person can keep.

The person adds a bank statement (CSV, Excel, text PDF or a photo), picks common services by tap, or enters costs by hand, including costs paid in cash. The app finds recurring payments, asks a few questions about usage, and shows the yearly cost of each item with one suggested action and its potential yearly saving.

**Non-negotiables**

1. The statement is processed only in the browser. No statement file, text or line ever leaves the device. The UI promises "We never see your statement", and the code must make that true.
2. Scoring and recommendations are deterministic rules in TypeScript. No LLM, no AI API calls.
3. No accounts, no passwords, no bank connection.
4. Nothing is free and the word "free" never appears. Before paying the person sees only how much was found, never which items or what to do. If nothing is found, there is no paywall.
5. One suggested action per item, so savings are never double counted. Savings are always "potential".
6. Mobile first at 390 px, working inside TikTok and Instagram in-app browsers.
7. The design follows the Enough design canvas exactly (section 8 and 12).

## 2. Approach

Build the audit engine first, as pure tested functions, and put screens on top of it. The engine is the product. The screens are how people reach it.

**How Claude Code should work**

- Work in the milestone order of section 13. Finish and test each milestone before starting the next.
- Keep the engine (`/src/engine`) free of any UI or browser code, so it can be unit tested with plain data.
- Every rule in sections 6 and 7 gets a unit test with a named fixture.
- Test statements live in `/fixtures` as anonymized CSV, Excel and PDF files. Never commit a real statement.
- When a rule is ambiguous, pick the simplest reading, write it down in `DECISIONS.md`, and continue.
- Do not add features outside this brief. List ideas in `LATER.md` instead.

**Definition of done for the whole V1**

A person on a phone opens the link, adds a real statement or taps a few services, finishes the audit in under four minutes, pays €5.99, sees the full cut list, receives the report by email, and later gets a reminder before a flagged renewal.

## 3. Architecture

A static web app does all the audit work on the device. A small server handles only payment, email and reminders.

Two things cross from phone to server. The summary (item names, amounts, actions, renewal dates) goes only when the person asks for the email report or reminders. The payment goes through Lemon Squeezy, which returns an unlock key. No statement data ever crosses.

**Server parts (the only backend)**

- `POST /api/unlock` verifies a Lemon Squeezy license key or order and returns a signed unlock token.
- `POST /api/webhooks/lemonsqueezy` records paid orders (order id and email only).
- `POST /api/report` receives the summary, sends the email report, and stores reminders if the person opted in.
- `GET /api/unsubscribe?t=...` deletes the email and all reminders for that token.
- A daily scheduled job sends due reminders and the final "your reminders end in 7 days" email, then deletes expired records.

Plus `POST /api/continue`, which emails a link to finish on another device. The link carries only quick-pick and manual items in its fragment, never statement data, and the email address is not stored.

## 4. Tech stack

Small, boring and cheap to run. Zero cost per user on the device side, and a free-tier server.

| Area | Choice | Why |
| --- | --- | --- |
| App | Vite + React + TypeScript | fast static build, easy for Claude Code |
| Styling | plain CSS with the tokens in section 12 | no UI kit, the look is custom |
| State | React state + a small reducer per flow | no global store needed |
| Local storage | IndexedDB via idb-keyval | survives reloads, larger than localStorage |
| Heavy work | Web Worker via comlink | parsing never freezes the screen |
| CSV | Papa Parse | handles delimiters and encodings |
| Excel | SheetJS, installed from the SheetJS CDN tarball | the npm package is outdated |
| PDF text | pdfjs-dist | reads text PDFs in the browser |
| Photos | tesseract.js, loaded only when a photo is added | on-device OCR, heavy so lazy loaded |
| Share card | Canvas 2D drawn by hand | exact control, no dependency |
| Hosting | Cloudflare Pages | static and free to start |
| Server | Cloudflare Pages Functions + D1 + Cron Triggers | four endpoints and one daily job |
| Email | Resend | simple API, free tier |
| Payment | Lemon Squeezy | merchant of record, pays out to BiH and Serbia, handles EU VAT |
| Analytics | Plausible, counting steps only | no personal data |
| Tests | Vitest for the engine, Playwright for the flow | |

Stripe is not an option, it does not support businesses in Bosnia and Herzegovina or Serbia.

## 5. Data model

Use general words (item, cost, action), not "subscription" everywhere, so Enough can later cover all recurring spending.

```ts
// Only these three fields survive import. Everything else is dropped.
type Transaction = {
  date: string;        // ISO yyyy-mm-dd
  merchantRaw: string; // as printed, after redaction
  amount: number;      // positive = money out, in account currency
  currency: string;    // ISO code, e.g. EUR
};

type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type Category =
  | 'digital'      // streaming, AI, cloud, apps
  | 'membership'   // gym, clubs, courses, kids' activities
  | 'bill'         // phone, internet, power, insurance
  | 'habit'        // delivery, taxi, coffee
  | 'other';

type DisplayCategory =
  | 'Entertainment' | 'AI & Software' | 'Cloud & Storage' | 'News & Media'
  | 'Learning' | 'Fitness & Health' | 'Kids & Family' | 'Shopping & Delivery'
  | 'Bills & Utilities' | 'Transport' | 'Other';

type Source = 'statement' | 'quickpick' | 'manual' | 'cash';

type Item = {
  id: string;
  name: string;             // display name, e.g. "FitZone Gym"
  merchantKey?: string;     // normalized merchant, e.g. "fit zone"
  category: Category;           // analysis type
  displayCategory: DisplayCategory; // shown to the person, see section 7
  price: number;            // per period
  frequency: Frequency;
  source: Source;
  estimate: boolean;        // true for cash and manual guesses
  lastCharge?: string;      // ISO date, from statement
  nextCharge?: string;      // predicted
  usage?: 'always' | 'sometimes' | 'almostNever';
  visitsPerMonth?: number;  // memberships only
  singleVisitPrice?: number;// memberships only, optional
  importance?: 1 | 2 | 3 | 4 | 5;
  overlapsWith?: string[];  // item ids
  flaggedForReminder?: boolean;
  done?: boolean;           // person marked the action as done
  currency: string;         // ISO code
  approxConverted?: boolean;
};

type ActionType =
  | 'keep' | 'cancel' | 'rotate' | 'switchYearly'
  | 'payPerVisit' | 'removeOverlap' | 'familyPlan' | 'compareOffers';

type Verdict = 'keep' | 'lookAgain' | 'cut';

type Recommendation = {
  itemId: string;
  verdict: Verdict;
  action: ActionType;
  reason: string;           // one plain sentence
  yearlyCost: number;
  potentialYearlySaving: number; // 0 for keep
};

type Audit = {
  items: Item[];
  recommendations: Recommendation[];
  yearlyTotal: number;
  potentialYearlySaving: number;
  unlocked: boolean;
  createdAt: string;
};
```

## 6. Import, redaction and recurring detection

Every input becomes a list of `Transaction` rows inside a Web Worker. Only date, merchant and amount leave the worker. Detection needs no understanding of language, it looks for the same merchant at a similar amount on a regular rhythm.

**Inputs**

| Input | How | Notes |
| --- | --- | --- |
| CSV | Papa Parse, auto-detect delimiter and encoding | most common export |
| Excel (.xlsx, .xls) | SheetJS, first sheet with a date and amount column | |
| Text PDF | pdf.js, rebuild lines by y position, keep lines with a date and an amount | scanned PDFs fall back to photo OCR or a clear message |
| Photo or image | tesseract.js, Latin and Cyrillic in V1, then the same line rule | show recognized rows for the person to confirm |
| Several files | merge, then remove duplicates (same date, merchant, amount) | overlapping exports are common |

**Phone subscription list (screenshot)**

The safest input, it holds no bank data. iPhone Settings › your name › Subscriptions, and Google Play › Payments and subscriptions › Subscriptions. OCR on the device, then parse each block as service name, price with period, and renewal date ("Renews 14 October", "Obnavlja se", "Verlängert sich"). Items land as `digital` with `nextCharge` already known. Build in M3 with the photo OCR, and keep two fixture screenshots per platform.

**Currency**

- Every Transaction and Item carries its currency. The audit uses the currency that appears most in the statement as the display currency.
- Items charged in another currency (Netflix billed in USD) are converted once with a fixed rate table in `/src/engine/rates.ts`, updated at each release, and marked "approx.".
- All money is formatted with `Intl.NumberFormat` in the display currency. Never hardcode € in the UI. The price of Enough itself comes from Lemon Squeezy in the buyer's currency.

**Normalizing**

- Column headers matched against a multilingual list (date, datum, fecha, data, datum valute, amount, iznos, betrag, importe, montant, description, opis, verwendungszweck, and so on). Keep the list in `/src/engine/headers.ts`.
- Dates in dd.mm.yyyy, dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd and with month names. If dd/mm vs mm/dd is ambiguous, use the reading that works for every row in the file (any value above 12 settles it). If both still work, ask once.
- Amounts with comma or dot decimals and thousand separators (1.234,56 and 1,234.56). Separate debit and credit columns are supported.
- Only money going out is kept.

**Redaction (runs before anything is stored or shown)**

- Keep only the date, amount and description columns. Drop every other column and every header or footer line of the statement.
- In the description, replace IBANs, card numbers (13 to 19 digits, with or without spaces), emails, phone numbers and long digit runs with •••.
- The "What we keep" screen shows the removed categories (name, IBAN, address, balance) as black bars labeled REMOVED, then the kept rows.

**Merchant normalization**

Lowercase, strip payment prefixes and noise (`paypal *`, `sq *`, `google *`, `apple.com/bill`, city names, reference numbers, dates, `d.o.o.`, `gmbh`, `ltd`), collapse spaces. Keep a map of known merchants in `/src/engine/merchants.ts` (Netflix, Spotify, Disney+, YouTube, Apple, Google One, iCloud, Dropbox, ChatGPT, Claude, Canva, Adobe, Microsoft, Amazon Prime, Duolingo, Wolt, Glovo, Uber, Bolt and large telecoms).

**Recurring detection rules**

1. Group by normalized merchant.
2. Fixed-price recurring, at least 2 charges, amounts within ±5% of each other, gaps near 7, 30, 91 or 365 days (±4 days for weekly and monthly, ±10 for quarterly and yearly).
3. Bills, monthly rhythm but amounts vary more than 5% (power, phone with extras). Use the average.
4. Habits, the same merchant 3 or more times a month at irregular amounts (delivery, taxi, coffee). Use the monthly average.
5. Supermarkets and fuel are ignored as habits unless the person adds them.
6. Transfers to private people are never auto-classified, always ask.
7. Next charge date = last charge + detected interval.
8. With fewer than 2 months of data, show "add another month to find more" and still show what was found.

Yearly charges are invisible in a few months of data. Screen 6 always asks "Anything you pay yearly?" with chips for insurance, domain, software licence, membership and other, amount and month of renewal.

After detection, the person confirms the list, removes wrong items and adds missing ones.

## 7. Categories, questions, scoring and actions

Each item gets exactly one action, chosen by the first rule that matches, in the order below. Yearly cost is price × 52, 12, 4 or 1 by frequency.

**Categorization, three layers**

1. Known merchant map (section 6).
2. Multilingual keywords per category in `/src/engine/keywords.ts`, for example membership gets gym, fitness, teretana, fitnessstudio, gimnasio, palestra, salle de sport, crossfit, yoga, pilates, bazen, swim. Bills get telekom, mobile, internet, struja, elektro, osiguranje, insurance, versicherung, seguro. Habits get wolt, glovo, uber eats, bolt food, taxi, café, kafa.
3. Anything else gets an inline category chip on the Found items list, largest yearly cost first. No separate question cards. Items under €2 a month that stay unknown go to Other.

**Two levels of category**

Every item has a display category the person sees and an analysis type the engine uses. The display category groups the results. The analysis type decides which questions are asked and which rules apply.

| Display category (shown to the person) | Analysis type (engine) | Examples |
| --- | --- | --- |
| Entertainment | digital | Netflix, Spotify, Disney+, Max, YouTube Premium |
| AI & Software | digital | ChatGPT, Claude, Gemini, Perplexity, Canva, Adobe Creative Cloud, Notion |
| Cloud & Storage | digital | Google One, iCloud, Dropbox, OneDrive |
| News & Media | digital | NYT, The Economist |
| Learning | digital, or membership for in-person courses | Duolingo, Coursera, MasterClass, language school |
| Fitness & Health | membership, or digital for apps | gym, yoga, pool, Strava, Headspace, Calm |
| Kids & Family | membership | kids' training, lessons, activities |
| Shopping & Delivery | digital for memberships, habit for orders | Amazon Prime, Wolt+, Glovo orders |
| Bills & Utilities | bill | phone, internet, power, insurance |
| Transport | bill or habit | parking, public transport pass, taxi |
| Other | other | anything the person names |

The first eight come from the original ChatGPT brief. Kids & Family, Bills & Utilities and Transport are added because Enough covers offline and cash costs too. The person can change the display category of any item with one tap.

The quick-pick list and the merchant map include every service from the original brief (Netflix, Spotify, Disney+, Max, YouTube Premium, Amazon Prime, ChatGPT, Claude, Gemini, Perplexity, Canva, Adobe Creative Cloud, Notion, Google One, iCloud, Dropbox, OneDrive, Strava, Duolingo, NYT, The Economist, Coursera, MasterClass, Headspace, Calm), plus gym, phone plan, Wolt+ and kids' activities.

**Questions per category (keep the whole audit under 4 minutes)**

| Category | Question | Answers |
| --- | --- | --- |
| digital | How often do you use it? | All the time · Sometimes · Almost never |
| digital, if Sometimes | Would you miss it? | Yes · Not really |
| membership | Visits per month | stepper, 0 to 30 |
| membership, optional | Price of a single visit | number |
| bill | When did you last compare offers? | This year · Over a year ago · Never |
| habit | none in V1, shown for awareness | |
| cash | name, amount, how often | quick-pick chips plus custom, marked as estimate |

Usage is asked only for digital items and memberships. Bills and habits get no usage question. With more than 6 items to ask about, show them on one screen, a row per item with three buttons, instead of one card each.

The merchant map also holds a `cancelUrl` for known services, used by "Cancel now" on the full cut list.

**Rules in order**

1. usage = almostNever, or membership with 0 visits, or digital with Sometimes + Not really → **cut, cancel**. Saving = yearly cost.
2. The same service charged twice (two Spotify charges) → **look again, familyPlan**. Saving = yearly cost of the second charge.
3. Overlap groups (music, cloud storage, AI assistants). Keep the most used in the group, ties go to the cheaper one. The others → **look again, removeOverlap**. Saving = their yearly cost.
4. Video streaming with 2 or more services used Sometimes → keep the most used, the others → **look again, rotate** (pause 4 months a year). Saving = monthly price × 4.
5. Membership with single visit price given and single price × visits < monthly price → **cut, payPerVisit**. Saving = (monthly price − single price × visits) × 12.
6. Membership with 4 or fewer visits a month and no single price → **look again, payPerVisit** with the cost per visit shown and "ask your gym for a per-visit price". Saving = 0 (no invented number).
7. Bill with "Over a year ago" or "Never" → **look again, compareOffers**. Saving = 0.
8. Digital used All the time, billed monthly, and a yearly price known in the merchant map → **look again, switchYearly**. Saving = monthly × 12 − yearly price. Unknown yearly price → skip this rule.
9. Everything else → **keep**, reason "You use this. It's earning its place."

Verdicts map from actions. `cancel` and `payPerVisit` with a number are **cut**. `rotate`, `removeOverlap`, `familyPlan`, `compareOffers`, `switchYearly` and `payPerVisit` without a number are **look again**. `keep` is **keep**.

**Totals and the paywall gate**

- Potential yearly saving = sum of each item's single saving.
- The paywall appears only if at least one item is cut or look again AND the potential yearly saving is at least €10. Otherwise show "You're in good shape. Nothing to pay."

**Savings target tool**

The person enters a monthly target. From items with a saving above 0, pick the subset whose monthly saving is closest to the target, preferring sums at or above it, then fewer items. With 20 items or fewer, check every subset in the worker. Show "To save around €X a month, start with A and B."

Every reason is one plain sentence built from the answers, for example "You said you almost never use it.", "Overlaps with iCloud+, which you use more.", "3 visits a month, €13.33 each."

## 8. Screens and flow

Two clear paths from the landing, few questions, and a finish that makes people act. Five screens are designed in the Enough design canvas. Share cards, emails and all states are specified in "Enough, Design Requirements" (sections 4 to 10). Match both, and build the undesigned screens in the same style.

| # | Screen | Status | Key details |
| --- | --- | --- | --- |
| 1 | Landing | designed, update | two buttons instead of one, "I have a bank statement" (primary) and "I'll tap what I pay for" (secondary). In TikTok or Instagram browsers, a banner "Open in your browser so your audit is saved" shows before any tap |
| 2A | Add statement | build | three options, "Bank statement" (PDF, Excel, CSV or a photo, never your login), "Screenshot of your phone's subscription list" (safe, no bank data, with a 2-step guide for iPhone and Android), "Finish on my computer" |
| 2B | Quick start | designed | chips with running yearly total. Leads to screen 5 |
| 3 | Finish on my computer | build | email field, sends a link that continues on another device. Only quick-pick and manual items travel in the link, never statement data |
| 4 | What we keep | designed | redaction preview, after any statement or screenshot |
| 5 | Found items | build | list with yearly cost. Each unknown merchant has an inline category chip (one tap, replaces the separate "What is this?" cards). Remove, add, and "add another month to find more" |
| 6 | Anything else? | build | one optional screen with a clear Skip. "Anything you pay yearly?" (insurance, domain, memberships) and "Anything you pay in cash?" (gym, hairdresser, kids' training, lessons, cleaning, rent, parking, coffee), amount and frequency, marked estimate |
| 7 | Usage | designed, update | asked only for digital items and memberships. Up to 6 items, one card each (designed). More than 6, one screen with a row per item and three buttons |
| 8 | Result + paywall | designed | yearly total, count, potential saving, first item visible, rest blurred, receipt with TOTAL, ONCE €5.99 |
| 8b | Good shape | build | when nothing is found. No payment. Offers a share card "I checked. I'm in good shape." |
| 9 | Full cut list | build | before and after yearly total, then the savings target tool right below it, then Cut, Look again, Keep. Each cut item has "Cancel now" (link to the cancel page when known) and a "Done" check. Each item has "Remind me before it renews" |
| 10 | Email and share | build | report email, reminder opt-in for the items toggled on screen 9, share card showing money actually cut ("I cut €276 today") from items marked Done, or the planned saving if none are done yet |

**Flow rules**

- Progress saves after every step. Reopening the link resumes where the person left off.
- Back always works and never loses answers.
- Items from quick start and from a statement are merged by normalized merchant without asking. Never show duplicates.
- The whole path with a statement should take about 20 taps after the file is added.
- The first yearly number must appear within 30 seconds on every route.

## 9. Paywall, payment and unlock

One product in Lemon Squeezy, "Enough audit", €5.99, one-time. The overlay checkout keeps the person on the page, so the audit is never lost.

**Before paying the person sees**

- Yearly total, monthly equivalent, number of items.
- How many items are not earning their place, and the potential yearly saving as one number.
- The first cut item in full, the rest blurred.

All other recommendations are not rendered at all until unlock (not just blurred with CSS).

**Payment flow**

1. Required checkbox above the button, "I want immediate access to my audit and understand I lose the 14-day withdrawal right." Final wording to be confirmed with Lemon Squeezy or a consumer-law expert.
2. "Show my full cut list" opens the Lemon Squeezy overlay (Lemon.js), passing an anonymous audit id as custom data.
3. On checkout success, the app calls `POST /api/unlock` with the order id.
4. The server checks the order with the Lemon Squeezy API and returns a signed unlock token (HMAC over audit id and order id).
5. The app stores the token in IndexedDB, renders the full cut list, and shows "Thank you. Here's everything."
6. The same order unlocks one audit. A new audit after 12 months is a new purchase.

**Honest limit**

The engine runs on the device, so a technical person could read the recommendations from the code. For a €5.99 product this is acceptable. Do not add obfuscation or DRM.

**Refunds**

No refund is advertised. Refunds stay possible manually in Lemon Squeezy, case by case, to avoid chargebacks.

## 10. Email report and reminders

After unlock, the person can send the report to the email used at checkout (prefilled, editable) and opt in to reminders. Two separate checkboxes, both unchecked by default.

- Send me my audit report.
- Remind me 2 days before anything I flagged renews, for 12 months (flags come from the "Remind me before it renews" toggles on the full cut list).

A third, separate checkbox for news about Enough, also unchecked.

**What is sent to the server**

Email, item names, yearly and per-period cost, verdict, action, reason, and next charge date for flagged items. Nothing else. Never merchant strings from the statement, never transaction rows.

**Report email**

Looks like a short personal letter. Subject "Your Enough audit, €1,488 a year". Total at the top, then Cut, Look again, Keep with yearly cost and action. One button back to the audit. Footer says what is stored and has a one-click unsubscribe.

**Reminder email**

Two sentences, for example "Disney+ renews on 14 October for €10.99. In your audit you said you almost never use it." A link to the service's cancel page if known in the merchant map, and a link to the audit.

**Lifecycle**

- Reminders run 12 months from purchase.
- 7 days before the end, one email offering a new audit.
- After 12 months all data for that email is deleted automatically.
- Unsubscribe deletes everything immediately.
- Email domain must have SPF, DKIM and DMARC set up before launch, or mail goes to spam.

## 11. Privacy and security rules

The promise "We never see your statement" is enforced by code and by tests, not by good intentions.

1. Files are read with the File API and parsed in a Web Worker. No fetch, XMLHttpRequest, sendBeacon or WebSocket may carry file contents or transaction rows.
2. A Content Security Policy limits `connect-src` to the app's own `/api`, Lemon Squeezy and Plausible. No other third-party scripts.
3. tesseract.js language data and pdf.js worker are self-hosted, not loaded from a CDN, so the import screen makes no outside requests.
4. Raw files are never stored. Only redacted Transaction rows and Items go to IndexedDB.
5. A "Delete everything" link on every result screen clears IndexedDB.
6. Plausible events carry step names only (for example audit_started, statement_parsed, paywall_shown, paid), never amounts, merchants or counts per person.
7. Server logs never store request bodies from `/api/report`.
8. A Playwright test loads a fixture statement and fails if any network request fires between file selection and the "What we keep" screen.
9. If an AI fallback for hard PDFs is ever added, the landing copy must change the same day. Not part of V1.

"Finish on my computer" never sends statement data. If the person already added a statement on the phone, the email says they will add it again on the computer.

## 12. Design tokens

Put these in `/src/styles/tokens.css` and use nothing else. Self-host the fonts.

```css
:root {
  --navy: #14204A;        /* landing, result header, share card */
  --indigo: #3346D3;      /* primary buttons on light, keep, pen circles */
  --indigo-dark: #26379F;
  --lime: #D4EE8A;        /* found money only, max once per screen */
  --coral-pen: #D2452A;   /* strike-throughs, stamps, handwritten notes */
  --coral-text: #C4320F;  /* cut labels on light ground */
  --amber: #F2B544;
  --amber-text: #8A5A00;
  --ground: #F2F1EC;
  --paper: #FBFAF6;
  --white: #FFFFFF;
  --ink: #101014;
  --muted: #5B5B66;
  --muted-on-navy: #A9B1D6;
  --line: #DEDDD5;
  --dash: #BDBCB3;

  --font-display: 'Archivo', sans-serif;   /* font-stretch 110-125%, weight 700-800 */
  --font-mono: 'IBM Plex Mono', monospace; /* amounts, dates, merchants */
  --font-hand: 'Caveat', cursive;          /* notes of four words or fewer */

  --radius: 6px;
  --radius-card: 8px;
  --tap: 44px;
  --button-h: 56px;
  --gutter: 20px;
}
```

**Components to build once**

- Receipt with torn top and bottom edges (SVG zigzag), mono rows, dashed dividers.
- PenStrike an irregular SVG stroke over any text, drawn in 250 ms when an item is cut.
- PenCircle a hand-drawn ellipse around a number.
- Stamp rotated outlined label, used for REDACTED ON THIS PHONE.
- HandNote Caveat text, slightly rotated, max four words.
- Chip, Button (lime on navy, indigo on light), Stepper, ProgressBar, ItemRow, VerdictGroup.

No shadows, no gradients, no emoji, no tilted cards, no rows of checkmarks.

## 13. Milestones

The engine and the manual audit come first, because they prove the product works before any file parsing exists. M1 alone is already a sellable product with manual entry. Every later phase adds a faster way in, not a new feature.

- **M1** — Engine + manual audit flow (quick picks, cash entry, usage cards, result, full cut list) with a fake unlock button. Design tokens + canvas applied.
- **M2** — CSV/Excel import, redaction, recurring detection, "What we keep" screen. Validated against `/fixtures`.
- **M3** — PDF text + photo/screenshot OCR (Latin + Cyrillic), phone subscription list.
- **M4** — Real Lemon Squeezy paywall + `/api/unlock`.
- **M5** — Email report + reminders (`/api/report`, `/api/unsubscribe`, daily cron), "Finish on my computer".
- **M6** — Share cards, all empty/error/edge states, launch quality bar.

_(Milestone/gate detail comes from the doc's diagram; confirm exact gate wording against the doc if needed.)_

## 14. Quality bar, out of scope and open inputs

**Quality bar before launch**

- Unit tests for every rule in sections 6 and 7, including date and decimal formats, the ±5% and interval tolerances, overlap groups, and the one-action-per-item rule.
- A test that savings are never counted twice and that "keep" items save 0.
- The no-network Playwright test from section 11.
- The whole flow works on a 390 px phone, in Safari, Chrome and inside the Instagram in-app browser.
- Resume after closing the tab works on every screen.
- Empty, error and edge states: no recurring found, one item only, 30+ items, unreadable file, scanned PDF, payment cancelled, email failed.
- Text contrast meets WCAG AA, verdicts never shown by color alone, tap targets at least 44 px.
- No console errors.

**Out of scope for V1**

Bank connections, accounts and passwords, native apps, push notifications, dark mode, AI or LLM features, AI fallback for hard PDFs, location-based comparisons of gyms or providers, budgeting, investments, debt tracking, family accounts, languages other than English in the interface.

**Inputs still needed from the founder**

- 3 to 5 real statement exports (CSV, Excel, PDF) from different banks, anonymized, for `/fixtures`. _(Modeled + synthetic set delivered; real exports still pending.)_
- Domain name.
- Lemon Squeezy account and product.
- Resend account with the domain verified (SPF, DKIM, DMARC).
- Cloudflare account.
- Final wording of the withdrawal-right checkbox, privacy policy and terms.

---

## First message that started the build

> Read ENOUGH_BRIEF.md fully before writing code. We are building V1 of Enough exactly as described there. Start with milestone M1 only. Set up Vite + React + TypeScript, create /src/engine with the data model from section 5 and the rules from section 7, and write unit tests for every rule. Then build the manual audit flow (quick picks, cash entry, usage cards, result, full cut list) with a fake unlock button, matching the design tokens in section 12 and the design canvas. Stop when the M1 gate passes and summarize what you built and what you decided in DECISIONS.md.


## Addendum, 2026-09-27 · Global coverage (applies to section 6)

Enough is global from day one. The interface stays English in V1, but statements from any country must be read. Parsing works on patterns, not on a list of banks.

- Digits. Convert Arabic-Indic (٠–٩), Persian (۰–۹), Devanagari (०–९), Thai (๐–๙) and full-width (０–９) digits to 0–9 before anything else, plus the Arabic decimal ٫ and thousands ٬ signs.
- Number formats. 1,234.56 · 1.234,56 · 1 234,56 (space or narrow space) · 1'234.56 (Swiss) · 12,34,567.89 (Indian grouping) · currency symbols or codes inside the cell (R$, TL, ₹, ¥, د.إ) · minus before or after the symbol · amounts in parentheses as negative.
- Calendars. Gregorian in every order and separator, month names in any language (Intl month names for the detected locale), Hijri (Umm al-Qura), Persian Solar Hijri, Thai Buddhist Era (year − 543). Convert to ISO before detection.
- Headers. The multilingual header list covers at least English, Bosnian/Serbian/Croatian (Latin and Cyrillic), German, French, Spanish, Portuguese, Italian, Dutch, Polish, Turkish, Russian, Ukrainian, Greek, Arabic, Persian, Hindi, Chinese, Japanese, Korean, Thai, Indonesian and Vietnamese. When no header matches, detect the date and amount columns from their values.
- Encodings. Auto-detect UTF-8 (with or without BOM), UTF-16, Windows-1250/1251/1252/1256, ISO-8859-x, Shift_JIS, GBK and Big5 with TextDecoder.
- Right-to-left text. Arabic and Hebrew descriptions are stored as is, only the extracted merchant is normalized.
- OCR. Detect the script of an image first, then lazy-load only that tesseract language pack (Latin and Cyrillic bundled, Arabic, CJK, Thai and Devanagari on demand).
- Currencies. rates.ts covers at least the 40 most traded currencies. An unknown currency is shown unconverted with a note, never guessed.

Test files: /fixtures/csv/global (AED with Arabic digits, SAR with Hijri dates, JPY, INR, CHF, TRY, BRL, THB with Buddhist Era), expected results in /fixtures/expected. Add them to fixtures.test.ts with forbiddenAfterRedaction from each expected file.
