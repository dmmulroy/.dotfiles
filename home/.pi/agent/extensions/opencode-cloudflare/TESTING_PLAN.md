# OpenCode Cloudflare Extension — Work Laptop Testing Plan

## Goal

Validate the Pi extension against the real Cloudflare-protected gateway from a work laptop that is behind CF WARP.

Primary goals:

- confirm auth works in a real corporate environment
- confirm model discovery works with real gateway config
- confirm request routing works for all four backends:
  - Anthropic
  - OpenAI
  - Google
  - Workers AI
- confirm the auth import path from OpenCode works
- confirm whether native Pi `/login` works as implemented
- capture any failures clearly enough to fix on the next pass

---

## Extension Under Test

Directory:

- `home/.pi/agent/extensions/opencode-cloudflare/`

Key commands exposed by the extension:

- `/opencode-cf-status`
- `/opencode-cf-sync-auth`
- `/opencode-cf-doctor`

Provider under test:

- `opencode.cloudflare.dev`

---

## Important Notes Before Testing

### 1. Do not double-load the extension

If the extension is already installed under `~/.pi/agent/extensions/`, do **not** also pass `-e ./.../opencode-cloudflare`.

Otherwise command conflicts can occur.

Preferred usage on the work laptop:

```sh
pi --list-models opencode.cloudflare.dev
```

Not:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare --list-models opencode.cloudflare.dev
```

### 2. Do not paste tokens into notes or chat

When checking auth files or env vars:

- verify presence only
- do not copy full token values

### 3. Expect two especially important unknowns

These are the main behaviors to validate on the work laptop:

1. whether native Pi `/login` correctly acquires a usable CF Access token
2. whether routed backend requests succeed as currently implemented

If either fails, capture the exact command and error output.

---

## Prerequisites

Confirm all of the following first:

- work laptop is connected behind CF WARP
- `cloudflared` is installed and on `PATH`
- `opencode` is installed
- `pi` is installed
- the extension files are present under:
  - `~/.pi/agent/extensions/opencode-cloudflare/`
- internet access to:
  - `https://opencode.cloudflare.dev/.well-known/opencode`

Recommended version snapshot to record at the start:

```sh
pi --version
opencode --version
cloudflared --version
```

Optional environment sanity check:

```sh
which pi
which opencode
which cloudflared
```

---

## Preflight Checks

### A. Confirm the gateway metadata is reachable

```sh
curl -fsSL https://opencode.cloudflare.dev/.well-known/opencode | jq .auth,.config.enabled_providers
```

Expected:

- request succeeds
- `auth.command` is present
- enabled providers include:
  - `anthropic`
  - `openai`
  - `google`
  - `workers-ai`

### B. Confirm Pi sees the extension

```sh
pi --list-models opencode.cloudflare.dev
```

Possible outcomes:

- if auth is already available, models should be listed
- if auth is not available, provider may be absent or empty

### C. Run extension status/doctor commands

Inside Pi:

```text
/opencode-cf-status
/opencode-cf-doctor
```

Record:

- whether Pi auth is present or missing
- whether OpenCode auth import is found
- whether `cloudflared` is detected
- catalog counts shown by the extension

---

## Test Matrix

Run the scenarios in this order.

---

## Scenario 1 — OpenCode auth import path

This is the most realistic path and should be tested first.

### Step 1: login through OpenCode

```sh
opencode auth login https://opencode.cloudflare.dev
```

Expected:

- browser-based Cloudflare Access flow completes
- OpenCode stores a `wellknown` record in:
  - `~/.local/share/opencode/auth.json`

### Step 2: verify the auth file entry exists

Presence-only check:

```sh
jq 'keys' ~/.local/share/opencode/auth.json
jq 'to_entries[] | select(.key | contains("opencode.cloudflare.dev")) | {key: .key, type: .value.type, token_present: (.value.token != null)}' ~/.local/share/opencode/auth.json
```

Expected:

- a key for `https://opencode.cloudflare.dev` exists
- `type` is `wellknown`
- token is present

### Step 3: sync imported auth into Pi

Inside Pi:

```text
/opencode-cf-sync-auth
```

Expected:

- success notification
- extension reloads cleanly

### Step 4: verify provider visibility in Pi

```sh
pi --list-models opencode.cloudflare.dev
```

Expected:

- provider appears
- Anthropic / OpenAI / Google / Workers AI models are listed

### Step 5: record extension status

Inside Pi:

```text
/opencode-cf-status
```

Expected:

- Pi auth present
- OpenCode auth file present
- imported token detected

---

## Scenario 2 — Native Pi `/login`

This should be tested separately from OpenCode auth import.

### Setup

Before testing, either:

- remove the Pi-stored provider credential for `opencode.cloudflare.dev`, or
- use a fresh test environment if easier

Do **not** delete working OpenCode auth unless intentionally testing from scratch.

### Step 1: run native login

Inside Pi:

```text
/login
```

Choose:

- `OpenCode Cloudflare`

Expected success path:

- Pi presents auth instructions
- browser-based Cloudflare Access flow completes
- Pi stores usable credentials for `opencode.cloudflare.dev`

### Step 2: verify model discovery after login

```sh
pi --list-models opencode.cloudflare.dev
```

Expected:

- provider appears with models

### Step 3: verify status

Inside Pi:

```text
/opencode-cf-status
```

Expected:

- Pi auth present

### If native login fails

Capture:

- the exact terminal output
- whether `cloudflared` opened a browser
- whether `cloudflared` printed a token, a URL, or plain status text
- whether Pi stored anything unusable

This is a high-priority validation item.

---

## Scenario 3 — Backend canaries

After auth is working, run one minimal canary per backend.

Use prompts with deterministic output:

- `Reply with exactly: ok`

### A. Workers AI

```sh
pi -p --provider opencode.cloudflare.dev --model @cf/moonshotai/kimi-k2.5 "Reply with exactly: ok"
```

Expected:

- returns `ok`

### B. OpenAI

```sh
pi -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Expected:

- returns `ok`

### C. Anthropic

```sh
pi -p --provider opencode.cloudflare.dev --model claude-sonnet-4-5 "Reply with exactly: ok"
```

Expected:

- returns `ok`

### D. Google

```sh
pi -p --provider opencode.cloudflare.dev --model gemini-2.5-flash "Reply with exactly: ok"
```

Expected:

- returns `ok`

### For every failure, capture

- exact command
- full error text
- whether failure is auth-related, model-related, or transport-related
- whether the same backend works in OpenCode itself

---

## Scenario 4 — Compare with OpenCode behavior directly

For any backend that fails in Pi, compare against OpenCode.

Examples:

```sh
opencode models openai
opencode models anthropic
opencode models google
opencode models workers-ai
```

If OpenCode can target the same routed backend successfully while Pi cannot, note that explicitly.

This comparison is important because the extension is trying to emulate OpenCode’s gateway behavior.

---

## Scenario 5 — Catalog validation

This checks whether the extension is over-advertising models.

### Step 1: inspect Pi’s exposed catalog

```sh
pi --list-models opencode.cloudflare.dev
```

### Step 2: compare with OpenCode-visible providers

With OpenCode auth present, inspect the built-in providers it exposes:

```sh
opencode models anthropic
opencode models openai
opencode models google
opencode models workers-ai
```

### Record

- models available in Pi but not obviously available in OpenCode
- models available in OpenCode but missing in Pi
- any backend where Pi exposes a clearly too-large model set

This is especially important for:

- Anthropic
- Google

---

## Scenario 6 — Negative tests

These verify error handling.

### A. Missing auth

Run with no Pi auth, no env override, and no importable OpenCode auth.

```sh
pi --list-models opencode.cloudflare.dev
```

and

```sh
pi -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Expected:

- clear guidance to run `/login opencode.cloudflare.dev`
- or clear guidance to run `opencode auth login https://opencode.cloudflare.dev`

### B. Invalid env override

```sh
OPENCODE_CLOUDFLARE_TOKEN=invalid pi -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Expected:

- clear auth rejection
- no crash

### C. Reload after refreshing OpenCode auth

1. refresh OpenCode auth externally:

```sh
opencode auth login https://opencode.cloudflare.dev
```

2. then in Pi:

```text
/reload
/opencode-cf-status
```

Expected:

- extension picks up the refreshed auth state

---

## Scenario 7 — Lightweight functional checks beyond canaries

Only do these if the basic canaries pass.

### A. Simple multi-turn continuity

- ask one question
- ask a follow-up referring to the previous answer

Expected:

- model preserves context

### B. Tool-calling sanity check

Use a simple task that should trigger a tool call in Pi, for example asking it to read a file.

Expected:

- routed backend still handles tool-use flow correctly

### C. Image-capable model sanity check

If convenient, test one image-capable model with a tiny image input.

Expected:

- request is accepted
- no unexpected transport-format error

---

## Results Template

Use this table while testing.

| Area | Command / Flow | Result | Notes |
|---|---|---|---|
| Preflight | `.well-known/opencode` fetch | pass/fail | |
| OpenCode auth login | `opencode auth login ...` | pass/fail | |
| Pi auth sync | `/opencode-cf-sync-auth` | pass/fail | |
| Pi native login | `/login` | pass/fail | |
| Model listing | `pi --list-models opencode.cloudflare.dev` | pass/fail | |
| Workers AI canary | `@cf/moonshotai/kimi-k2.5` | pass/fail | |
| OpenAI canary | `gpt-4o` | pass/fail | |
| Anthropic canary | `claude-sonnet-4-5` | pass/fail | |
| Google canary | `gemini-2.5-flash` | pass/fail | |
| Missing-auth error path | no auth present | pass/fail | |
| Invalid-token error path | env override invalid | pass/fail | |
| Catalog parity | compare vs OpenCode | pass/fail | |

---

## Acceptance Criteria

The extension is ready for the next polish/fix pass if all of these are true:

- OpenCode auth import works reliably
- Pi can list models after auth is available
- at least one canary succeeds for each backend
- errors are actionable when auth is missing or invalid
- no obvious model catalog mismatch causes user confusion

If native Pi `/login` fails but OpenCode auth import works, that is still useful progress, but native login should remain flagged for follow-up.

---

## Most Important Artifacts To Save

If something fails, save:

- the exact command run
- the exact stderr/stdout
- whether auth came from:
  - Pi login
  - OpenCode import
  - env override
- which model/backend failed
- whether OpenCode succeeds on the same routed backend

That should be enough to resume implementation cleanly on the next pass.

---

## Resume Checklist For Next Session

When resuming on the work laptop:

1. copy/sync the latest extension directory
2. verify it is auto-discovered by Pi
3. run the preflight steps above
4. test OpenCode auth import first
5. test native Pi `/login` second
6. run one canary per backend
7. collect failures before making further code changes
