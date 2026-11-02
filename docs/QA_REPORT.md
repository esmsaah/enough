# Enough — requirements, logic and QA report

_2026-11-02 · against `ENOUGH_BRIEF.md` (incl. addenda) and `DECISIONS.md`_

Status key: **DONE** works end to end and was tested · **PARTIAL** · **PLACEHOLDER** · **BLOCKED** (needs an account/domain) · **NOT BUILT** · **CHANGED** (deliberate, recorded deviation).

## 1. Traceability

| Brief | Requirement | Where | Status | Verified by |
|---|---|---|---|---|
| §1.1 | Statement processed only in the browser | `engine/import.worker.ts`, `screens/WhatWeKeep.tsx` | DONE (fixed) | no-network run on 3 fixtures: 0 requests between file and "What we keep" |
| §1.2 / add. 10-06 | Rules decide, AI optional | `engine/score.ts`, `app/merchantResearch.ts` | DONE | app works with `/api` unavailable (all browser runs) |
| §1.3 | No accounts, no bank login | whole app | DONE | — |
| §1.4 | Word "free" never appears; before paying only *how much*, not which items | `components/Discoveries.tsx`, `screens/Result.tsx` | DONE (fixed) | grep; result screen shows kinds of findings, not services |
| §1.4 | No paywall when nothing is found | `GoodShape.tsx` | DONE | personas p6, p7, p8, p11 |
| §1.5 | One action per item, savings never double counted | `engine/score.ts` | DONE | `score.test.ts`, `acceptance.test.ts` (lines add up to total) |
| §1.6 | Mobile 390 px, in-app browsers | CSS, `Landing.tsx` banner | DONE (banner added) | all browser runs at 390×844 |
| §6 | CSV, Excel, text PDF, several files merged | `engine/*` | DONE | fixtures + 6 real statements (earlier run) |
| §6 | Photo / scanned PDF OCR, phone subscription screenshot | — | NOT BUILT | hidden from upload screen, in `LATER.md` |
| §6 | Currency conversion marked approx. | `engine/rates.ts` | DONE | unit tests |
| §6 | Redaction + "What we keep" | `engine/redact.ts`, `WhatWeKeep.tsx` | DONE | fixture tests, browser |
| §6 | Detection rules 1–8 | `engine/detect.ts` | DONE | `recurring-cases.test.ts`, fixtures |
| §6 | "Anything you pay yearly?" | `AnythingElse.tsx` | DONE (was missing) | browser: insurance €120, renews March → calendar |
| §6 | Confirm, remove, add after detection | `FoundItems.tsx` | DONE | browser |
| §7 | Categories, display category change | `FoundItems.tsx` | DONE | — |
| §7 | Questions per category | `Usage.tsx` | DONE (+ plan, people, home account, gym contract) | browser |
| §7 | More than 6 items → one screen with rows | `Usage.tsx` | NOT BUILT | open question for the founder |
| §7 | Rules 1–3, 5–9 | `engine/score.ts` | DONE | unit tests |
| §7 | Rule 4 rotation: keep most used, pause the others 4 months, saving = monthly × 4 | `engine/score.ts` | DONE (corrected to brief) | `acceptance.test.ts` |
| §7 | Paywall gate ≥ €10 | `score.ts` | DONE | unit tests |
| §7 | Savings target tool | `engine/target.ts`, `CutList.tsx` | DONE (was missing) | `target.test.ts`, browser |
| §7 | One plain reason per item | `score.ts` | DONE (false "use more" fixed earlier) | tests |
| §8 | Landing two paths | `Landing.tsx` | CHANGED (B2 design, decision 69) | — |
| §8 | Screen 3 "Finish on my computer" | — | BLOCKED (email) | placeholder removed from UI |
| §8 | Good shape screen + share card | `GoodShape.tsx` | DONE | browser |
| §8 | Full list: before/after, target tool, Cut / Look again / Keep, Cancel now, Done | `CutList.tsx` | DONE (Keep section and Done for every change added) | browser |
| §8 | "Remind me before it renews" | `CutList.tsx` calendar file | CHANGED: calendar file instead of email until email exists | browser: .ics with cancel, notice, pause/restart, renewal, trial, check-up |
| §8 | Progress saves, back works, merge without duplicates | `store.tsx`, `state.ts` | DONE | browser: reload keeps unlocked list, back returns to card 1 |
| §9 | Withdrawal-right checkbox before paying | `Result.tsx` | DONE (was missing) | browser: button disabled until ticked |
| §9 | Payment and unlock verified by the server | `worker/index.ts`, `app/payment.ts` | CHANGED (Dodo, not Lemon Squeezy) · code DONE · live test BLOCKED (keys) | simulated Dodo responses in browser |
| §9 | Recommendations not rendered before unlock | `Result.tsx` | DONE | — |
| §10 | Email report, reminders, unsubscribe, daily job | — | BLOCKED (domain, Resend) | `EMAIL_ENABLED = false`, PDF meanwhile |
| §11.2 | CSP limits connections to own `/api` | `index.html` | DONE (added) | no CSP violations in runs; injected scripts blocked |
| §11.5 | Delete everything | all result screens | DONE | browser |
| §11.8 | No network between file and "What we keep" | `WhatWeKeep.tsx` | DONE (fixed) | `nonet.js` on 3 fixtures |
| §14 | No console errors, AA contrast, 44 px targets | CSS | DONE except 3 small controls (see 5) | axe-core: 0 violations on 5 screens |

## 2. Logic corrected in this pass

- **Rotation** followed a schedule that claimed up to 2/3 of each service. Now as the brief says: the most used (or cheaper) "sometimes" service stays on, each other one pauses 4 months, saving = monthly × 4. Months are staggered and go into the calendar.
- **Shop-name recognition** ran before the person saw "What we keep". It now runs on Continue, then detection is re-run with what was learned.
- **Before payment** the result listed service names (tips teaser, findings). Now it shows only the kind and amount.
- **Trial question** did nothing (the answer was never stored). Now it asks which service and the date it starts charging, and adds a reminder.
- **Foreign-currency question** did nothing without a statement. Now it gives advice without a made-up amount.
- **Yearly bills** (insurance) had no renewal reminder. Fixed.
- **iCloud vs another cloud**: the drop advice now says to keep iCloud if the iPhone backs up to it.
- **Tapped cancels** with no known charge date get a reminder the next day.

## 3. Tests executed (this pass)

- Unit: 270 passing (20 files).
- Browser, desktop 1440 and mobile 390: click-through of every control (56 checks, 0 failures); statement flow on 2 fixtures (22 cards answered, no errors); gym contract + yearly bill + trial (calendar holds all 4 kinds); 8 user personas (streamers, music overlap, unused service, bills, habits, German cloud overlap, plan too big, everything fine).
- Privacy: no-network on 3 fixtures; CSP active.
- Accessibility: axe-core WCAG 2 A/AA on landing, pick, check, extras, result: 0 violations after the contrast fix.

## 4. Remaining

1. Payment live test: Dodo keys in Cloudflare (founder).
2. Email report, reminders, "Finish on my computer": domain + Resend (founder), then build.
3. Photo/scanned-PDF OCR and phone-subscription screenshots: not built (larger work, `LATER.md`).
4. Brief §7 "more than 6 items on one screen": not built; needs a decision (see open questions).
5. Three controls under 44 px: the country "Change" link, the "0 picked" toggle and the search field height on Pick.
6. Local prices: 9 services; other services fall back to typical prices.

## 5. Open questions for the founder

- **Refunds.** The brief says no refund is advertised; the site now says "refund within 14 days". Keep it?
- **More than 6 items.** Brief wants one compact screen. The cards now carry useful questions (plan, people, contract). Keep cards, or add the compact screen?
