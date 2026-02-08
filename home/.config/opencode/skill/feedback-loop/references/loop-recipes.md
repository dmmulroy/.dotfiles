# Loop Recipes

Steps, tooling, artifacts, and checklists for each loop type.

## Debugging

Use for: failing tests, errors, type errors, regressions, build failures, incorrect outputs.

### Steps

1. Capture repro command and failing signal (error message, stack trace, test name)
2. Reduce to minimal failing case — remove unrelated code/tests until smallest repro remains
3. Add targeted logs or assertions at the suspected failure point
4. Apply smallest fix that addresses the hypothesis
5. Re-run repro and record result — compare against expected output

### Tooling

| Tool | Use for | Command pattern |
|---|---|---|
| Test runner | Unit/integration failures | `npm test -- <filter>`, `pytest -k <filter>`, `cargo test <name>` |
| Build | Type/compile errors | `tsc --noEmit`, `cargo check`, `go build ./...` |
| Linter | Style/lint failures | `npm run lint`, `cargo clippy` |
| tmux watcher | Continuous feedback | `tmux capture-pane -p -J -t {pane} -S -50` from test/build watcher pane |

### Flaky repros

If the test passes intermittently:

- Pin randomness: `--seed`, `Math.seedrandom`, fixed UUIDs in fixtures
- Freeze time: mock `Date.now()`, use `faketime`, fixed timestamps in test data
- Mock network/external deps: stub HTTP, use test doubles
- Run N times: `for i in $(seq 10); do npm test -- auth || echo "FAIL $i"; done`
- Isolate: run the single test alone, reduce concurrency

### Required Artifacts

- Repro command (exact, copy-pasteable)
- Failing signal (error message, test name, stack trace)
- Expected vs observed output

### Checklist

- [ ] Repro command exists and is deterministic
- [ ] Failing signal captured (error, stack, test name)
- [ ] Minimal failing case identified
- [ ] Fix is smallest possible change
- [ ] Repro now passes

---

## UI/Visual

Use for: layout issues, animation bugs, rendering regressions, visual inconsistencies.

### Primary tool: `npx agent-browser`

[agent-browser](https://github.com/vercel-labs/agent-browser) is a headless browser CLI built for AI agents. 93% less context than Playwright MCP — uses accessibility tree snapshots + element refs instead of DOM.

### Steps

1. Start dev server (or use tmux watcher pane)
2. Open page: `agent-browser open http://localhost:3000/path`
3. Snapshot interactive elements: `agent-browser snapshot -i`
4. Identify the issue via snapshot text or `agent-browser screenshot before.png`
5. Apply smallest CSS/markup change
6. Reload and re-validate: `agent-browser reload && agent-browser snapshot -i`

### Tooling

| Tool | Use for | Command pattern |
|---|---|---|
| agent-browser snapshot | Structural validation (text-based, no vision needed) | `agent-browser snapshot -i` or `--json` |
| agent-browser screenshot | Visual capture for human review | `agent-browser screenshot <path>.png` |
| agent-browser assertions | Element state checks | `agent-browser get text @e1`, `agent-browser is visible @e2` |
| agent-browser wait | Page readiness | `agent-browser wait --load networkidle`, `agent-browser wait --text "Ready"` |

### Validation without vision

When the agent cannot evaluate screenshots:

- Use `agent-browser snapshot -i` — text-based accessibility tree shows element hierarchy, roles, names
- Use `agent-browser get text @ref` to check specific content
- Use `agent-browser is visible @ref` / `is checked @ref` for state assertions
- Compare snapshot output before/after code changes (text diff)
- **Escalate to human** with screenshot file path for subjective visual judgment

### Required Artifacts

- Repro URL with all state encoded (route, query params, feature flags)
- `agent-browser snapshot -i` output or screenshot path
- Expected vs observed (text description or diff)

### Checklist

- [ ] Dev server running and page accessible
- [ ] `agent-browser open` succeeds with repro URL
- [ ] Snapshot or screenshot captured (before state)
- [ ] Change is minimal (single CSS property, one element)
- [ ] Post-change snapshot matches expected structure
- [ ] Escalated to human if visual judgment required

---

## Data Pipeline

Use for: ETL jobs, metric drift, data quality issues, validation failures.

### Steps

1. Pin dataset slice or input snapshot (sample data, date range, subset)
2. Run job deterministically with pinned inputs
3. Compare expected vs observed metrics or output
4. Apply smallest change to transform/query/schema
5. Re-run with same pinned inputs and validate

### Tooling

| Tool | Use for | Command pattern |
|---|---|---|
| Job runner | Deterministic execution | `./run_etl --date=X --sample=1pct`, `dbt run --select model` |
| Validation query | Metric comparison | `SELECT COUNT(*), AVG(x) FROM output WHERE ...` |
| Data diff | Row-level comparison | `diff <(query_before) <(query_after)`, `daff` |
| tmux watcher | Long-running jobs | Run job in pane, `capture-pane` to check progress/errors |

### Required Artifacts

- Repro job command with inputs pinned (date, sample, seed)
- Dataset slice or sample (small enough to inspect)
- Metric or validation query with expected bounds

### Checklist

- [ ] Inputs pinned or snapshotted (reproducible)
- [ ] Job runs deterministically with same output each time
- [ ] Metrics or validations captured (before/after)
- [ ] Change is minimal (one transform, one query, one schema field)
- [ ] Metrics within expected bounds after fix
