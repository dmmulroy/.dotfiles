# Examples

Full loop iterations showing the Sense → Hypothesize → Change → Measure → Decide cycle.

## Debugging: Auth test failure

**Discovery**: `cat package.json | jq '.scripts'` reveals `"test": "vitest"`. Run `npm test -- auth`.

**Iteration 1** (wrong hypothesis)

- **Sense**: `npm test -- user-login` → `TypeError: Cannot read property 'token' of undefined` at `auth.js:42`
- **Hypothesize**: `getUser()` returns null when session expired; line 42 doesn't guard for null
- **Change**: Add null check: `if (!user) return { error: 'session_expired' }`
- **Measure**: `npm test -- user-login` → FAIL: expected status 200, got 401
- **Decide**: Null check is correct defensively but test expects success. Hypothesis incomplete — something upstream is wrong.

**Iteration 2** (refined hypothesis)

- **Sense**: Read test fixture — uses hardcoded token with `exp: 1700000000` (expired)
- **Hypothesize**: Fixture token is expired; `getUser()` rejects it before reaching the null path
- **Change**: Update fixture to use `exp: 9999999999` (far future)
- **Measure**: `npm test -- user-login` → PASS
- **Decide**: Keep both changes. Null check is valid hardening, fixture was the root cause. Exit — expected matches observed.

**Artifacts produced**: repro `npm test -- user-login`, fixture diff, auth.js guard addition.

---

## UI/Visual: Button alignment with agent-browser

**Discovery**: `package.json` has `"dev": "next dev"`. Start dev server: `npm run dev` (or use tmux pane).

**Iteration 1** (wrong layer)

- **Sense**: `agent-browser open http://localhost:3000/settings` then `agent-browser snapshot -i`
  ```
  - heading "Settings" [ref=e1]
  - button "Save" [ref=e2]
  - button "Cancel" [ref=e3]
  ```
  User reports "Save button should be right-aligned, it's centered."
  `agent-browser screenshot before.png` — saved for human reference.
- **Hypothesize**: Button container is using `justify-content: center` instead of `flex-end`
- **Change**: In `SettingsFooter.tsx`, change `justify-center` to `justify-end`
- **Measure**: `agent-browser reload && agent-browser snapshot -i` — snapshot structure unchanged (buttons still present). `agent-browser screenshot after-1.png`.
  Check computed text: `agent-browser get text @e2` → "Save" (still renders).
  But `agent-browser snapshot -i --json` shows same element order — can't confirm alignment from text alone.
- **Decide**: Structural snapshot can't validate spatial layout. Escalate to human: "Changed justify-center → justify-end in SettingsFooter.tsx. Screenshots at before.png and after-1.png — please confirm alignment."

**Iteration 2** (human confirmed, but secondary issue)

- **Sense**: Human confirms alignment fixed but notes "Cancel button lost its outline style."
- **Hypothesize**: The Tailwind class change affected a sibling style via parent flex gap
- **Change**: Add explicit `border border-gray-300` to Cancel button
- **Measure**: `agent-browser reload && agent-browser snapshot -i && agent-browser screenshot after-2.png`
  Snapshot shows both buttons present. Escalate screenshot for visual confirmation.
- **Decide**: Human confirms. Exit — both issues resolved.

**Artifacts produced**: repro URL `localhost:3000/settings`, 3 screenshots, snapshot diffs, component changes.

---

## Data Pipeline: ETL conversion rate drift

**Discovery**: `ls scripts/` and `cat Makefile` reveal `make etl-run DATE=YYYY-MM-DD SAMPLE=1pct`.

**Iteration 1** (correct hypothesis)

- **Sense**: `make etl-run DATE=2026-02-01 SAMPLE=1pct` then `psql -c "SELECT AVG(conversion_rate) FROM daily_metrics WHERE date='2026-02-01'"` → 0.7 (expected: 1.2-1.4)
- **Hypothesize**: Recent schema migration added a `status` column; the conversion query doesn't filter for `status='completed'`, so pending/cancelled rows dilute the rate
- **Change**: Add `WHERE status = 'completed'` to the conversion rate calculation in `transforms/conversion.sql`
- **Measure**: Re-run `make etl-run DATE=2026-02-01 SAMPLE=1pct` then query → 1.31
- **Decide**: 1.31 is within expected 1.2-1.4 bounds. But verify it's not just the sample — run full date range.

**Iteration 2** (validation pass)

- **Sense**: `make etl-run DATE=2026-01-15 SAMPLE=1pct` → query returns 1.28. `DATE=2026-01-01` → 1.35. Both within bounds.
- **Hypothesize**: Fix is correct across date ranges
- **Change**: None — validating
- **Measure**: All three dates within bounds
- **Decide**: Keep. Exit — fix validated across multiple inputs.

**Artifacts produced**: repro `make etl-run DATE=X SAMPLE=1pct`, SQL query, before/after metrics for 3 dates.

---

## Debugging with tmux watcher

**Setup**: Agent has `tsc --watch` running in tmux pane 1.

**Iteration 1**

- **Sense**: `tmux capture-pane -p -J -t session:0.1 -S -20` shows:
  ```
  src/api/handler.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'UserId'
  Found 1 error. Watching for file changes.
  ```
- **Hypothesize**: `handler.ts:42` passes raw string where branded `UserId` type expected
- **Change**: Wrap with constructor: `UserId.parse(rawId)` at line 42
- **Measure**: Watch pane output (wait 2s for recompile): `tmux capture-pane -p -J -t session:0.1 -S -5` → `Found 0 errors. Watching for file changes.`
- **Decide**: Keep. Exit — type error resolved, watcher confirms clean build.

**Artifacts produced**: repro `tsc --watch`, error message, single-line fix.
