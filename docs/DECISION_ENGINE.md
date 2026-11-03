# Enough decision engine — design (v2)

Status: design for approval. No code changed yet.

## 1. What we can actually know

Every conclusion may only use these inputs. Tags: **F** observed fact, **S** stated by the person, **D** derived by us, **R** researched reference data.

| Data point | Tag | Where it comes from | Reliable for |
|---|---|---|---|
| Price, billing period, currency | F (statement) / S (tapped) | statement or Pick | cost, yearly commitment |
| Exact vs estimate | F | `source`, `estimate` | confidence of every € figure |
| Charge history, last and next charge | F | statement | renewal timing, deadlines |
| Price increase (from → to) | F | statement | unnoticed cost growth |
| Duplicate charge in one period | F | statement | refund opportunity |
| Usage: every week / sometimes / almost never | S | Check | frequency only, NOT value |
| Would miss it (asked only for "sometimes") | S | Check | personal importance, partial |
| Which one you'd keep in an overlap, or "Both" | S | Check | stated preference, or "they serve different needs" |
| Plan, people watching at once, second account at home | S | Check | plan fit |
| Visits a month, contract, contract end, price of one visit | S | Check | cost per use, lock-in |
| Last time a bill was compared | S | Check | switching opportunity |
| Monthly saving target | S | result page | constraint for the plan |
| Plans and prices per country | R | plans.data.json | cheaper plan, family/duo, yearly price |
| Typical gym price per country | R | gyms.data.json | price check only, labelled "typical" |
| What a service includes (YouTube Premium has Music, M365 has 1 TB, iPhone backup only to iCloud) | R | engine rules | real overlap vs apparent overlap |

### What we do NOT know (and must never pretend to)

- Importance of weekly-used services (we never ask "would you miss it" for them). So "used a lot but low value" is invisible today.
- Why someone keeps two similar services, except when they answered "Both".
- Income or budget, except the saving target.
- Cancellation terms of digital services beyond what is common (monthly plans cancel any time). Yearly plans are treated as locked until renewal.
- Real price of one gym visit unless the person typed it.

## 2. Value model

No single score. Each item gets a small structured assessment with five separate dimensions, each with its own evidence.

| Dimension | Values | Built from |
|---|---|---|
| Cost | monthly, yearly, share of total, cost per use where uses are known | price, period, visits |
| Use | weekly / sometimes / almost never / unknown | usage, visits |
| Importance | would miss / would not miss / chosen over another / unknown | wouldMiss, overlap answer |
| Redundancy | none / apparent / real, with what is shared and what is lost | overlap group + included-features rules + "Both" answer |
| Commitment | free to cancel / locked until date / yearly renewal month | period, contract, contractEnds, renewalMonth, nextCharge |
| Confidence | high / medium / low | exact vs estimate, how many dimensions are known |

Why not MCDA weights. We have 1 to 3 stated signals per item, all ordinal. Any weighting would be arbitrary and would hide the reason. A transparent rule table on top of the dimensions is more honest and testable. The one place where trade-offs are combined is the saving-target plan (section 4), and there the order is the person's own stated importance, not a weight.

## 3. Decisions the engine can make

| Decision | Allowed only when | Never when |
|---|---|---|
| **Keep** | used weekly, or would miss it, or chosen in an overlap, and no cheaper plan fits the stated use | importance unknown and the text would claim value ("earning its place" goes away) |
| **Review** | a real signal conflicts with another (weekly use but price rose 30%, sometimes used and would miss it, contract ends soon) | there is no specific reason to name |
| **Redundant** | a real overlap per the included-features rules and the person did not answer "Both" | the person said "Both", or the overlap is only the same category |
| **Opportunity (€)** | a concrete alternative exists in our data or in the person's own numbers (cheaper plan that fits stated screens, duo/family for a second account at home, single visits they priced, rotation of sometimes-used video, duplicate charge, yearly price) | the € would rely on a guessed price |
| **Not enough info** | the decision depends on something we did not ask | — the gap is named, no generic tip replaces it |

Each finding carries: finding, evidence (the exact answers it used), interpretation, trade-off (gain and loss), € impact with the calculation, confidence, one action. Missing parts are left out, never filled.

## 4. Insights a person can't easily do alone

These are the cross-item and counterfactual ones. All deterministic, from existing data.

1. **Real overlap vs apparent overlap.** Spotify + YouTube Premium is real (Music is included). Netflix + HBO is not, it is the same category with different content. Two video services both used "sometimes" become a rotation, not a cut. If the person said "Both", the engine says the overlap is a choice, shows the combined yearly cost, and does not count a saving.
2. **Rotation counterfactual.** For video services used "sometimes": the exact months to pause each one, and the exact yearly difference. Trade-off stated (you wait for new seasons, nothing is lost).
3. **Plan fit.** Screens paid for vs people watching at once, from researched plans in that country. "You pay for 4 screens, 1 person watches. Standard covers that for €X less a year."
4. **Cost per use.** Gym: membership ÷ visits = price you really pay per visit. Compared only with the single price the person typed. Without it, the engine says what to ask for and claims no €. The €0.00 bug is fixed by treating an empty price as unknown.
5. **Commitment timing.** Contract end → months still locked, earliest saving date. Yearly plan → the month to decide before it renews. Statement next charge → the date to cancel by to avoid the next payment.
6. **Unnoticed price growth.** From the statement, "went from X to Y, that is Z more a year than when you started."
7. **Saving target as an optimisation.** Given the monthly target, choose the smallest set of changes that reaches it, ordered by what the person said they would lose least (almost never → would not miss → overlap they chose to drop → plan downgrade → rotation). Show what reaching the target costs in things they said they'd miss, and when it is not reachable without touching something they value, say so.
8. **Keep, with a reason.** Instead of one sentence for everything, a keep shows its own evidence: cost per week for a weekly service, "chosen over Spotify", "already on the cheapest plan that fits 2 screens", or "nothing in your answers suggests a change".

## 5. What goes away

- "You use this. It's earning its place." for every kept item.
- "Small amounts add up" shown twice. It stays only if those small items are not already in a cut.
- Step lists that only say "open your account and click Cancel". The action stays one line with the link.
- Any € figure built on a typical or guessed price.

## 6. One question to add (needs your approval)

"Would you miss it?" today is asked only for services used "sometimes". Asking it also for weekly-used ones (same one tap) is the only way to see the case "used a lot, but not worth it to you". Without it the engine can only say "Keep" or "Not enough info" for those. No other new question is needed.

## 7. LLM

Not used. All findings and text come from the deterministic engine and the answers. Same answers, same result.

## 8. Decision-quality tests

Each scenario has input, expected decision, forbidden decisions and the expected € math.

| # | Scenario | Expected | Forbidden |
|---|---|---|---|
| 1 | Sometimes used, would miss it | Keep or Review with cost per year, no € claimed | Cancel |
| 2 | Weekly used, would not miss it (needs question 6) | Review, full yearly cost shown as what's at stake | Keep with "earning its place" |
| 3 | Expensive, weekly, already cheapest fitting plan | Keep, reason names the plan fit | Opportunity |
| 4 | Netflix + HBO, answered "Both" | No redundancy, combined cost shown | Redundant, any € |
| 5 | Spotify + YouTube Premium, keep YouTube Premium | Redundant Spotify, € = Spotify yearly | Rotation |
| 6 | Cheap service, almost never used | Opportunity = yearly cost | Keep |
| 7 | Gym on contract until a date, 1 visit a month | Opportunity starts after contract end, months locked stated | Saving counted for locked months |
| 8 | Usage missing | Not enough info, names the missing answer | Any decision with € |
| 9 | Gym, no single-visit price | Review, cost per visit shown, no € | "€0.00 each" |
| 10 | Two video services both sometimes | Rotation with months and exact € | Cancel one |
| 11 | Microsoft 365 + Google One | Redundant Google One if files fit 1 TB, condition stated | Unconditional cut |
| 12 | Target higher than all safe cuts | Plan shows the gap and what else it would cost | Silently picking things they'd miss |
| 13 | Two different users with different answers | Different findings | Identical generic text |

## 9. Implementation plan

1. `engine/assess.ts` builds the per-item dimensions (pure, tested).
2. `engine/decide.ts` turns them into findings with evidence, € math, confidence (pure, tested with the table above).
3. Existing `runAudit` keeps its output shape so the result and cut list screens keep working, then the cut list renders the new finding fields (evidence, trade-off, confidence).
4. Fix the gym €0.00 bug and the duplicated "small amounts".
5. End-to-end run on 4 personas, screenshots before and after.
