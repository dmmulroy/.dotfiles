# A local Code Mode MCP server around `open-computer-use`

**Research date:** 2026-08-02  
**Scope:** local-first architecture; Cloudflare first-party material; the installed `iFurySt/open-codex-computer-use` implementation; primary QuickJS, quickjs-ng, quickjs-emscripten, MCP, and Emscripten documentation.  
**Source snapshots inspected:** `cloudflare/agents` at `0efd545a58c9075885977627e5d853b6e98f6d54`, `cloudflare/workers-mcp` at `e22d7c46c49f34e3f825d750c0c316f7aa9728dd`, and `iFurySt/open-codex-computer-use` v0.3.1 at `8dd6707412cf88dff00df22e299ee45beb7aebec`. The installed server's live `tools/list` response was also checked.

## Executive recommendation

Build a **local Node.js MCP supervisor** that:

1. exposes one high-level MCP tool, `computer_execute`, to the agent;
2. launches `open-computer-use mcp` as a local stdio child and remains its sole MCP client;
3. discovers the nine upstream tools at startup and generates a TypeScript declaration shown in `computer_execute`'s description;
4. runs model-authored JavaScript in a fresh **QuickJS/quickjs-ng WebAssembly runtime inside a Node worker thread** for every execution;
5. gives that runtime only a narrow `computer.*` capability object whose asynchronous methods cross a message bridge to the trusted supervisor;
6. validates every nested call against the discovered upstream schema, serializes calls, and forwards them unchanged to `open-computer-use`;
7. keeps screenshot bytes out of QuickJS, representing them there as opaque attachment handles, then emits selected screenshots as real MCP `image` content blocks in the outer result; and
8. destroys the QuickJS worker after each run while keeping the one upstream `open-computer-use` process alive for session and `element_index` continuity.

This reproduces Cloudflare Code Mode's important security shape—**fresh code sandbox + capability-only RPC + no ambient network/secrets**—without pretending that Cloudflare's Worker Loader or Workers RPC exists as a normal local Node API. Cloudflare's current Code Mode implementation uses dynamically loaded **V8 Worker isolates**, not QuickJS. QuickJS/Wasm is the recommended *local analogue*, not Cloudflare's production executor. Cloudflare explicitly makes its executor interface replaceable with QuickJS, Node VM, containers, or another sandbox, while `DynamicWorkerExecutor` itself requires the Workers environment ([Cloudflare `@cloudflare/codemode` README](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#the-executor-interface)).

Do **not** use Node's `vm`, `AsyncFunction`, or `eval` as the security boundary. Do **not** expose raw filesystem, process, shell, environment, network, or the upstream MCP transport to guest code. Do **not** pass screenshot base64 through the guest heap or stringify it into an outer text result.

---

## 1. What “Code Mode” means in Cloudflare's design

Cloudflare's central claim is that an LLM can work more reliably with many or complex tools when MCP schemas are converted into a typed TypeScript API and the model writes code against that API. Code also performs loops, joins, filtering, branching, and multiple tool calls without feeding every intermediate result through another inference round ([Cloudflare Code Mode post](https://blog.cloudflare.com/code-mode/)).

The current shape is:

- MCP or AI tools are converted to TypeScript declarations with schema descriptions as doc comments.
- The model sees one code-execution tool rather than every underlying tool.
- Generated JavaScript runs in a sandbox.
- API methods in the sandbox are proxies; calls go back to trusted host implementations.
- Ambient `fetch()` and `connect()` are blocked by default.
- Secrets remain in the host and never enter generated code.

Cloudflare's post describes a fresh isolate per generated snippet, outbound networking disabled, and RPC bindings back to the agent loop ([Cloudflare Code Mode post, “Running code in a sandbox” and “Dynamic Worker loading”](https://blog.cloudflare.com/code-mode/)). The current `@cloudflare/codemode` source implements this with `DynamicWorkerExecutor`: it normalizes generated code, creates proxy namespaces, builds an `executor.js` module, calls `loader.load(...)` with `globalOutbound: null`, invokes the generated Worker's RPC entrypoint, then explicitly disposes both entrypoint and Worker handles ([executor source](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/src/executor.ts)).

### Why the pattern is attractive for computer use

Computer-use workflows are inherently sequential and stateful:

```js
async () => {
  const state = await computer.getAppState({ app: "TextEdit" });
  const save = findElement(state.treeText, /save/i);
  if (!save) return { ok: false, reason: "Save control not found", state };
  return await computer.click({ app: "TextEdit", elementIndex: save.index });
}
```

Code Mode avoids an inference round trip between observation and action and can reduce bulky accessibility trees locally before returning a concise result. That is the same class of benefit Cloudflare identifies for chaining MCP calls ([Cloudflare Code Mode post](https://blog.cloudflare.com/code-mode/)).

---

## 2. Cloudflare-hosted architecture

### 2.1 Dynamic Workers / Worker Loader

A Worker with a `worker_loaders` binding receives `env.LOADER`. `load(code)` creates a fresh one-shot Dynamic Worker, while `get(id, callback)` may cache by stable ID; Cloudflare recommends `load()` for one-off Code Mode execution ([Dynamic Workers getting started](https://developers.cloudflare.com/dynamic-workers/getting-started/), [API reference](https://developers.cloudflare.com/dynamic-workers/api-reference/)).

A `WorkerCode` object includes:

- `compatibilityDate` and optional flags;
- `mainModule` and source `modules`;
- optional structured values and service bindings in `env`;
- `globalOutbound`, where `null` blocks global `fetch()` and `connect()`;
- optional tails; and
- in current docs, custom CPU/subrequest limits can be applied to Worker code or an entrypoint invocation ([Dynamic Workers API reference](https://developers.cloudflare.com/dynamic-workers/api-reference/), [custom limits](https://developers.cloudflare.com/dynamic-workers/usage/limits/)).

`load()` creates a fresh Worker each call. `get()` offers opportunistic caching, but it does not guarantee that two requests use the same isolate, and its callback may run any number of times. State must not depend on isolate reuse ([Dynamic Workers API reference](https://developers.cloudflare.com/dynamic-workers/api-reference/#get)).

Cloudflare Workers use V8 isolates. Isolates have separate memory, start quickly, and may be evicted; Cloudflare advises against relying on mutable global state ([How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/)).

### 2.2 Bindings and object capabilities

Dynamic Worker bindings implement constructive security: block ambient network access, then provide only explicit capabilities. A loader Worker can export a `WorkerEntrypoint`, instantiate a loopback stub with `ctx.exports.SomeEntrypoint({ props })`, and pass that stub in the dynamic Worker's `env`. Calls run back in trusted loader code, and `ctx.props` can carry tenant or request scope without exposing secrets to the child ([Dynamic Workers bindings](https://developers.cloudflare.com/dynamic-workers/usage/bindings/)).

Workers RPC follows an object-capability model: code may invoke only objects/functions for which it received stubs, and stubs cannot be forged from a global identifier ([RPC visibility/security](https://developers.cloudflare.com/workers/runtime-apis/rpc/visibility/)). RPC supports structured-clone values plus functions, `RpcTarget`s, streams, `Request`, and `Response`; all calls are asynchronous ([Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)). RPC objects and stubs should be explicitly disposed because a live stub holds the remote target alive ([RPC lifecycle](https://developers.cloudflare.com/workers/runtime-apis/rpc/lifecycle/)).

For Code Mode, `ToolDispatcher extends RpcTarget` stores trusted tool functions. The generated child creates a proxy for each namespace; `proxy.method(args)` calls `ToolDispatcher.call(...)` over RPC. Current connector calls can also receive direct RPC connector stubs ([executor source](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/src/executor.ts), [package architecture](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#architecture)).

### 2.3 Egress

`globalOutbound: null` makes both `fetch()` and `connect()` throw. A service stub can instead intercept all outbound traffic to allowlist destinations, attach host-held credentials, and log calls ([Dynamic Workers egress control](https://developers.cloudflare.com/dynamic-workers/usage/egress-control/)). For this project, the correct default is **no egress at all**; the only guest capability should be `computer.*` (and perhaps deterministic utility functions implemented inside the guest).

### 2.4 Service bindings

Service bindings let one deployed Worker invoke another without a public URL, by RPC or HTTP. RPC is recommended for most internal APIs; calls must be awaited or the callee can be terminated early. Local multi-Worker development is supported by Wrangler, including an experimental multi-config command ([service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)).

This is relevant to a Cloudflare-hosted Code Mode supervisor but **not a way for a deployed Worker to control the user's desktop**. A Cloudflare service binding points to a Worker service, not to a local Swift/Go/Python process behind the user's stdio.

### 2.5 Current `codeMcpServer` tooling

Cloudflare now ships a first-party `codeMcpServer({ server, executor })` helper. It:

1. connects an in-memory MCP client to an in-process `McpServer`;
2. calls `listTools()`;
3. generates TypeScript from each tool's JSON Schema;
4. maps each tool to a host function calling `client.callTool()`;
5. exposes one outer `code` tool; and
6. runs code via the supplied `Executor` ([source](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/src/mcp.ts), [example](https://github.com/cloudflare/agents/tree/0efd545a58c9075885977627e5d853b6e98f6d54/examples/codemode-mcp)).

Important limitations for this project:

- The helper accepts an **in-process `McpServer`**, not an already-running stdio MCP server.
- Its Cloudflare executor requires `WorkerLoader`/workerd.
- Its generic result unwrapping returns mixed image/text MCP content “as is,” but the outer handler then stringifies/truncates the result into one text block. Its text cap is approximately 6,000 tokens. That is unsuitable for `open-computer-use`, whose state/action results include base64 screenshots ([source](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/src/mcp.ts)).
- The example notes that `codeMcpServer` currently uses the MCP SDK v1 bridge ([example README](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/examples/codemode-mcp/README.md)).

The helper is an excellent reference implementation, but it should not be used unchanged around computer-use image results.

### 2.6 `workers-mcp` is historical, not the foundation

`cloudflare/workers-mcp` generated MCP tool metadata from `WorkerEntrypoint` methods, installed a local stdio proxy, and forwarded calls to a deployed Worker. Its own README now warns new users to build remote MCP servers instead ([repository README](https://github.com/cloudflare/workers-mcp/blob/e22d7c46c49f34e3f825d750c0c316f7aa9728dd/README.md)).

Useful lessons are limited to:

- local stdio-to-remote proxying is a viable transport adapter;
- build-time TypeScript-to-tool generation can work; and
- tool schema changes may require client restart.

It does not provide a local untrusted-code sandbox and should not be confused with current Code Mode.

---

## 3. What actually runs locally

### 3.1 Supported locally by Cloudflare tooling

Wrangler and the Vite plugin run Worker code locally through Miniflare on `workerd`, the same open-source runtime used in production. Bindings default to local simulations unless configured as remote bindings ([Workers local development](https://developers.cloudflare.com/workers/local-development/)). Cloudflare's Code Mode post explicitly says Dynamic Worker loading is available locally with Wrangler/workerd ([Code Mode post](https://blog.cloudflare.com/code-mode/)).

Therefore, this can run locally:

```text
local Node/Wrangler process
  └─ local workerd parent Worker
      └─ Worker Loader
          └─ fresh local V8 Dynamic Worker
```

This is valuable for tests and for an all-Workers application.

### 3.2 What does not carry over to an ordinary local Node MCP server

An ordinary Node process does not receive:

- a `WorkerLoader` object;
- `ctx.exports` loopback service stubs;
- Workers RPC object-capability transport;
- workerd-enforced `globalOutbound`; or
- Dynamic Worker CPU/subrequest limits.

`getPlatformProxy()` can return Node-side proxies to configured local workerd bindings, but Cloudflare calls these best-effort emulations and documents it for applications/testing, not as a general embedded Worker Loader API ([Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)). The newer `createTestHarness()` can launch Workers and obtain environment/exports for integration tests, but it is a test harness rather than a recommended production desktop supervisor ([Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/#createtestharness)).

### 3.3 `getBindings()` is not the missing bridge

The relevant `getBindings()` is a **Miniflare testing API** for retrieving configured Worker bindings from the host test process ([Miniflare get started](https://developers.cloudflare.com/workers/testing/miniflare/get-started/)). It is not a Dynamic Worker Loader method, not available to generated code, and not an API for importing arbitrary local processes into Workers RPC.

Older Miniflare v2 methods named `getGlobalScope()`, `getBindings()`, and `getModuleExports()` were removed when Miniflare moved to out-of-process workerd because they returned objects from inside the sandbox ([Miniflare v2→v3 migration](https://developers.cloudflare.com/workers/testing/miniflare/migrations/from-v2/)). Current APIs instead use explicit Worker handles, environment proxies, and service/RPC boundaries.

### 3.4 Why local workerd is not the recommended MVP

`open-computer-use` is a local stdio server. MCP stdio requires the MCP client to launch the server as a subprocess and exchange newline-delimited JSON-RPC over stdin/stdout ([MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio)). A Worker isolate does not have Node's unrestricted `child_process` and host stdio APIs. A local workerd parent would therefore still need a trusted Node sidecar that owns `open-computer-use`, plus an HTTP or custom service bridge into workerd.

That architecture is possible but adds:

- a second runtime/process;
- a local listening endpoint or nontrivial harness integration;
- origin/authentication and lifecycle concerns;
- screenshot transfer through another boundary; and
- no benefit over a direct Node→QuickJS capability bridge for the first local version.

Use local workerd as an **alternative backend** after the core `Executor` and host capability interfaces are stable.

---

## 4. The `open-computer-use` interface and constraints

### 4.1 Process and protocol

The package we use is npm `open-computer-use`, currently v0.3.1, from `iFurySt/open-codex-computer-use`. Its documented MCP configuration launches `open-computer-use mcp` over stdio ([README](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/README.md)).

At the inspected revision, the server implements `initialize`, `notifications/initialized`, `notifications/turn-ended`, `ping`, `tools/list`, and `tools/call`, using one newline-delimited JSON-RPC message per line. It reports protocol version `2025-03-26` and `listChanged: false` ([MCP server source](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/packages/OpenComputerUseKit/Sources/OpenComputerUseKit/MCPServer.swift)).

On macOS, CLI commands proxy through a local Unix-domain socket to an app bundle that owns Accessibility and Screen Recording permissions; the external MCP transport remains stdio. Windows uses UI Automation/PowerShell and Linux uses AT-SPI/Python. All require the signed-in desktop session ([architecture](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/docs/ARCHITECTURE.md)).

### 4.2 The nine tools

The v0.3.1 source and a live `tools/list` query expose exactly these tools ([tool definitions](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/packages/OpenComputerUseKit/Sources/OpenComputerUseKit/ToolDefinitions.swift)):

| Tool | Core input | Semantics |
|---|---|---|
| `list_apps` | `{}` | Read available/recent apps. |
| `get_app_state` | `{ app, text_limit?, max_tree_nodes?, max_tree_depth? }` | Return current accessibility tree and screenshot; required before actions each assistant turn. Output-size controls default to 500 text characters, 1,200 nodes, and depth 64. |
| `click` | `{ app, element_index? }` or `{ app, x?, y?, click_count?, mouse_button?, click_method? }` | Element or screenshot-coordinate click. `click_method` can explicitly select `auto`, `accessibility`, `app_post`, `sky_click`, or `global`; explicit modes fail closed. |
| `perform_secondary_action` | `{ app, element_index, action }` | Invoke an exposed accessibility action. |
| `scroll` | `{ app, element_index, direction, pages? }` | Scroll an element. |
| `drag` | `{ app, from_x, from_y, to_x, to_y }` | Coordinate drag. |
| `type_text` | `{ app, text }` | Type literal text. |
| `press_key` | `{ app, key }` | xdotool-style key/key-combination. |
| `set_value` | `{ app, element_index, value }` | Set a settable accessibility value. |

Read tools have read-only/idempotent annotations. Action tools retain the upstream `destructiveHint: false` and `openWorldHint: false` annotations. The wrapper should preserve those annotations and the upstream tool descriptions rather than introducing a second authorization model.

### 4.3 Results and state

Results are MCP `content` arrays with text and optionally base64 `image/png` blocks; `isError` marks tool failures ([result source](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/packages/OpenComputerUseKit/Sources/OpenComputerUseKit/ToolResult.swift)). On macOS, screenshots are kept in memory, downsampled, and returned as image blocks rather than persisted by default ([README image settings](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/README.md#image-capture-macos)).

The server stores latest snapshots and `element_index` mappings in process memory. Multi-call CLI sequences deliberately reuse one service process so indices survive from observation to action ([architecture](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/docs/ARCHITECTURE.md)). Therefore:

- keep one upstream child alive for the outer MCP session;
- serialize all calls, even if generated code uses `Promise.all`;
- preserve the upstream instruction to call `get_app_state` once per assistant turn;
- forward `turn-ended` at the corresponding outer execution boundary; and
- restart/rediscover if the child exits.

### 4.4 Preserve upstream behavior

The wrapper should not add a second human-in-the-loop, app-policy, or approval layer. It should preserve the project's existing password-manager denylist and other runtime behavior by forwarding calls through the supported MCP interface ([security document](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/docs/SECURITY.md)). Its responsibility is code isolation, orchestration, transport, and result shaping—not redefining which computer actions are permitted.

---

## 5. QuickJS/WebAssembly as the local executor

### 5.1 What Cloudflare does—and does not do—with QuickJS

Current first-party Cloudflare Code Mode executes generated code in fresh **V8 Dynamic Workers**. Its code and docs mention QuickJS only as an example of a custom implementation of the minimal `Executor` interface ([Cloudflare executor docs](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#the-executor-interface)). It would be inaccurate to say Cloudflare Code Mode itself runs on QuickJS.

Cloudflare does run WebAssembly in Workers. Workers can import precompiled Wasm modules and instantiate them; threads are not available; Wasm usually increases bundle/startup size; WASI support is experimental and partial ([Cloudflare Wasm docs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), [Wasm from JavaScript](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/)).

Cloudflare's current Agents repository also uses `just-bash` for a sandboxed virtual-filesystem Bash tool with network disabled; `just-bash` brings `quickjs-emscripten` transitively. That is separate from Code Mode and should not be used as evidence that Dynamic Workers are QuickJS-based ([Think tools docs](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/docs/think/tools.md#built-in-workspace-tools), [Think package manifest](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/think/package.json)).

### 5.2 Why QuickJS is a good local fit

Original QuickJS is a small embeddable interpreter with very low startup time, broad modern ECMAScript support, reference-counting plus cycle removal, memory/stack controls, and an interrupt handler suitable for execution deadlines ([QuickJS documentation](https://bellard.org/quickjs/quickjs.html)). quickjs-ng is an actively developed drop-in-oriented fork with regular releases, more tests/platform support, and performance work, while remaining an interpreter rather than a JIT ([quickjs-ng differences](https://quickjs-ng.github.io/quickjs/diff/)).

The C APIs directly provide the primitives a local sandbox needs:

- one `JSRuntime` heap per execution;
- isolated `JSContext` globals;
- `JS_SetMemoryLimit()`;
- `JS_SetMaxStackSize()`; and
- `JS_SetInterruptHandler()` for timeouts ([quickjs-ng C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/)).

`quickjs-emscripten` compiles QuickJS to Wasm, exposes host functions, and supports memory limits and interrupt deadlines. By default guest QuickJS receives no host functionality ([quickjs-emscripten README](https://github.com/justjake/quickjs-emscripten)). Its own security note says the project has not been audited, so it should be treated as defense in depth rather than an infallible boundary ([quickjs-emscripten status](https://github.com/justjake/quickjs-emscripten#status--roadmap)).

### 5.3 Async calls are the hard part

Computer methods are asynchronous because they cross to a child MCP process. `quickjs-emscripten` supports guest promises by creating a `QuickJSDeferredPromise`; after the host settles one, it must run pending QuickJS jobs. It warns against host/guest promise deadlocks ([promise documentation](https://github.com/justjake/quickjs-emscripten#promises)).

Asyncify is another option: it transforms Wasm so synchronous C can suspend for asynchronous host JavaScript. It increases binary size and runtime overhead, permits only one suspension at a time per asyncified module in quickjs-emscripten's model, and has reentrancy hazards ([quickjs-emscripten Asyncify](https://github.com/justjake/quickjs-emscripten#asyncify), [Emscripten Asyncify docs](https://emscripten.org/docs/porting/asyncify.html)).

**Recommendation:** start with normal guest JavaScript promises, not “async host, synchronous guest” Asyncify magic. The generated API is naturally `Promise`-based. Maintain an explicit host-call registry and pump `executePendingJobs()` after each response. Run each QuickJS instance in its own Node worker thread so the supervisor can hard-terminate a wedged execution.

### 5.4 Wasm is not the whole sandbox

Wasm isolates the QuickJS engine's linear memory, and QuickJS isolates guest objects from host objects. Security still depends on:

- exposing only carefully written host functions;
- strict marshalling (prefer JSON-like data and opaque IDs);
- memory/stack/CPU limits;
- avoiding reentrancy bugs;
- disposing every QuickJS handle (quickjs-emscripten requires manual disposal for Wasm heap handles); and
- being able to terminate the whole worker thread ([quickjs-emscripten memory management](https://github.com/justjake/quickjs-emscripten#memory-management)).

For higher assurance, move execution into a separate OS process with an OS sandbox in a later phase. A Node worker thread gives robust termination and fault containment for ordinary bugs, but it is not a kernel security boundary.

---

## 6. Recommended local architecture

```text
MCP host (Pi / Claude / other)
        │ stdio JSON-RPC
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Trusted Node supervisor: local-codemode-open-computer-use   │
│                                                              │
│  Outer MCP server                                            │
│    └─ computer_execute                                       │
│                                                              │
│  Schema/type compiler ◄──── tools/list                       │
│  Schema-validating call bridge                               │
│  Sequential call scheduler                                   │
│  Attachment store (bounded, in-memory)                       │
│       │ MessagePort JSON + opaque attachment IDs             │
│       ▼                                                      │
│  Fresh worker_threads Worker per execution                   │
│    └─ QuickJS-ng/Wasm runtime                                │
│       ├─ generated code                                      │
│       ├─ computer.* proxy                                    │
│       └─ no process/fs/net/env/require/import                │
│                                                              │
│  Upstream MCP client                                         │
│       │ stdio JSON-RPC; one serialized request at a time     │
└───────┼──────────────────────────────────────────────────────┘
        ▼
open-computer-use mcp
  └─ macOS app agent / Windows UIA / Linux AT-SPI
```

### Trust zones

1. **Generated-code zone:** untrusted QuickJS guest.
2. **Supervisor zone:** trusted MCP client/server, type generation, schema validation, and attachments.
3. **Desktop automation zone:** upstream `open-computer-use` with its existing OS permissions and behavior.
4. **MCP host/user zone:** invokes the outer Code Mode tool as it would any other MCP tool.

### Why one upstream process but fresh guest runtimes

- A fresh guest runtime prevents generated globals, monkey patches, stale promises, and leaked capability handles from crossing executions—matching Cloudflare's one-shot `loader.load()` pattern ([Dynamic Workers API](https://developers.cloudflare.com/dynamic-workers/api-reference/#load)).
- One upstream process preserves `open-computer-use`'s in-memory snapshots and app-session behavior during the outer MCP session.
- The supervisor, not guest code, owns both lifetimes.

### Components

#### `UpstreamComputerClient`

- Spawn via the MCP SDK's stdio client transport, with a configured absolute command/path rather than accepting a command from generated code.
- Perform initialize/initialized, then `tools/list`.
- Capture stderr separately; never mix logs into MCP stdout.
- Enforce one outstanding `tools/call` at a time.
- Apply per-call timeout and cancellation; if a call is irrecoverably stuck, kill/restart the child and invalidate all snapshots.
- Send `notifications/turn-ended` at the outer execution boundary when visual-cursor cleanup is desired.

MCP stdio requires newline-delimited UTF-8 JSON-RPC, permits logs only on stderr, and forbids non-MCP stdout ([MCP transport spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio)).

#### `ToolCatalog`

- Treat runtime `tools/list` as authoritative.
- Reject collisions after JavaScript identifier sanitization; otherwise expose the complete discovered tool catalog.
- Generate declarations from JSON Schema, preserving descriptions.
- Version/cache declarations by a canonical hash of the tool catalog.
- Generate the `computer.*` surface from every discovered upstream tool and record a schema hash so changes are observable in tests and logs.

#### `ComputerCallBridge`

- Receives `{ executionId, seq, method, args }` from the guest worker.
- Validates the method and arguments against the discovered upstream JSON Schema.
- Serializes calls so snapshot and `element_index` state remain coherent.
- Calls upstream MCP without adding app scopes, action categories, or approval gates.
- Extracts image/audio/binary blocks into the attachment store.
- Returns only JSON-like summaries plus opaque attachment IDs to QuickJS.

#### `QuickJsExecutor`

Implement a Cloudflare-inspired minimal interface:

```ts
export interface Executor {
  execute(
    code: string,
    capabilities: readonly CapabilityDescriptor[],
    options: ExecutionOptions,
  ): Promise<ExecuteResult>;
}

export interface ExecutionOptions {
  executionId: string;
  wallTimeMs: number;
  cpuDeadlineMs: number;
  memoryBytes: number;
  maxStackBytes: number;
  maxCalls: number;
  maxOutputBytes: number;
}

export interface ExecuteResult {
  value?: JsonValue;
  logs: readonly string[];
  referencedAttachments: readonly AttachmentRef[];
  error?: { code: string; message: string; stack?: string };
  metrics: {
    elapsedMs: number;
    calls: number;
    outputBytes: number;
  };
}
```

The worker thread should instantiate one Wasm module/runtime/context, install only frozen proxy globals and a bounded console, evaluate a normalized async arrow function, pump pending jobs, then dispose all handles/runtime/module. The supervisor should terminate the thread at the wall deadline regardless of QuickJS's interrupt handler.

#### `AttachmentStore`

- In-memory and per-execution by default.
- Random unguessable IDs.
- Hard caps on item count, item bytes, aggregate bytes, and lifetime.
- Store decoded bytes once; guest receives metadata only.
- The final serializer materializes only referenced or caller-selected images as MCP image blocks.
- Never write screenshots to disk unless an explicit debug mode is enabled with a private directory and retention limit.

This is needed because MCP supports typed image content blocks, while generic JSON stringification turns PNG base64 into huge text ([MCP tool result types](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result)).

---

## 7. Proposed TypeScript API shown to the model

Use `computer`, not generic `codemode`, to make identifiers searchable and intent clear. Generated JavaScript remains JavaScript; TypeScript declarations are documentation for the model.

```ts
interface AppRef {
  name: string;
  bundleIdentifier?: string;
  pid?: number;
  running?: boolean;
}

interface AttachmentRef {
  /** Opaque reference. It is not a path or URL and cannot be fetched by guest code. */
  id: string;
  mimeType: "image/png";
  bytes: number;
  width?: number;
  height?: number;
}

interface ComputerState {
  /** Accessibility tree and other textual state from open-computer-use. */
  treeText: string;
  images: AttachmentRef[];
  isError: false;
}

interface ComputerActionResult extends ComputerState {
  action: string;
}

interface ClickInput {
  app: string;
  elementIndex?: string;
  x?: number;
  y?: number;
  clickCount?: number;
  mouseButton?: "left" | "right" | "middle";
  clickMethod?: "auto" | "accessibility" | "app_post" | "sky_click" | "global";
}

interface ScrollInput {
  app: string;
  elementIndex: string;
  direction: "up" | "down" | "left" | "right";
  pages?: number;
}

declare const computer: {
  /** List running and recently used applications. */
  listApps(): Promise<AppRef[]>;

  /**
   * Observe an app before any action in this execution. Element indexes are
   * valid only for the current upstream session/snapshot.
   */
  getAppState(input: {
    app: string;
    textLimit?: number | "max";
    maxTreeNodes?: number;
    maxTreeDepth?: number;
  }): Promise<ComputerState>;

  /** Requires getAppState(input.app) earlier in this execution. */
  click(input: ClickInput): Promise<ComputerActionResult>;

  /** Requires a current element index from getAppState. */
  performSecondaryAction(input: {
    app: string;
    elementIndex: string;
    action: string;
  }): Promise<ComputerActionResult>;

  scroll(input: ScrollInput): Promise<ComputerActionResult>;

  drag(input: {
    app: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }): Promise<ComputerActionResult>;

  typeText(input: { app: string; text: string }): Promise<ComputerActionResult>;
  pressKey(input: { app: string; key: string }): Promise<ComputerActionResult>;
  setValue(input: {
    app: string;
    elementIndex: string;
    value: string;
  }): Promise<ComputerActionResult>;
};
```

### Adapter rules

- Convert snake_case MCP fields into model-friendly camelCase but log both adapter and upstream names.
- `listApps()` should parse upstream text only if the format is stable; otherwise return `{ rawText }` rather than inventing brittle structure.
- Preserve tool errors as typed thrown errors with stable local codes and redacted upstream text.
- Extract images from all upstream results before guest marshalling.
- Never expose attachment bytes, local paths, PID-control APIs, or arbitrary tool names.
- Freeze `computer` and its methods; guest replacement of a global should not alter the broker.

### Outer MCP tool shape

```ts
interface ComputerExecuteInput {
  /** Plain JavaScript async arrow function. No TypeScript syntax. */
  code: string;

  /** Which attachment handles from the returned value should be emitted. */
  includeImages?: "none" | "referenced" | "latest";
}
```

Expose **one** tool named `computer_execute`, not `code`, so its purpose remains explicit. The description should include the generated declarations, upstream usage rules (“observe before action,” “return only needed data,” “do not use concurrency for actions”), and examples.

The outer result should contain:

1. a bounded JSON/text representation of the guest return value;
2. selected real MCP image blocks; and
3. `isError: true` for execution or upstream errors.

Do not rely only on `console.log()` as the return channel. Cloudflare's original post used logs, but current executor APIs also return a value, and structured return values are easier to bound and attach safely ([Cloudflare executor interface](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#the-executor-interface)).

---

## 8. Execution lifecycle

### Startup

1. Parse static local configuration; resolve the exact upstream executable.
2. Start `open-computer-use mcp` as a child.
3. Initialize MCP and fetch the tool catalog.
4. Validate the discovered schemas and sanitization uniqueness.
5. Build the typed model API and register `computer_execute`.
6. Run an optional read-only health check (`ping`, then perhaps `list_apps`).
7. Emit no non-MCP data to the wrapper's stdout.

### Per `computer_execute` call

1. **Accept and bound input:** enforce the source-size limit.
2. **Create execution state:** random ID, deadline, call budget, and attachment namespace.
3. **Normalize/parse code:** require one async arrow function; reject imports, dynamic import, top-level module syntax, and source above limit. AST checks improve diagnostics but are not the security boundary.
4. **Start fresh worker thread + QuickJS runtime:** set memory, stack, interrupt, output, and wall-clock limits before evaluation.
5. **Install capabilities:** frozen `computer` methods, bounded console, selected deterministic standard JS globals. No Node or QuickJS `std`/`os` modules.
6. **Evaluate:** obtain the guest promise and pump pending jobs.
7. **Nested call:** guest sends `{seq, method, args}`; the supervisor validates it against the discovered upstream schema and queues it for sequential execution.
8. **Forward:** call the upstream tool unchanged, extract text and images, store images as attachments, and return lightweight metadata to the guest.
9. **Complete:** serialize a JSON-safe guest result with depth/key/string/byte limits and identify referenced attachment IDs.
10. **Emit outer result:** bounded text plus selected image blocks.
11. **Cleanup:** dispose QuickJS handles, terminate the worker thread, expire attachments, and send the upstream `turn-ended` notification if appropriate.

### Failure

- **Guest exception:** return a sanitized stack and preserve any upstream calls already completed.
- **Timeout/infinite loop:** QuickJS interrupt first; supervisor hard-terminates worker thread at wall deadline.
- **Outstanding upstream call at timeout:** request cancellation if supported; otherwise let a short grace expire, then restart upstream and invalidate all snapshots.
- **Upstream crash:** reject pending call, restart with backoff, reinitialize/catalog-check, and require a fresh observation.
- **Attachment cap:** omit image with an explicit metadata error; never silently replace it with truncated base64 text.

### Concurrency

Generated code may use `Promise.all`, but the broker must serialize all computer calls by `seq`. Parallel GUI actions are nondeterministic and can invalidate snapshot indices. Optionally reject concurrent action requests instead of silently serializing them; this teaches the model a safer pattern.

---

## 9. Threat model

### Assets

- User's visible desktop and app state.
- Accessibility and screen-recording privileges.
- Sensitive text in accessibility trees/screenshots.
- Data typed into applications.
- User identity/session and externally visible actions.
- Wrapper/upstream process integrity.
- Local filesystem, environment variables, credentials, network, clipboard.

### Adversaries and untrusted inputs

- Model-generated JavaScript.
- Prompt injection present in a web page, message, document, app label, or accessibility tree.
- Malicious or compromised MCP host.
- Unexpected/malicious upstream tool output.
- A compromised `open-computer-use` binary or dependency.
- A local same-user process attempting to connect to any local endpoint.

### Primary threats and controls

| Threat | Example | Required controls |
|---|---|---|
| Sandbox escape | Generated code reaches Node `process`, native Wasm imports, or supervisor objects. | QuickJS guest, no ambient host globals, tiny audited marshaller, worker thread/process kill, dependency pinning, fuzz tests. |
| Ambient exfiltration | Guest sends screenshot/text to the Internet. | No network APIs in guest; no generic host fetch; no DNS/socket/file/process capability. |
| Secret leakage | API keys/env passed into guest. | Never inject `process.env` or unrelated host data; expose only the OCU capability methods. |
| Unbounded action fan-out | Generated code loops indefinitely over tool calls. | Execution deadline and a general call-count resource limit; no action-specific authorization logic. |
| TOCTOU / stale element index | UI changes after observation. | Observe in same execution, serialize calls, short snapshot TTL, verify returned state, refresh after failures. |
| Screenshot disclosure | Base64 enters logs/error/text or persists. | Opaque attachments; typed MCP image blocks; no default disk persistence; bounded retention. |
| Output/heap exhaustion | Huge AX tree, image, logs, recursive object, promise storm. | Input/result/attachment limits, QuickJS memory/stack caps, output truncation, depth limits, max pending calls. |
| CPU denial | `while(true){}` or pathological regex. | QuickJS interrupt deadline + hard worker termination + process-level fallback. |
| Async deadlock/reentrancy | Guest promise waits while pending jobs are not pumped. | Explicit event loop state machine; one broker response at a time; tests for nested promises, rejection, timeout. |
| Upstream process hijack | Arbitrary command/path supplied by guest or env. | Static executable configuration; no guest process control; verify package/signature/hash where practical. |
| Local HTTP attack | Browser reaches localhost service via DNS rebinding. | Prefer stdio outer transport. If HTTP is added: loopback only, Origin validation, authentication, unguessable sessions—required/recommended by MCP transport spec ([MCP transport security](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#security-warning)). |
| Same-user observation | Screenshots readable from temp files. | Memory-only defaults; restrictive permissions; no code/result in process titles. |
| Supply-chain compromise | QuickJS Wasm or OCU npm artifact changed. | Lockfile/integrity hashes, provenance/signature checks, SBOM, explicit upgrades, pinned source tests. |

---

## 10. MVP phases

### Phase 0 — Contract and read-only spike

Goal: prove transport, types, QuickJS async bridge, and image handling without mutating the desktop.

- Node stdio MCP wrapper.
- Spawn/initialize OCU.
- Catalog verification and generated TypeScript.
- Exercise the initial bridge with `listApps` and `getAppState` before wiring the remaining tools.
- QuickJS worker per run, memory/interrupt/wall limits.
- Opaque in-memory screenshots emitted as outer image blocks.
- Unit tests with a fake MCP server and deterministic fixture.

Exit criteria:

- Infinite loops are terminated.
- Guest cannot see Node globals/network/filesystem.
- No screenshot base64 appears in guest values, logs, or text output.
- Every handle/runtime/thread is cleaned up under success, rejection, and timeout.

### Phase 1 — Full Open Computer Use surface

- Expose all nine discovered OCU tools through the generated `computer.*` interface.
- Preserve every upstream schema, description, annotation, error, and runtime restriction.
- Serialize calls to preserve snapshot and `element_index` behavior.

Exit criteria:

- Fixture E2E covers observe→action→verify for all supported tools.
- Stale/unknown indices retain upstream behavior.
- Concurrent guest calls cannot reorder actions.

### Phase 2 — Hardening

- Separate executor OS process; platform sandbox profile where available.
- Dependency pinning/provenance/SBOM and security update process.
- Fuzz JSON marshalling, schema conversion, promise bridge, output serializer.
- Crash-only upstream restart and session invalidation.
- Metrics: startup, QuickJS heap, calls, timeouts, and attachment bytes.
- Cross-platform OCU tests on macOS/Windows/Linux desktop sessions.

### Phase 3 — Optional local workerd backend

Implement the same `Executor` interface with local `workerd`/Worker Loader to obtain closer parity with Cloudflare's V8 sandbox:

- trusted Node sidecar still owns OCU stdio;
- local parent Worker owns Dynamic Worker Loader;
- sidecar↔parent bridge is authenticated and loopback-only;
- `globalOutbound: null`, custom limits, fresh `load()` execution;
- typed attachments remain outside generated code.

This should be an optional backend, not a prerequisite for the local product.

---

## 11. Alternatives

### A. Local workerd Dynamic Worker + Node sidecar

**Pros:** closest to Cloudflare Code Mode; V8 semantics; runtime-enforced egress; can reuse `DynamicWorkerExecutor`; disposable isolates.  
**Cons:** OCU stdio still needs Node; bridge complexity; local endpoint/auth/lifecycle; more packaging.  
**Use when:** parity with Cloudflare is more important than MVP simplicity.

### B. Separate native QuickJS/quickjs-ng process

Run a small Rust/C/C++ executor process embedding QuickJS-ng and communicate over framed IPC.

**Pros:** OS-process boundary; direct use of memory/stack/interrupt C APIs; no Emscripten/Asyncify complexity; small engine.  
**Cons:** native builds/signing for three OSes; custom async host bridge; more release engineering.  
**Use when:** security hardening justifies native packaging.

### C. QuickJS/Wasm in Node worker thread (recommended)

**Pros:** TypeScript implementation; cross-platform npm packaging; fresh runtimes; hard thread termination; no local server.  
**Cons:** worker thread is not kernel isolation; careful manual handle/promise management; Wasm supply chain.  
**Use when:** best MVP tradeoff.

### D. Node `vm` / `AsyncFunction`

**Pros:** minimal code, native async.  
**Cons:** inappropriate for untrusted model-generated code; ambient-object mistakes are catastrophic; same heap/process. Cloudflare's README shows `AsyncFunction` only as a simple custom-executor illustration, not a secure recommendation ([executor example](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#the-executor-interface)).  
**Verdict:** reject as a security boundary.

### E. Container per execution

**Pros:** familiar OS isolation; Node/V8 and arbitrary dependencies; mature resource/network controls where available.  
**Cons:** Docker/Podman dependency, startup/packaging friction, desktop IPC complexity, host accessibility permissions do not naturally pass into containers.  
**Use when:** Linux server automation, not the first desktop-local implementation.

### F. Cloudflare-hosted supervisor with local remote-control agent

A deployed Worker runs Code Mode and invokes a local OCU gateway over an authenticated tunnel.

**Pros:** native Cloudflare stack, durable execution state, and remote access.  
**Cons:** no longer local-only; screenshots/accessibility trees leave the machine; tunnel and device authentication become critical; latency; privacy.  
**Verdict:** a distinct product, not an implementation of the requested local server.

### G. No code execution; expose the nine tools directly

**Pros:** simplest execution path; no generated-code sandbox.  
**Cons:** extra model round trips and intermediate-token cost; weaker orchestration.  
**Use when:** safety and inspectability dominate efficiency. Keep this as a fallback mode.

---

## 12. Testing strategy

### Deterministic tests

- Fake upstream MCP server reproducing text+image+error content.
- Catalog→TypeScript golden tests for every OCU schema.
- Identifier collision and malicious-description tests.
- Guest marshalling tests: undefined, bigint, cycles, deep values, huge strings, typed arrays, thrown errors.
- Promise bridge tests: resolve/reject, out-of-order host response, upstream rejection, and timeout while awaiting.
- Resource tests: repeated runs with no Wasm-handle, worker, child-request, or attachment growth.

### Security tests

Attempt access to:

- `process`, `require`, dynamic `import`, `fetch`, `WebSocket`, filesystem, env, timers not explicitly provided;
- constructor/prototype escape patterns;
- oversized args/results/logs;
- recursive/cyclic return values;
- `while(true)`, catastrophic regex, promise floods;
- guessed/reused attachment IDs;
- action before observation;
- stale index after upstream restart;
- concurrent actions and cancellation races.

### Integration tests

Use OCU's fixture/smoke paths for all nine tools where platform permits; its repository includes a deterministic fixture and end-to-end smoke suite ([architecture verification paths](https://github.com/iFurySt/open-codex-computer-use/blob/8dd6707412cf88dff00df22e299ee45beb7aebec/docs/ARCHITECTURE.md)). Tests must run in an actual signed-in desktop session for Windows UIA and Linux AT-SPI; headless SSH is insufficient according to the project architecture docs.

### Evaluations

Compare direct-tools and Code Mode on:

- success rate;
- model tokens and turns;
- number of OCU calls;
- incorrect/stale element-index actions;
- screenshot bytes returned;
- latency;
- recovery after UI mismatch.

Cloudflare recommends evals after tool/schema description changes ([Cloudflare MCP best practices](https://developers.cloudflare.com/agents/model-context-protocol/)).

---

## 13. Unresolved questions

1. **Which MCP host(s) must support the wrapper?** Mixed image rendering and cancellation behavior varies.
2. **Must this be one npm package with bundled OCU, or may it depend on a separately installed executable?** This affects provenance, permission onboarding, and updates.
3. **Should the wrapper manage one OCU child per MCP connection, per user session, or globally?** Per connection gives better isolation; global reuse risks cross-client snapshot leakage.
4. **What is the exact turn boundary?** OCU requires `get_app_state` once per assistant turn, but the wrapper reliably sees tool-call boundaries, not always the host's complete assistant turn. Sending `turn-ended` after each `computer_execute` is safe for cursor cleanup but may be stricter than necessary.
5. **How should images be selected?** “Latest,” explicitly referenced handles, and every action image have different token/privacy tradeoffs.
6. **Can OCU provide structured output schemas or a structured tree result?** Today its result is text plus image. Parsing text into rich objects may be brittle.
7. **Can OCU expose snapshot/version IDs and require them on actions?** That would materially improve stale-index handling.
8. **Is a Node worker thread sufficient for the intended threat level?** If generated code is treated as actively adversarial rather than merely buggy, an OS-process sandbox should move earlier.
9. **Original QuickJS or quickjs-ng Wasm variant?** quickjs-ng has active development and newer features; the exact quickjs-emscripten variant should be pinned and tested. Do not load QuickJS bytecode from untrusted sources: both original and ng docs warn that bytecode is version-specific and not security-checked ([QuickJS docs](https://bellard.org/quickjs/quickjs.html#Script-evaluation), [quickjs-ng C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/#script-evaluation)).
10. **Should generated code be allowed `Date`, randomness, or timers?** Removing them improves deterministic replay; retaining them improves convenience. Cloudflare's durable runtime treats nondeterminism as an explicit step boundary, but that machinery is beyond MVP ([current package docs](https://github.com/cloudflare/agents/blob/0efd545a58c9075885977627e5d853b6e98f6d54/packages/codemode/README.md#connectors)).
11. **How should updates to the nine-tool catalog be handled?** Runtime discovery can regenerate the interface, while a schema hash can make changes visible in logs and tests.

---

## 14. Concrete implementation decisions

| Decision | Recommendation |
|---|---|
| Outer transport | MCP stdio only for MVP. |
| Trusted host | Node.js/TypeScript. |
| Upstream transport | One child `open-computer-use mcp` stdio client per outer connection. |
| Guest engine | Pinned quickjs-ng-compatible `quickjs-emscripten` Wasm release variant. |
| Guest lifetime | Fresh runtime/context and Node worker thread per execution. |
| Guest API | `computer.*`; no generic host call primitive. |
| Tool discovery | Runtime discovery from OCU + schema hash. |
| Network | No guest network API/capability. |
| Files/process/env | None. |
| Ordering | Strictly sequential GUI calls. |
| Observation | Required per app per outer execution before action. |
| Screenshots | Opaque in guest; bounded memory store; real MCP image blocks outside. |
| Limits | Source, wall, CPU interrupt, memory, stack, calls, actions, pending promises, logs, result, attachment bytes. |
| Failure posture | Fail closed; restart child and invalidate snapshots after transport ambiguity. |
| Cloudflare library reuse | Reuse concepts/type-generation utilities where dependency fit is acceptable; implement a custom local `Executor` and custom image-aware MCP wrapper. |

## Final assessment

Cloudflare's architecture is the right conceptual model: generated code should run in a fresh sandbox that has **no ambient authority**, and every useful operation should arrive as an explicit object capability. The production mechanism—Dynamic Workers, Worker Loader, `ctx.exports`, and Workers RPC—is Cloudflare/workerd-specific. It can be exercised locally under Wrangler, but it is not directly embeddable in a normal desktop Node MCP server and does not solve access to a local stdio automation process.

For a genuinely local wrapper, QuickJS/quickjs-ng compiled to Wasm provides the closest practical equivalent. A trusted Node supervisor can own stdio, image attachments, schema translation, and process lifecycle while generated code sees only asynchronous `computer.*` methods. Fresh worker-thread runtimes, hard execution limits, strict marshalling, and serialized actions preserve most of Code Mode's efficiency without transferring desktop data to Cloudflare or granting generated code host access.

The wrapper should remain behaviorally thin around Open Computer Use: expose its complete discovered tool surface, preserve its errors and restrictions, and add no separate human-in-the-loop or action-policy process. Its depth comes from code isolation, orchestration, transport management, and image-aware result shaping.
