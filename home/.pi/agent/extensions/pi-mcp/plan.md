# pi-mcp-oauth: Pi MCP Adapter Fork with Real OAuth

## Goal
Fork pi-mcp-adapter and replace its static token reader with a full OAuth implementation modeled on OpenCode's MCP auth internals. Keep everything else: single proxy tool, direct tools, progressive disclosure, lazy connecting, metadata cache, MCP panel UI.

## Architecture

### Auth Modes (backward compatible)
| Config `auth` | Behavior |
|---|---|
| (none) | No auth, same as today |
| `"bearer"` | Static token from `bearerToken` or `bearerTokenEnv` — unchanged |
| `"oauth"` | Full OAuth: browser redirect → local callback → token exchange → auto-refresh via SDK |

### Token Storage
Single file: `~/.local/share/pi/mcp-auth.json` (mode `0o600`)

```json
{
  "my-server": {
    "tokens": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresAt": 1711234567,
      "scope": "read write"
    },
    "clientInfo": {
      "clientId": "...",
      "clientSecret": "...",
      "clientIdIssuedAt": 1711230000,
      "clientSecretExpiresAt": 1711320000
    },
    "codeVerifier": null,
    "oauthState": null,
    "serverUrl": "https://example.com/mcp"
  }
}
```

Credentials are URL-scoped — if `serverUrl` changes, stored creds are invalidated.

### OAuth Flow (when `auth: "oauth"`)

1. **Initial connect** — `createHttpTransport()` creates an `McpOAuthProvider` and passes it as `authProvider` to the SDK transport constructor
2. **Server returns 401** — SDK calls provider methods, throws `UnauthorizedError`. Server marked as `needs-auth`
3. **User runs `/mcp-auth <server>`** — Extension:
   - Starts local callback server on `127.0.0.1:19876`
   - Generates PKCE code verifier + OAuth state
   - Creates transport with auth provider, triggers SDK auth flow to get authorization URL
   - Opens browser to authorization URL
   - Waits for callback with auth code (5 min timeout)
   - Calls `transport.finishAuth(code)` — SDK exchanges code for tokens
   - Provider's `saveTokens()` persists to `mcp-auth.json`
   - Reconnects server
4. **Subsequent requests** — SDK transport reads tokens via provider's `tokens()`, auto-refreshes using `refresh_token` on 401. Provider's `saveTokens()` persists refreshed tokens.

### Key Difference from pi-mcp-adapter
Today: tokens read as static headers in `requestInit`, SDK auth layer completely bypassed.
After: `authProvider` passed to transport constructor, SDK handles 401/refresh cycle automatically.

---

## Files

### New Files

#### `src/mcp-auth.ts` — Credential Storage
Replaces `oauth-handler.ts`. Manages `~/.local/share/pi/mcp-auth.json`.

- `get(serverName)` / `getForUrl(serverName, url)` — read entry, validate URL match
- `set(serverName, entry)` — write entry
- `remove(serverName)` — delete entry
- `updateTokens(serverName, tokens, url)` — upsert tokens
- `updateClientInfo(serverName, info, url)` — upsert dynamic registration info
- `updateCodeVerifier(serverName, verifier)` / `clearCodeVerifier(serverName)`
- `updateOAuthState(serverName, state)` / `getOAuthState(serverName)` / `clearOAuthState(serverName)`
- `isTokenExpired(serverName)` — for status display

Modeled on: OpenCode `src/mcp/auth.ts`

#### `src/mcp-oauth-provider.ts` — SDK Auth Provider
Implements `OAuthClientProvider` from `@modelcontextprotocol/sdk/client/auth.js`.

- `clientMetadata` — returns OAuth client metadata (grant_types: auth_code + refresh_token)
- `clientInformation()` — returns pre-registered clientId or dynamically registered client
- `saveClientInformation(info)` — persists dynamic registration
- `tokens()` — returns stored tokens for SDK to attach to requests
- `saveTokens(tokens)` — persists tokens after exchange or refresh
- `redirectToAuthorization(url)` — captures URL for browser opening
- `saveCodeVerifier(v)` / `codeVerifier()` — PKCE storage
- `saveState(s)` / `state()` — OAuth state parameter
- `invalidateCredentials(type)` — clear tokens/client/all

Modeled on: OpenCode `src/mcp/oauth-provider.ts`

#### `src/mcp-oauth-callback.ts` — Local Callback Server
HTTP server on `127.0.0.1:19876/mcp/oauth/callback`.

- `ensureRunning()` — start server if not already running
- `waitForCallback(state)` — returns Promise that resolves with auth code
- `stop()` — shutdown server
- State parameter validation (CSRF protection)
- 5-minute timeout per pending auth
- Success/error HTML pages

Modeled on: OpenCode `src/mcp/oauth-callback.ts`

### Modified Files

#### `src/server-manager.ts` — Transport Creation
The critical change. `createHttpTransport()` currently:
```ts
// Static headers, no SDK auth
headers["Authorization"] = `Bearer ${tokens.access_token}`;
const requestInit = { headers };
new StreamableHTTPClientTransport(url, { requestInit });
```

After:
```ts
// For auth: "oauth" — SDK manages auth automatically
const authProvider = new McpOAuthProvider(serverName, url, oauthConfig, callbacks);
new StreamableHTTPClientTransport(url, { authProvider, requestInit });
```

- `auth: "bearer"` path unchanged (static headers)
- `auth: "oauth"` path creates `McpOAuthProvider`, passes to transport
- No `auth` path unchanged (no auth)
- Handle `UnauthorizedError` — mark server as `needs-auth` instead of failing
- Store pending transports for `finishAuth()` after browser callback

#### `src/commands.ts` — `/mcp-auth` Command
Currently shows instructions to manually create token file. Replace with:

1. Validate server exists and uses `auth: "oauth"`
2. Call `startAuth(serverName)` which:
   - Starts callback server
   - Creates auth provider + transport
   - Triggers SDK auth flow → captures authorization URL
3. Open browser to authorization URL (with fallback to displaying URL)
4. Wait for callback
5. Call `finishAuth(serverName, code)`
6. Reconnect server
7. Show success/failure notification

Also add `/mcp-auth remove <server>` to clear stored credentials.

#### `src/mcp-panel.ts` — Auth Status in UI
- Show 🔑 icon or `needs-auth` status for OAuth servers without valid tokens
- Show ⚠️ for expired tokens
- Show lock icon for authenticated servers
- Hint text: "Run /mcp-auth <name> to authenticate" for needs-auth servers
- Enter on needs-auth server shows auth instructions

#### `src/types.ts` — Config Types
Add OAuth config fields to `ServerEntry`:
```ts
interface ServerEntry {
  // ... existing fields ...
  auth?: "oauth" | "bearer";
  // New: OAuth-specific config (optional, for pre-registered clients)
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthScope?: string;
}
```

#### `src/index.ts` — Wiring
- Import new auth modules
- Pass auth config through to server manager
- Wire up shutdown cleanup for callback server

#### `src/init.ts` — Startup Auth Status
- On startup, check stored token status for OAuth servers
- Mark servers with expired/missing tokens as `needs-auth` instead of failing
- Include auth status in status bar

### Deleted Files
- `oauth-handler.ts` — replaced by `mcp-auth.ts` + `mcp-oauth-provider.ts`

### Package Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0"
  }
}
```
(Already a transitive dep of pi-mcp-adapter, but needs to be direct for the `OAuthClientProvider` import)

---

## Implementation Order

1. **Copy pi-mcp-adapter** into `~/.pi/agent/extensions/pi-mcp-oauth/`
2. **Create `mcp-auth.ts`** — credential storage (standalone, testable)
3. **Create `mcp-oauth-provider.ts`** — SDK provider implementation (depends on mcp-auth)
4. **Create `mcp-oauth-callback.ts`** — callback server (standalone)
5. **Modify `server-manager.ts`** — wire auth provider into transport creation
6. **Modify `commands.ts`** — real OAuth flow in `/mcp-auth`
7. **Modify `types.ts`** — add OAuth config fields
8. **Modify `index.ts`** — wire up new modules, cleanup
9. **Modify `init.ts`** — auth status on startup
10. **Modify `mcp-panel.ts`** — auth status display
11. **Delete `oauth-handler.ts`**
12. **Install deps** — `npm install`
13. **Test** — manual test with a real OAuth MCP server

---

## Open Questions (resolved)
- ✅ Extension location: `~/.pi/agent/extensions/pi-mcp-oauth/`
- ✅ Token storage: `~/.local/share/pi/mcp-auth.json`
- ✅ Auth modes: none / bearer / oauth (backward compatible)
- ✅ Approach: fork pi-mcp-adapter, surgical auth replacement
