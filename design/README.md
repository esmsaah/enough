# Enough · V1 design

Source of truth for the UI. Exported from the Claude Design canvas.
Open any `.dc.html` file in a browser to see the screen (support.js is not included, layout and styles are inline, so read the markup directly).

## Mobile (390px)
Main (landing), QuickStart, Upload, WhatWeKeep, FoundItems, Usage, Result, GoodShape, CutList, EmailShare

## Desktop (1440px)
LandingDesktop, DeskQuickStart, DeskUpload, DeskKeep, DeskFound, DeskUsage, DeskResult, DeskGoodShape, DeskCutList, DeskEmailShare

## Shared
Foundations (tokens, type, components), States (empty, error, loading), EmailReport, EmailReminder, ShareCards, DesignNotes, canvas.json (board layout)

## Outdated, follow ENOUGH_BRIEF.md instead
- WhatIsThis, DeskWhatIs. Category chips sit inline on Found items, no separate screen.
- Cash, DeskCash. Replaced by one optional "Anything else?" screen (cash and anything missed).
- Result and CutList show one list. The brief wants three sections. Subscriptions (with verdicts), Bills (compare offers), Spending by category (totals only), plus streaming rotation plan and price increases. Reuse the same visual language.

## Rules
- Breakpoint 900px. Below is mobile layout, above is desktop.
- Desktop step screens. Content left, receipt on the right that fills up.
- Result, Good shape, Cut list open with a full-width navy band.
- Buttons are not full width on desktop.
- Where design and brief disagree, the brief wins.

## Copy fixes on LandingDesktop
- Tagline is "A financial audit that works for you" (same as mobile Main), not "A subscription audit you pay for once".
- Privacy line on desktop says "removed on your device", not "on your phone".
- Remove "Works best on your phone" line. Desktop is a full experience.
- Founder name stays a placeholder until launch.
