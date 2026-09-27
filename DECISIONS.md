# Decisions

Ambiguities resolved while building, per the brief's instruction to pick the simplest reading and write it down. Each can be revisited.

## Engine — scoring (section 7)

1. **`Item` extended with `compareState` and `yearlyPrice`.** Rules 7 (bill "when did you last compare offers?") and 8 (switch to a known cheaper yearly price) need fields the §5 type didn't spell out. Added:
   - `compareState?: 'thisYear' | 'overAYear' | 'never'`
   - `yearlyPrice?: number` (from the merchant map, same currency).
2. **`Audit` extended with `paywall`, `goodShape`, `currency`.** The §7 paywall gate and the "good shape / nothing to pay" branch are audit-level facts, so the engine computes them once rather than leaving the UI to re-derive them.
3. **Duplicate detection (rule 2) requires a known `merchantKey`.** Only items normalized to a known merchant can be "the same service charged twice". Manual/cash items with generic names never dup-group, which avoids false positives (e.g. two hand-typed "Some Service" rows). A unit test drove this out.
4. **Duplicate primary = the most-used charge; ties keep the first in list order.** The extra charge(s) get `familyPlan`, saving = the extra's yearly cost, matching "saving = yearly cost of the second charge".
5. **Rule 3 overlap groups = music, cloud, ai only.** The brief lists exactly those three for rule 3; video is handled by rule 4. So `video` items never trigger `removeOverlap` — only `rotate`, and only when 2+ are watched "sometimes".
6. **Kept item in a group = most used; ties go to the cheaper one** (lower yearly cost), for both rule 3 and rule 4, per "ties go to the cheaper one".
7. **Paywall threshold = 10 units of the display currency.** The brief says "at least €10"; applied in whatever the display currency is (not converted to EUR), since the whole audit runs in one display currency.
8. **`rotate` saving = monthly price × 4** (four months paused), the item's per-month price regardless of billing frequency mismatch (video is billed monthly in practice).
9. **All money rounded to 2 decimals** at each computed value to avoid floating-point drift in totals and in displayed savings.
10. **Rule precedence is strict first-match.** Rule 1 (clearly unused → cancel) wins over overlap/rotate/etc., so an "almost never" item inside an overlap group is cancelled, not down-graded to `removeOverlap`. Covered by a test.

## Project setup

11. **Project lives in `~/Desktop/startup/enough`**, its own folder, so it doesn't mix with the other projects in `~/Desktop/startup`.
12. **Vite + React + TS scaffolded by hand** (no `create-vite`) to avoid an interactive generator. Vitest runs the engine tests in the `node` environment (engine is pure, no DOM).
13. **Fixtures copied to `/fixtures`** from the founder-supplied `enough-fixtures.zip` (modeled + synthetic set, with `expected/*.json`). Real bank exports are still pending per §14.

## Open / not yet built

- Section 6 (import, redaction, recurring detection) — not started. This is where the `/fixtures` `expected/*.json` contract gets exercised, and where the "never leaves the device" redaction test lives. Planned next.
- Manual audit flow UI (screens 2B, 5, 6, 7, 8, 9, 10) with a fake unlock button — not started.
- The `expected/*.json` "price" field is sometimes a sentence for bills ("average, varies 24.10–27.80"), so the fixture comparison in M2 must assert frequency + averaging for bills, not exact price.
- Ambiguous-date file must return an explicit "ask dd/mm or mm/dd" state, not a silent guess (M2).
