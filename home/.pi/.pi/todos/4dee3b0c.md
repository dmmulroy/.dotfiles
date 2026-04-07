{
  "id": "4dee3b0c",
  "title": "Investigate and improve Helium disk-cookie fallback for authenticated webfetch",
  "tags": [
    "web-tools",
    "helium",
    "auth",
    "cookies",
    "follow-up"
  ],
  "status": "closed",
  "created_at": "2026-04-07T13:45:07.995Z"
}

# Goal
Improve the **disk-cookie fallback** for authenticated `webfetch` in Pi's `agent/extensions/web-tools/`.

This is a follow-up to the completed Helium profile integration work. The current implementation works well when **Helium is running** because **CDP cookie retrieval works**, but the **on-disk persisted cookie fallback** is only **best-effort** and currently returns **no usable cookies on this machine** for the sampled Helium profile/database.

The next agent should focus on understanding **why disk fallback does not currently produce usable auth cookies**, and improving it without regressing the working CDP path.

---

# Important constraints / product decisions
Carry these forward unless the user explicitly changes them:

- **Do not launch any browser process**, headless or otherwise.
- **Do not create a separate authenticated-fetch/browser-fetch tool.**
- Keep using the existing **`webfetch`** tool.
- If a Helium profile is selected, authenticated fetching is always desired.
- **CDP is preferred** when available.
- **Disk cookies are the fallback** when CDP is unavailable.
- Use only one command for profile selection: **`/web-profile`**.
- Use **footer-only status** (`web: public` / `web: Helium/<name>`), not per-fetch UI annotations.
- No user-facing mode switch like `auto | browser | http`.

---

# What was already implemented
Implemented under `agent/extensions/web-tools/` using RGR TDD slices.

## New files
- `profiles.ts`
- `profile-state.ts`
- `profile-ui.ts`
- `auth.ts`
- `auth-cdp.ts`
- `auth-cookies.ts`

## Modified files
- `index.ts`
- `webfetch.ts`
- `network.ts`
- `types.ts`
- `README.md`

## Tests added/updated
- `test/profiles.test.ts`
- `test/profile-state.test.ts`
- `test/profile-ui.test.ts`
- `test/auth.test.ts`
- `test/auth-cdp.test.ts`
- `test/auth-cookies.test.ts`
- updated `test/network.test.ts`
- updated `test/webfetch.test.ts`

## Current behavior
- `/web-profile` lets the user select `Public web` or a discovered Helium profile.
- Selection is persisted in `~/.pi/agent/extensions/web-tools.json`.
- Footer shows `web: public` or `web: Helium/<display-name>`.
- `webfetch` remains the same tool, but now injects cookies when a Helium profile is active.
- Auth resolution order is:
  1. CDP via `DevToolsActivePort`
  2. on-disk cookies from the selected Helium profile DB
- Redirect handling was improved so request headers can be recomputed per hop.

---

# Current known-good state
These facts were validated locally:

## Tests / checks
- `npm run check --workspace=pi-web-tools-extension` passes.

## Local smoke checks
- Helium profile discovery works.
- Live CDP cookie retrieval works.
- Example smoke result: `getCookiesFromCdp()` returned hundreds of cookies for the local Helium profile.

This means:
- profile discovery is not the main problem
- websocket/CDP connectivity is not the main problem
- the main gap is specifically the **disk-cookie fallback path**

---

# Current caveat to investigate
> Disk-cookie fallback is implemented as best-effort, but on this machine persisted cookie decryption currently yields no usable cookies for the sampled Helium profile/database, so the fallback path may still be limited depending on how Helium encrypted the local cookie store.

In practice, this means:
- authenticated fetches should work while Helium is live and CDP is reachable
- authenticated fetches may fail or become unauthenticated when Helium is closed, because disk fallback is not yet trustworthy

---

# Relevant machine-specific findings gathered so far
Helium appears Chromium-like on this machine.

## Paths
- App: `/Applications/Helium.app`
- User data dir: `~/Library/Application Support/net.imput.helium`
- Local State: `/Users/dmmulroy/Library/Application Support/net.imput.helium/Local State`
- Default cookie DB: `/Users/dmmulroy/Library/Application Support/net.imput.helium/Default/Cookies`
- DevTools marker: `/Users/dmmulroy/Library/Application Support/net.imput.helium/DevToolsActivePort`

## Local State observations
- `profile.info_cache` exists
- current profile discovered: `Default`
- display name discovered: `dillon`

## Cookie DB observations
The `cookies` table exists and includes Chromium-like fields such as:
- `host_key`
- `name`
- `value`
- `encrypted_value`
- `path`
- `expires_utc`
- `is_secure`
- `is_httponly`
- `has_expires`

Observed `encrypted_value` entries begin with hex corresponding to `v10` in many rows.

## CDP observations
- `DevToolsActivePort` existed locally
- browser websocket connection succeeded
- `Browser.getVersion` worked
- `Storage.getCookies` worked
- one smoke run returned ~488 cookies

---

# Existing implementation details to understand before changing anything

## `auth-cdp.ts`
This currently:
- reads `DevToolsActivePort`
- connects to the browser websocket
- calls browser-level CDP (`Storage.getCookies`)
- maps returned cookies into internal `AuthCookie`

This path works locally and should be preserved.

## `auth-cookies.ts`
This currently:
- copies the selected profile's sqlite cookie DB to a temp location
- queries rows from the `cookies` table using `sqlite3 -json`
- uses `value` directly when present
- otherwise attempts decryption of `encrypted_value`
- tries candidate keychain service names:
  - `Helium Safe Storage`
  - `Chromium Safe Storage`
  - `Chrome Safe Storage`
- also tries `mock_password`
- assumes a classic Chromium macOS decryption path based on:
  - `v10` prefix stripping
  - PBKDF2-HMAC-SHA1
  - salt `saltysalt`
  - 1003 iterations
  - 16-byte key
  - AES-128-CBC
  - IV of 16 spaces

This path currently returns zero usable cookies in local smoke testing.

## `auth.ts`
This orchestrates:
- public vs Helium selection
- CDP-first auth resolution
- disk-cookie fallback if CDP fails
- URL-based cookie filtering and header construction

## `network.ts`
This now supports `getHeaders(url)` so auth headers can be recomputed on each redirect hop.

## `webfetch.ts`
This keeps the same external tool API but uses resolved auth to merge cookies into request headers.

---

# Likely root causes to investigate
The most likely causes are:

1. **Wrong keychain service / wrong key derivation for Helium**
   - Helium may not actually use the same safe-storage secret as Chrome.
   - The service label or derivation may differ.

2. **Helium/Electron/Chromium uses a newer cookie encryption scheme**
   - The current implementation assumes a legacy macOS Chromium AES-CBC path.
   - Helium may have moved to a newer format despite `v10`-looking blobs, or may use an Electron-specific provider path.

3. **Disk snapshot / WAL issue**
   - The current code copies only `Cookies`.
   - If recent state is in `Cookies-wal`, the snapshot may be stale/incomplete.

4. **Auth cookies are not actually persisted**
   - CDP may expose live/session cookies that are not meaningfully persisted on disk.
   - In that case, disk fallback can never fully replace CDP for some sites.

5. **Rows are persisted but the decrypted values fail plausibility checks**
   - The decryption logic may be close but not correct.

---

# Recommended next exploration plan
The next agent should likely do this in order.

## 1. Add targeted diagnostics in `auth-cookies.ts`
Before trying speculative fixes, make the fallback observable.

Add internal diagnostics/logging or temporary debug helpers that can answer:
- how many cookie rows exist total
- how many rows have plaintext `value`
- how many rows have `encrypted_value`
- prefix distribution (`v10`, `v11`, etc.)
- how many decrypt attempts succeed/fail
- which candidate keychain service names were found
- for each decryption strategy, whether outputs are valid UTF-8 / plausible cookie values

Goal: convert “returns zero cookies” into a precise failure mode.

## 2. Compare CDP cookies vs disk rows for the same domain
Since CDP works locally, use it as the oracle.

For one or two authenticated domains, compare:
- cookie names from CDP
- cookie names present in sqlite rows for that domain
- whether matching rows have plaintext values, encrypted values, stale values, or no rows

Goal: determine whether disk fallback is failing because cookies are:
- present but undecryptable
- stale
- absent entirely
- not persisted for those auth flows

## 3. Improve sqlite snapshot handling
Investigate whether the fallback should copy/read:
- `Cookies`
- `Cookies-wal`
- `Cookies-shm`

Potentially use a safer sqlite snapshot approach if needed.

Goal: avoid false negatives from stale or incomplete DB copies.

## 4. Verify the real Helium macOS encryption path
Investigate Helium/Electron behavior for this app/version.

Things to look into:
- exact safe-storage / keychain item name used by Helium
- whether bundle/app name affects the keychain secret
- whether Electron's cookie encryption provider differs from classic Chromium assumptions
- whether there are newer Electron/Chromium changes relevant to macOS cookie encryption

Goal: replace guesswork with the actual scheme Helium uses.

## 5. Expand decryption strategy only after diagnostics
Potential follow-up strategies may include:
- additional keychain service names
- alternate derivation variants if Helium differs
- newer cookie format handling if present
- relaxed/adjusted plausibility checks if valid cookies are being dropped

Goal: widen coverage carefully, based on evidence.

## 6. Add regression fixtures once the real format is known
Once a real working disk decryption path is found, add tests with representative encrypted cookie fixtures.

Goal: ensure disk fallback remains reliable over future refactors.

---

# Suggested internal classification to add
Even if user-facing UX remains unchanged, it may help to internally classify the selected profile as one of:
- `cdp+disk`
- `cdp-only`
- `disk-only`
- `unusable`

This should remain internal unless the user asks for UX changes.

---

# Files to inspect first
- `agent/extensions/web-tools/auth-cookies.ts`
- `agent/extensions/web-tools/auth-cdp.ts`
- `agent/extensions/web-tools/auth.ts`
- `agent/extensions/web-tools/profiles.ts`
- `agent/extensions/web-tools/test/auth-cookies.test.ts`
- `agent/extensions/web-tools/README.md`

Potentially also inspect local Helium artifacts again:
- `/Users/dmmulroy/Library/Application Support/net.imput.helium/Local State`
- `/Users/dmmulroy/Library/Application Support/net.imput.helium/Default/Cookies`
- `/Users/dmmulroy/Library/Application Support/net.imput.helium/DevToolsActivePort`

---

# Validation expectations for follow-up work
At minimum, after any change:
- run `npm run check --workspace=pi-web-tools-extension`
- preserve passing CDP tests and smoke behavior
- do not regress `/web-profile` or footer status behavior
- if possible, add a local smoke check that demonstrates disk fallback returning at least some meaningful cookies, or conclusively documents why the target auth cookies are not persisted

---

# Prior related todo
The original implementation/design todo was:
- `TODO-5963ee7e` — authenticated webfetch using Helium profiles in Pi web-tools

That work is complete and closed. This todo is the follow-up specifically for improving the **disk-cookie fallback** path.

## Completed work (2026-04-07)
- Root cause confirmed locally: Helium persists Chromium-style `v10` cookies in a DB with `meta.version = 24`, so decrypted payloads include the required 32-byte `SHA256(host_key)` prefix before the actual cookie value.
- Root cause also included keychain lookup drift: this machine stores the usable secret in the `Helium Storage Key` keychain item (account `Helium`), not the previously tried `Helium Safe Storage` service name.
- Improved `auth-cookies.ts` to:
  - read the cookie DB `meta.version`
  - pass host key + DB metadata into decryption
  - strip and validate the Chromium v24 host digest during decryption
  - look up `Helium Storage Key` / `Helium` in addition to prior safe-storage candidates
  - copy sqlite sidecars alongside the temp snapshot
  - preserve empty-string cookie values instead of dropping them
- Added tests covering Chromium v24 host-hash decryption and empty-value handling.
- Updated `agent/extensions/web-tools/README.md` to document the stronger disk-cookie fallback behavior.

## Validation
- `npm run check --workspace=pi-web-tools-extension` ✅
- Local smoke check: `getCookiesFromProfileDb()` against the local Helium `Default` profile now returns persisted cookies again (observed 486 cookies at validation time, matching the live sqlite row count at that moment).
