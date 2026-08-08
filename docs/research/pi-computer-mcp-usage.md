# Pi Computer MCP usage

## Executive summary

Across a snapshot of **2,294 JSONL files (2.8 GiB)** under `~/.pi/agent/sessions`, only **27 files** contain actual Computer operations; one is a copied/forked event stream, leaving **26 distinct streams**. After deduplicating copied tool-call IDs, there are **1,147 operational calls**: **1,146 through the MCP gateway** and one older direct `computer_actions` call. By contrast, 519 files contain the word `computer`; therefore **492 are mention/context-only**, not evidence of use.

Actual MCP usage is concentrated between **2026-07-08 and 2026-08-08** (the lone legacy direct call is from 2026-04-26). It is predominantly accessibility-driven browser automation in **Helium**, with two other major patterns: configuring/testing APIs in **Yaak** and inspecting/changing operational dashboards. Usage is bursty: the five largest streams account for **544 calls (47%)**, and the ten largest for **862 (75%)**.

The dominant costs are not rare hard failures but long, serial accessibility traces: repeated full app-state responses, index-based clicking, and keyboard fallback. There are **43 unique explicitly error-flagged calls (~3.8%)**, plus at least one tool-not-found response not flagged as an error. Recovery is usually immediate and successful, but several sessions retry the same unsuitable interaction multiple times.

## What counts as actual usage

The scan classified records as follows:

- **Operational call:** an assistant `toolCall` named `mcp` whose `arguments.tool` begins with `open-computer-use_` or `computer_`. The one historical direct `computer_actions` call is reported separately.
- **Discovery/control:** `mcp` calls using `search`, `describe`, or `connect` with a Computer-related target. These are real gateway calls but **not UI operations**.
- **Mere mention/context:** arbitrary text containing “computer,” including user requests, assistant prose, fetched content, and tool/system descriptions.
- Results were joined to calls by `(session file, toolCallId)`. Tool-call IDs appearing in copied/forked JSONLs were counted once.

This produced **144 discovery/control calls**—103 `describe`, 33 `search`, and 8 `connect`—in addition to the 1,146 MCP operations. Representative sequences were reconstructed in JSONL order around calls and results rather than inferred from grep counts.

## Where and how it is used

### Operation mix

| Operation family | Calls | Share |
|---|---:|---:|
| `click` | 489 | 42.6% |
| `get_app_state` | 301 | 26.2% |
| `press_key` | 177 | 15.4% |
| `set_value` | 127 | 11.1% |
| `type_text` | 21 | 1.8% |
| `list_apps` | 14 | 1.2% |
| `computer_execute` | 10 | 0.9% |
| scroll, drag, state/legacy batch | 8 | 0.7% |

Among calls with an explicit app identifier, normalized targets were **Helium 818 (74%)**, **Yaak 250 (23%)**, **Google Chrome 33 (3%)**, and only isolated calls to Google Chat, Spotify, and Safari. App naming is inconsistent (`Helium` vs bundle ID; `Yaak` vs bundle ID), which contributes to avoidable argument and discovery work.

### Common workflows

1. **Browser navigation and form completion.** Typical sequence: discover/connect → list apps → inspect state → set browser address field → Return → inspect/click through page controls. This includes authenticated financial sites, expense workflows, and live administrative UIs. A browser investigation used `global` coordinate clicking, failed because the fallback was disabled, then immediately recovered with `click_method: "auto"` [S02, 2026-08-02 22:55:41–22:56:03Z].
2. **Operational dashboard inspection and editing.** Multiple long traces inspect metrics, reconcile dashboard configuration, or change cloud settings. Two dashboard streams alone contain 87 and 84 calls [S03, 2026-07-13 18:17–19:31Z; S04, 2026-07-15 22:53–23:29Z]. These often combine repository/API investigation with UI verification rather than using Computer alone.
3. **Desktop API-client setup.** Yaak workspace/import/environment configuration creates the largest single trace: **174 calls in 32 minutes**, including 95 clicks, 39 key presses, and 25 value sets [S01, 2026-07-29 12:08–12:40Z]. A later similar setup adds another large trace [S08, 2026-08-08 13:58–14:18Z].
4. **Financial-site observation and reconciliation support.** Computer is used for authenticated statement review, account navigation, and building reusable UI field guides, while structured mutations/reads are attempted through other tools. Several dedicated streams contribute 41–120 calls each [S02/S06, 2026-08-02–03].
5. **Visual validation after deterministic changes.** In cloud/dashboard work, APIs or CLI perform the change and Computer checks the resulting UI. This is generally the strongest use: UI automation is reserved for state only visible in an authenticated application [S05, 2026-07-13 17:40–17:57Z].

### Interaction pattern

The traces are strongly serial. Frequent adjacent transitions include `click→click` (about 200), `get_app_state→click` (about 170), and `click→get_app_state` (about 160). All 14 `list_apps` calls are effectively startup/recovery probes. Most successful action results themselves include a large accessibility tree, yet explicit `get_app_state` still constitutes over a quarter of all operations. This creates substantial duplicated output and makes element indices vulnerable to changing between steps.

## Failures and recovery behavior

### Common failures

- **Focus/settable mismatch:** `type_text` repeatedly reports that no editable field is focused; `set_value` reports non-settable accessibility elements. In the longest Yaak trace, three `type_text` attempts fail within about a minute before `set_value` succeeds [S01, 12:14:55–12:15:15Z], with additional repetitions later.
- **Gateway argument construction:** missing `app`, malformed JSON strings, passing an object where the gateway requires a JSON string, and a click with neither index nor coordinates. The object/string error is corrected by replaying the same click four seconds later [S01, 12:17:39–12:17:43Z].
- **Window/app identity failures:** `appNotFound`, `cgWindowNotFound`, and inconsistent display-name/bundle-ID use. One stream repeats `cgWindowNotFound` six times in roughly 24 seconds before changing approach [S11, 2026-07-30 16:59:54–17:00:18Z].
- **Keyboard incompatibility:** unsupported key names/combinations and one attempt to send spaced text as a key chord.
- **Permissions/lifecycle:** the first modern session hits missing Accessibility permission, then a closed MCP connection; after permission/restart intervention, normal navigation resumes [S09, 2026-07-08 15:23–15:31Z].
- **Catalog/config drift:** after changing the server implementation, the old catalog remains active until config/reload issues are corrected. A nonexistent `computer_get_state` also returns a tool-not-found message without the result being marked as an error [S08, 2026-08-08 14:08Z].
- **Batch/code-mode output limits:** an experiment replacing nine tools with `computer_execute` makes 10 calls; five fail with `capability_output_limit`, including action calls whose intermediate accessibility output exceeds limits. The session alternates smaller probes with retries, then explicitly reverts to regular Computer MCP [S10, 2026-08-03 12:23:56–12:25:38Z].

### Recovery patterns

Recovery is generally local and pragmatic:

- fix serialization/required arguments and replay immediately;
- change unsafe/global click to `auto`;
- refetch state after a failed/stale element interaction;
- switch from `type_text` to `set_value`, or click/focus before typing;
- run app discovery or vary display name/bundle ID after app/window failures;
- reload/reconnect after permission or catalog changes;
- abandon an unsuccessful batching abstraction and restore the known server.

The weak pattern is **repetition without changing the precondition**: repeated typing into an unfocused field and repeated queries against a missing window. Those retries account for a meaningful portion of the avoidable errors despite the low aggregate error rate.

## Concrete optimization opportunities

1. **Return compact action results by default.** `click`, `press_key`, and `set_value` commonly return a full accessibility tree. Return only status, focused element, window identity, and a small changed-state excerpt; require an explicit state call for the full tree. This should reduce token volume more than reducing call count alone.
2. **Add stable semantic targeting.** Support role/name/label selectors (with ambiguity errors) rather than only ephemeral element indices. The current index-heavy model drives the `state→click→state` loop and click storms.
3. **Make text entry one robust operation.** A `fill` operation should focus the target, verify editability, choose accessibility value-setting first, fall back to typing, and report which path succeeded. This directly addresses the repeated `type_text`/`set_value` failures.
4. **Validate at the MCP gateway boundary.** Generate/retain typed wrappers that always serialize `args`, require `app`, normalize key names, and reject unsupported click modes before dispatch. The malformed-JSON, missing-app, unsupported-key, and object-vs-string failures are preventable client-side.
5. **Normalize app identity once.** Resolve display name and bundle ID during `list_apps`, return a canonical app handle, and use that handle throughout the session. Invalidate it only when PID/window lifecycle changes.
6. **Cache discovery schemas.** The 144 search/describe/connect calls are **13% as many as operational calls**. Stable server schemas should be loaded once per connection and invalidated on reconnect/version change, not repeatedly searched or described.
7. **Provide purpose-built browser primitives.** `navigate(url)`, tab selection, download/upload, and DOM-backed `fill/click` would replace address-bar key sequences and fragile browser accessibility indices. Use domain APIs/CLI for dashboard configuration and structured data; reserve Computer for auth-bound or genuinely visual steps.
8. **Fix batching before reintroducing it.** `computer_execute` needs suppression/truncation of intermediate capability output, independent output budgets per action, and compact return values. A single navigation transaction should be able to perform state lookup → focus/fill → submit → bounded verification without overflowing.
9. **Use bounded retry policy with diagnosis.** After one focus failure, inspect/focus or switch method; after one `cgWindowNotFound`, relist apps/windows; after a catalog miss, reconnect/reload once. Do not repeat an identical call against unchanged state.
10. **Instrument outcomes consistently.** Tool-not-found should set `isError: true`. Record normalized failure codes, latency, returned bytes/tree nodes, retry linkage, and whether an action changed window/focus. This would make future usage analysis cheaper and distinguish productive retries from loops.

## Reproducible methodology

Snapshot queries were run locally; no external source was needed.

```bash
find ~/.pi/agent/sessions -type f -name '*.jsonl' | wc -l
# 2294

du -sh ~/.pi/agent/sessions
# 2.8G

rg -l -i computer ~/.pi/agent/sessions -g '*.jsonl' | wc -l
# 519 files containing the token, not necessarily calls
```

The structured scan streamed every JSONL record and, for assistant `content[]` entries with `type == "toolCall"`, applied:

```python
actual = (
    call_name == "mcp"
    and re.match(r"^(open-computer-use_|computer_)", arguments.get("tool", ""))
)
discovery = call_name == "mcp" and any(
    "computer" in str(arguments.get(k, "")).lower()
    for k in ("search", "describe", "connect")
)
```

Nested MCP `args` were JSON-decoded only for operation/app aggregation; values, typed text, URLs, screenshots, and code were not copied into this report. Results were joined by tool-call ID, duplicates across forked logs were removed, and representative sequences included neighboring user/assistant/result records. Counts may differ slightly in a future rerun because session JSONLs are append-only and active sessions can continue growing.

## Anonymized evidence index

- **S01** — session starting 2026-07-29 12:07Z; Yaak setup; calls observed 12:08–12:40Z.
- **S02** — session starting 2026-08-02 22:40Z; authenticated browser/reconciliation investigation; calls 22:42–23:47Z.
- **S03** — session starting 2026-07-13 17:51Z; metrics/dashboard inspection; calls 18:17–19:31Z.
- **S04** — session starting 2026-07-15 22:46Z; dashboard reconciliation; calls 22:53–23:29Z.
- **S05** — session starting 2026-07-13 17:23Z; cloud dashboard verification; calls 17:40–17:57Z.
- **S06** — session starting 2026-08-03 00:14Z; financial-site field-guide work; calls 00:17–00:29Z.
- **S07** — session starting 2026-07-08 19:45Z; browser form/expense workflow; calls 19:57–20:09Z.
- **S08** — session starting 2026-08-05 13:51Z; later Yaak setup; cited calls on 2026-08-08 13:58–14:18Z.
- **S09** — session starting 2026-07-08 15:21Z; initial permission/reconnect recovery; calls 15:23–15:31Z.
- **S10** — session starting 2026-08-02 21:17Z; code-mode experiment; cited calls on 2026-08-03 12:23–12:25Z.
- **S11** — session starting 2026-07-30 16:52Z; stale/missing-window recovery; cited calls 16:59–17:00Z.
