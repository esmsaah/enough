# Enough opportunity engine — proposal

Status: proposal only, nothing implemented.
Direction. The engine stops classifying items by how often they are used. It searches for verified cheaper ways to keep what the person values, and only then for things to drop.
Kept from DECISION_ENGINE.md. Deterministic rules, no LLM, no overall score, one action per item, every € traceable, potential vs confirmed money kept apart.

All prices below come from `src/app/plans.data.json` (researched, checked 2026-10-25 / 2026-11-02) unless marked as the person's own number.

---

## How the engine works, in one paragraph

For every item the engine builds a list of **options** (keep as is, cheaper plan, shared plan, yearly billing, rotate, pay per visit, pause, cancel). Each option has a **verified price** (researched plan or the person's own number), a **start date** (when it can take effect, given billing day, prepaid period and contract), and a **loss** (what the person gives up, from their own answers). The engine then chooses one option per item so that the realistic money freed in the next 12 months is as large as possible without crossing the loss the person accepts. Options without a verified price never get a € figure.

---

## Mechanism 1 — Plan optimisation

**Logic.** For a service with researched plans in the person's country: find the plans that still cover every need the person stated (people watching at once, accounts in the home, storage used, ads acceptable). If the cheapest such plan costs less than what they pay, that is an opportunity. Merging two accounts in one home into Duo or Family is the same search with "people = 2+".

**Inputs.**

| Input | Collected today? |
|---|---|
| current price, plan (matched from price) | yes |
| people watching at once | yes (Netflix, Disney+, HBO Max, others with screens) |
| someone at home pays for their own account | yes |
| researched plans with people and price | yes, 11 services, ~60 countries |
| plan features: ads or not, video quality | **no**, needs one research pass to tag existing plans |
| ads acceptable? | **no**, one tap, asked only when an ad plan is the cheaper fit |
| storage actually used (cloud) | **no**, one number, asked only for cloud plans above the smallest tier |

**Example (Germany).**
- Netflix Premium €21.99, one person watches, ads not OK → Standard €15.99 keeps ad-free and covers 1 to 2 screens, loses 4K. €6.00 a month, **€72 in 12 months**.
- Two Spotify Individual in one home, €12.99 each → Premium Duo €17.99. €7.99 a month, **€95.88 in 12 months** for the household.
- iCloud+ 2 TB €9.99, 140 GB used → 200 GB €2.99. **€84 in 12 months**.

**Confidence.** High when the price is from the statement and the plan list is researched for that country. Medium when the price was tapped. The text names what is lost (4K, fourth screen) and the date the plan list was checked.

**Without paid services.** Yes. Needs the one-off feature tagging of existing plan data and two conditional taps.

---

## Mechanism 2 — Rotation

**Logic.** Candidates are video services the person keeps (would miss) but uses only "sometimes". The person can pin one to stay on all year. The rest are active one at a time, in blocks of whole billing months, in a fixed order. Each block ends with a cancel deadline (the day before the next charge) and the next service starts the same day. Monthly plans only. A yearly prepaid plan joins the rotation only after its paid year ends.

**Inputs.**

| Input | Collected today? |
|---|---|
| video services, price, usage, would miss | yes |
| pinned service (always on) | yes (rotation plan supports pins) |
| billing day of month | yes from a statement (last charge); **no** on the tap path, one tap "Which day do you pay?" or the default "the day you subscribe" |
| what they watch, release dates | no, and not needed. Stated as the limitation |

**Example (Bosnia, tapped prices).** Netflix €7.99, Disney+ €9.25, HBO Max €15.73, all "sometimes, would miss".
- Today: €32.97 a month, **€395.64 a year**.
- Rotation, 4 months each: Netflix Dec–Mar, Disney+ Apr–Jul, HBO Max Aug–Nov. Paid: 4 × 7.99 + 4 × 9.25 + 4 × 15.73 = **€131.88**.
- Freed: **€263.76 in 12 months**.
- Each block has its cancel date and a calendar reminder 2 days before.

**Confidence.** The € is exact for the given prices. The limitation is behavioural: the person waits for a show until its service's months. If a statement shows the billing day, the dates are exact; otherwise they are anchored to the day they restart.

**Without paid services.** Yes. Most of it already exists (buildStreamingRotationPlan, calendar export). Missing: billing day on the tap path, and making rotation the item's action instead of a side note.

---

## Mechanism 3 — Cost of use

**Logic.** Only where use is counted, not felt. Today that is memberships (visits a month). Cost per visit = monthly price ÷ visits. Compared with the single-visit price the person typed. If single visits are cheaper, the opportunity is the difference. If no single price is known, the engine shows the cost per visit and abstains from a €.

Streaming cost per hour is **not** computed. "Every week / sometimes" is not a count, so any per-hour figure would be invented.

**Inputs.** price, visits a month, single-visit price (optional), contract end. All collected.

**Example.** Gym €45 a month, 2 visits → €22.50 per visit. Single visit €6 → €12 a month. €33 a month. Contract ends 2027-03 → only 8 of the next 12 months are free: **€264 in 12 months** (€396 a year after that).

**Confidence.** High with a typed single price. Without it, no €.

**Without paid services.** Yes. Exists, needs the €0.00 bug fixed and contract timing applied.

---

## Mechanism 4 — Recurring spending exposure

**Logic.** Every recurring monthly cost goes into exactly one bucket.
- **Free to change now.** Monthly plans with no contract.
- **Prepaid.** Yearly plans, free to change in their renewal month.
- **Contract.** Locked until a date.
- **Fixed bills.** Power, water, heating, TV fee. One provider, nothing to switch.
- **Switchable bills.** Phone, internet, insurance. Switchable at contract end.

Output is one line with amounts and the next date each locked bucket opens.

**Inputs.** period, contract, contract end, renewal month, utility flag. All collected.

**Example.** Of €213 a month: €96 free to change now, €12 prepaid (iCloud, renews in May), €45 gym contract until March, €60 fixed bills.

**Confidence.** High, it is a sum of the person's own items.

**Value.** Does not free money by itself. It sets the realistic ceiling, and it is what makes mechanisms 1, 2, 3 and 5 honest about timing. Cheap to build.

---

## Mechanism 5 — Spending optimisation with priorities

**Logic.**
1. Every item has its options from mechanisms 1 to 3, plus pause and cancel.
2. Every option has a **12-month realistic €** (after timing from mechanism 4) and a **loss level** from the person's own answers.
   - **None.** Same service, same features they use (cheaper plan that fits, Duo/Family, yearly billing they'd pay anyway, a duplicate charge).
   - **Wait.** Same services, later (rotation).
   - **Small.** Loses a feature or an overlap they said they can do without.
   - **Real.** Drops something they said they'd miss.
3. Dependencies are respected. Overlap pairs (drop Spotify only if YouTube Premium stays), one rotation per group, one action per item.
4. The engine returns three levels, each the best combination at that level.
   - "Without giving up anything: €X"
   - "If you wait for some shows: €Y"
   - "If you also drop what you said you can live without: €Z"
5. With a monthly target, it returns the lowest level that reaches it, and the gap if none does.

Search size is tiny (a few options per item, under 30 items, dependencies only inside small groups), so exhaustive search per group is fast and fully deterministic.

**Example (Germany, one person, statement).** Netflix Premium €21.99 (1 viewer), Disney+ €9.99 and Paramount+ €7.99 (both sometimes, would miss), two Spotify Individual at home, iCloud+ 2 TB (140 GB used), Audible €9.95 (almost never).
- Without giving up anything: Netflix Standard €72 + Spotify Duo €95.88 + iCloud 200 GB €84 = **€251.88**.
- If you wait for some shows: rotate Disney+ and Paramount+ (6 months each) +€107.88 = **€359.76**.
- If you also drop what you can live without: Audible +€119.40 = **€479.16**.

The first line is what makes the product different. It is money nobody has to give anything up for, and it can't be seen on a bank statement.

**Confidence.** As strong as the weakest price in the combination. Each line lists its parts, so a doubtful part can be removed.

**Without paid services.** Yes. Pure computation over mechanisms 1 to 4.

---

## Value vs cost

| Mechanism | Value to the person | Data ready | Build cost | Verdict |
|---|---|---|---|---|
| 1 Plan optimisation | high, money with no loss | mostly, needs feature tags + 2 conditional taps | medium | **MVP** |
| 2 Rotation | high, largest € for streaming | yes, billing day on tap path | low | **MVP** |
| 3 Cost of use | medium, memberships only | yes | low | **MVP (fix + timing)** |
| 4 Exposure | medium on its own, essential for honesty | yes | low | **MVP** |
| 5 Optimisation | very high, the headline | depends on 1 to 4 | medium | **MVP, last step** |
| Telecom and insurance alternatives | high | no, needs research per country | high | later |
| Streaming cost per hour | low, needs real usage counts | no | — | do not build |

## Strongest MVP

1. Mechanism 4 (timing for everything).
2. Mechanism 3 fix.
3. Mechanism 2 as a first-class action with dates.
4. Mechanism 1 for Netflix, Spotify, YouTube Premium, Disney+, HBO Max, iCloud+, Deezer (plans already researched), plus feature tags.
5. Mechanism 5 with the three levels on top of the result.

New questions, all conditional, each asked only when it unlocks a found opportunity: ads OK? (only if an ad plan is the cheaper fit), storage used (only for cloud above the smallest tier), billing day (only for rotation on the tap path).

## What makes it genuinely useful and different

- **It searches, not sorts.** It starts from verified cheaper ways to have the same thing, not from "do you use it".
- **It protects what you value.** The first number shown is money freed without giving anything up.
- **It is dated.** Every change has the day it can happen and a reminder, so the € is realistic, not theoretical.
- **It shows its work.** Every € lists the plan, price, country and check date it came from.
- **It knows when to stay silent.** No verified alternative, no € figure.
