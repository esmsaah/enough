# Instructions for coding agents (Codex, Claude Code, others)

This project is Enough, a one-time subscription audit web app.

## Before any change
1. Read ENOUGH_BRIEF.md fully. It is the spec. Follow it. Do not add features outside it; park ideas in LATER.md.
2. Read DECISIONS.md. It records every decision already made. Do not undo a decision silently.
3. Run `git pull` and check `git log --oneline -10` to see what the previous agent did.

## While working
- Only one agent works on this repo at a time.
- The engine (src/engine) stays pure TypeScript with no UI or browser code, and every rule has a unit test.
- Statement data must never leave the device. No network calls during parsing. See brief section 11.
- Use the test statements in /fixtures and their expected results in /fixtures/expected.

## Before finishing
1. Run `npm test` and `npx tsc -b --noEmit`. Both must pass.
2. Add any new decision to DECISIONS.md (numbered, one short paragraph).
3. Commit with a clear message and `git push`.
