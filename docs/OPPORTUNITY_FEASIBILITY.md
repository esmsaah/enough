# Opportunity engine — feasibility and proof of concept

Status: proof of concept built and passing. Not wired into the app.
Code: `src/engine/opportunity/engine.ts`, data `plans.de.json`, tests `poc.test.ts` (23 tests, all pass, full suite 347).
Printed results: `docs/OPPORTUNITY_POC_OUTPUT.txt`.

## 1. Where every alternative comes from

| Alternative | Source of the price | Source of the rule | Needs extra verification? |
|---|---|---|---|
| Cheaper plan of the same service | researched plan file, per country | plan features (screens, ads, quality, storage) in the same file | features must be tagged once per plan; today only the 3 German services in the POC have them |
| One shared plan for one home (Duo, Family, iCloud family) | researched plan file | provider sharing rule (same address, max accounts), stored per plan | the person must confirm everyone lives at the same address |
| Rotation | what the person pays now; on return, the researched list price if we have it | billing day from the statement, else assumed | services without researched prices are rotated at the person's own price and marked medium confidence |
| Pay per visit | both numbers typed by the person | contract end typed by the person | notice period is not known, the text says to check it |
| Cancel | what the person pays | only for items the person said they can live without | none |

Nothing else creates an option. No typical price, no average, no guess.

## 2. Keeping plan data accurate

One file per market, same shape as `plans.de.json`.

- **Per plan.** service, plan, monthly price, billing periods offered, features (ads, streams, quality, storage), accounts, same-address rule, requirement (student, family), source URL.
- **Per market.** currency, verified date, notes for rules that don't fit the table (Netflix has no yearly plan in Germany, Basic discontinued; Apple lists one Euro row).
- **Freshness rule.** A plan older than 120 days is not used for a € figure. The item falls back to "no verified alternative".
- **Refresh.** A monthly scheduled task (free, runs here) re-reads every source URL and reports changed prices for a human to approve. No paid API. Prices are public pages.

Effort. The existing research already has price, people, source and date for 11 services in about 60 countries. Missing is only the feature tags and the sharing rules, about one line each per plan.

## 3. How each mechanism creates only valid alternatives

- **Plan fit.** A plan is a candidate only if it covers every need the person stated. If a need is unknown, today's level of that feature is kept. So "cheaper" never wins alone. Proof in S4. Netflix Premium with unknown viewers produces no saving, only a question that would unlock €72.
- **Shared plan.** Allowed only when the other person is at the same address (provider rule) and, for storage, when everyone's usage fits. Proof in S6 (other address, no Duo) and S7.
- **Rotation.** Only services the person keeps and uses sometimes. Prepaid or contracted services are excluded until they end. Coming back costs today's list price, not an old one. Proof in S5. The legacy €13.99 Netflix rejoins at €15.99, so the saving is €131.88, not €143.82.
- **Pay per visit.** Only with the person's own single-visit price, and only after the contract ends. Proof in S1. The gym saving counts 8 months, €127.20, not 12.
- **Exposure.** A plain sum of the person's items by commitment.

## 4. How combinations are chosen

- Every option lists the accounts it changes.
- Two options that touch the same account can't both be chosen.
- A combined option is generated where combining is real. Rotation on top of a cheaper plan is its own option, computed from the final setup, never added to the downgrade.
- The search is exhaustive and deterministic (options are few). It maximises money freed in the next 12 months, ties go to fewer changes.
- It runs three times, once per loss level.
  - nothing given up
  - wait for shows (rotation)
  - drop what the person said they can live without

  Items the person said they'd miss are never dropped.

Proofs.
- S7. Own 200 GB (€84) and shared 2 TB (€35.88) both exist, and the engine picks €84, never €119.88.
- S8. Without waiting it gives €72. With waiting it gives €227.88, not €72 + rotation.

## 5. Automated vs needs input or research

| Part | Automated | Needs the person | Needs manual research |
|---|---|---|---|
| Matching current plan from price | yes | — | — |
| Viewers at once, second account at home | — | already asked | — |
| Ads OK, 4K needed, storage used | — | 1 tap each, only when it unlocks a saving | — |
| Billing day | yes from a statement | 1 tap on the tap path, only for rotation | — |
| Plan prices and features | refresh check automated | — | approve changes, tag features once |
| Contract notice period | — | not asked, flagged | — |
| Telecom and insurance alternatives | — | — | per country, not in MVP |

## 6. Limits that stay in the product text

- **Rotation.** You wait for a show until its service is on. Re-subscribing sets a new billing day. Prices can rise between blocks (we use today's list price). Some services have intro offers or lose them. Watch history usually stays, but downloads stop.
- **Sharing.** Duo and Family require the same address (Spotify checks it). Netflix extra members are for people outside the home and cost €4.99 to €5.99. That is not modelled yet.
- **Yearly billing.** Netflix and Spotify sell no yearly plan in Germany, so no yearly option exists for them. A yearly plan only helps if the person would keep the service the whole year. It is offered only to items used weekly and would-miss.
- **Cancellation timing.** Monthly plans end at the end of the paid period. Contracts need notice, which we don't know. Deadlines are the day before the next charge, so they are exact only with a statement.

## 7. Proof of concept (Germany, Netflix, Spotify, iCloud+)

Prices verified on the official pages on 2026-11-03.

| Service | Plan | Price |
|---|---|---|
| Netflix | Standard with ads | €6.99 |
| Netflix | Standard | €15.99 |
| Netflix | Premium | €21.99 |
| Spotify | Individual | €12.99 |
| Spotify | Student | €6.99 |
| Spotify | Duo | €17.99 (same address) |
| Spotify | Family | €21.99 (same address) |
| iCloud+ | 50 GB / 200 GB / 2 TB / 6 TB / 12 TB | €0.99 / €2.99 / €9.99 / €29.99 / €59.99 |

S1, a couple in Berlin with a statement, output in short.
- **Without giving anything up, €379.08 in the next 12 months.**
  - iCloud 200 GB €84
  - Netflix Standard €72
  - Spotify Duo €95.88
  - gym per visit €127.20, starting April 2027
- **If you also drop what you said you can live without, €498.48** (adds Audible).
- Each line has its deadline, its evidence in the person's words, what is given up, and the source URL.

S2, three streaming services, rotation. €287.68, with chained dates (Netflix until 9 Mar, Disney+ 10 Mar to 9 Jul, WOW from 10 Jul) and the cancel-before dates.

Full text in `docs/OPPORTUNITY_POC_OUTPUT.txt`.

## 8. Zero cases

- **S3.** Already on the cheapest plans that fit. No options and €0 at every level, with one reason per item.
- **S4.** Needs unknown. €0 counted, one question per item with what it would unlock.
- **S6.** Sharing not allowed. No option.

## What must change from the proposal

1. **Plan data needs feature tags and sharing rules**, not only prices. Without them "cheaper" can't be checked as "suitable".
2. **Unknown needs keep today's level.** This turns many proposed savings into questions. That is the honest result.
3. **Rotation re-subscribes at today's list price, sets a new billing day, and excludes prepaid or contracted services.** The proposal's simple "price × months" overstated it.
4. **Savings are computed from the final setup over 12 billing periods**, not by adding separate claims.
5. **Yearly billing is dropped for Netflix and Spotify in Germany**, because they don't sell one there. It stays only where the plan file lists a yearly price.
6. **Contract notice periods** are a known gap, flagged in text, not modelled.
7. **Netflix extra member** is a real option for someone outside the home, not yet modelled.
