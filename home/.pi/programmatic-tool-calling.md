# Programmatic Tool Calling for Sol via `opencode-cloudflare`

## Summary

Implement OpenAI’s real Programmatic Tool Calling protocol entirely inside the `opencode-cloudflare` extension.

The extension will:

- Send the hosted `{ type: "programmatic_tool_calling" }` tool.
- Add `allowed_callers` to eligible pi function tools.
- Receive OpenAI-hosted `program` and `program_output` items.
- Project nested `function_call` items into ordinary pi tool calls.
- Let pi execute them through its existing tool lifecycle and permission hooks.
- Persist opaque program state in pi message signatures.
- Replay all state and preserve `caller` on `function_call_output`.
- Continue using `store: false`.
- Leave other models and providers on pi-ai’s existing streamers.

No changes to pi, pi-ai, or pi-coding-agent are required.

## Context / Current State

OpenAI routes currently follow:

```txt
pi agent
  -> streamOpencodeCloudflare()
  -> resolve RouteDescriptor
  -> buildDelegatedModel()
  -> streamSimpleOpenAIResponses()
  -> pi-ai convertResponsesTools()
  -> POST /openai/responses
  -> pi-ai processResponsesStream()
```

The existing pi-ai adapter:

- Projects every tool as a plain function.
- Cannot emit `programmatic_tool_calling`.
- Drops `allowed_callers` and `output_schema`.
- Does not recognize `program` or `program_output`.
- Does not preserve `function_call.caller`.

Relevant existing seams:

```ts
pi.registerProvider(PROVIDER_ID, {
  streamSimple: streamOpencodeCloudflare,
});
```

```ts
interface Tool {
  name: string;
  description: string;
  parameters: TSchema;
}
```

Pi tool calls already support an opaque persisted field:

```ts
interface ToolCall {
  readonly type: "toolCall";
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly thoughtSignature?: string;
}
```

Thinking blocks also support opaque persisted state:

```ts
interface ThinkingContent {
  readonly type: "thinking";
  readonly thinking: string;
  readonly thinkingSignature?: string;
  readonly redacted?: boolean;
}
```

These fields provide the compatibility seam needed to preserve Responses API items without changing pi’s message model.

## Goals

- Use OpenAI-hosted V8 programs, not local JavaScript emulation.
- Enable the feature per OpenAI model through the local overlay.
- Preserve stateless Responses API continuation across:
  - pi tool execution;
  - multiple nested tool batches;
  - session persistence and resume;
  - branching and forking.
- Preserve direct tool calling when configured.
- Route every client-owned nested call through normal pi execution.
- Preserve `tool_call`, permission, interceptor, result, and rendering behavior.
- Keep existing OpenAI behavior unchanged for models without the option.
- Preserve `onPayload`, `onResponse`, cancellation, usage, and cost handling.

## Non-Goals

- Modifying pi-ai or pi-coding-agent.
- Executing generated programs locally.
- Inferring `output_schema` from pi tool result types.
- Supporting OpenAI tool search or deferred tools.
- Exposing pi tools as OpenAI-hosted shell, MCP, or apply-patch tools.
- Using stored Responses or `previous_response_id`.
- Enabling the feature automatically for every OpenAI model.
- Persisting private overlay model identifiers in tracked tests or documentation.

## Invariants

1. Generated JavaScript executes only in OpenAI’s hosted runtime.
2. Every client-owned function call is executed by pi.
3. Existing pi tool hooks and approval boundaries remain active.
4. A programmatic `caller` is replayed unchanged.
5. Responses output items retain their original order.
6. Continuation correctness never depends on in-memory extension state.
7. Opaque state is replayed only for the same logical visible model.
8. The API token is never placed in message signatures, errors, or tests.
9. A completed `call_id` is never executed twice.
10. Malformed API or persisted state fails closed.
11. Models without an enabled policy continue using pi-ai’s adapter.
12. Requests remain `store: false`.

## Design Constraints

- Pi messages cannot directly represent `program` or `program_output`.
- Pi’s `Tool` contract has no `allowed_callers` or `output_schema`.
- Tool handlers are owned by pi and unavailable inside the provider adapter.
- The configured visible model ID may differ from the upstream request model ID.
- The installed OpenAI SDK does not type Programmatic Tool Calling.
- Cloudflare AI Gateway support must be proven with a live probe.
- The extension’s existing tests use Node scripts and recording `fetch` substitutes.

## Alternatives Considered

### Option 1: Custom Responses adapter inside the extension

Own request projection, SSE parsing, state encoding, and continuation for opted-in routes.

```txt
OpenAI program
  -> nested function_call
  -> pi ToolCall
  -> pi tool execution
  -> ToolResultMessage
  -> function_call_output with caller
  -> OpenAI program resumes
```

**Advantages**

- Satisfies the extension-only constraint.
- Uses the real hosted runtime.
- Preserves pi’s execution and approval lifecycle.
- Can persist state through existing opaque signature fields.
- Limits custom behavior to opted-in models.

**Costs**

- Must reproduce the relevant parts of pi-ai’s Responses message conversion.
- Requires parity tests to protect against upstream drift.

### Option 2: Custom adapter with in-memory program state

Keep programs and callers in a `Map` keyed by response or session ID.

**Advantages**

- Smaller serialization implementation.
- No hidden message blocks.

**Rejected because**

- Breaks on `/reload`, restart, resume, fork, clone, and process failure.
- Session IDs alone do not identify branches safely.
- Violates the no-in-memory-correctness invariant.

### Option 3: Execute nested tools inside the provider adapter

Have the adapter run tools while processing one Responses request.

**Rejected because**

- `Context.tools` contains schemas, not handlers.
- Would bypass pi’s tool hooks, permission gates, rendering, mutation queues, and session records.
- Would duplicate pi’s agent loop.

### Option 4: Modify pi-ai and pi-coding-agent

Add hosted tools and program items to the shared message model.

**Advantages**

- Cleanest generic upstream design.
- Benefits every Responses provider.

**Rejected for this change**

- Violates the extension-only constraint.
- Requires coordinated package releases.
- Expands scope beyond the controlled extension.

## Recommendation

Use **Option 1**: an opt-in custom Responses adapter in `opencode-cloudflare`.

The overlay enables it through:

```jsonc
{
  "provider": {
    "openai": {
      "models": {
        "<sol-overlay-model>": {
          "options": {
            "programmatic_tool_calling": {
              "allowed_callers": ["direct", "programmatic"]
            }
          }
        }
      }
    }
  }
}
```

Supported policies:

```ts
type AllowedCallerPolicy =
  | readonly ["programmatic"]
  | readonly ["direct", "programmatic"];
```

The policy applies to every active pi tool in `Context.tools`. Absence disables the feature.

## Proposed Design

### Domain Model and Types

```ts
export type ProgrammaticToolCallingPolicy =
  | {
      readonly _tag: "Disabled";
    }
  | {
      readonly _tag: "Enabled";
      readonly allowedCallers:
        | readonly ["programmatic"]
        | readonly ["direct", "programmatic"];
    };
```

```ts
export class InvalidProgrammaticToolCallingConfig extends Error {
  readonly _tag = "InvalidProgrammaticToolCallingConfig";

  constructor(
    readonly path: "options.programmatic_tool_calling.allowed_callers",
    readonly reason: "missing-programmatic" | "invalid-caller" | "invalid-shape",
  ) {
    super(`Invalid Programmatic Tool Calling configuration at ${path}: ${reason}`);
  }
}
```

Invalid startup configuration is treated as startup misconfiguration and fails without including the raw value.

```ts
export function parseProgrammaticToolCallingPolicy(
  options: unknown,
): ProgrammaticToolCallingPolicy;
```

### Protocol DTOs

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type ProgramCallerDto = {
  readonly type: "program";
  readonly caller_id: string;
};

type FunctionCallItemDto = {
  readonly type: "function_call";
  readonly id: string;
  readonly call_id: string;
  readonly name: string;
  readonly arguments: string;
  readonly caller?: ProgramCallerDto;
};

type ProgramItemDto = {
  readonly type: "program";
  readonly id: string;
  readonly call_id: string;
  readonly code: string;
  readonly fingerprint: string;
};

type ProgramOutputItemDto = {
  readonly type: "program_output";
  readonly id: string;
  readonly call_id: string;
  readonly result: string;
  readonly status: "completed" | "incomplete";
};
```

The adapter validates mandatory fields but retains the complete parsed JSON object for exact stateless replay.

### Persisted Opaque State

```ts
type StoredResponsesItemV1 = {
  readonly owner: "opencode-cloudflare";
  readonly protocol: "openai-responses";
  readonly version: 1;
  readonly kind: "output-item";
  readonly item: Readonly<Record<string, JsonValue>>;
};
```

Encoded form:

```txt
opencode-cloudflare:openai-responses:v1:<JSON>
```

Projection:

| OpenAI item | Pi representation |
|---|---|
| `reasoning` | Normal `ThinkingContent` with raw item signature |
| `message` | `TextContent` with response item ID signature |
| `function_call` | `ToolCall`; raw item in `thoughtSignature` |
| `program` | Empty redacted `ThinkingContent`; raw item in signature |
| `program_output` | Empty redacted `ThinkingContent`; raw item in signature |

Hidden state block:

```ts
{
  type: "thinking",
  thinking: "",
  redacted: true,
  thinkingSignature: encodeStoredResponsesItem(item),
}
```

### Route Contract

```ts
export interface RouteDescriptor {
  readonly backend: Backend;
  readonly api: Api;
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestModelId?: string;
  readonly responseVerbosity?: ResponseVerbosity;
  readonly reasoningContext?: ReasoningContext;
  readonly programmaticToolCalling: ProgrammaticToolCallingPolicy;
  readonly compat?: Model<Api>["compat"];
}
```

### Streamer Contract

Visible and request models remain separate so aliases do not break state identity:

```ts
export interface ProgrammaticResponsesInput {
  readonly visibleModel: Model<Api>;
  readonly requestModel: Model<"openai-responses">;
  readonly context: Context;
  readonly options: SimpleStreamOptions;
  readonly policy: Extract<
    ProgrammaticToolCallingPolicy,
    { readonly _tag: "Enabled" }
  >;
}
```

```ts
export function streamProgrammaticOpenAIResponses(
  input: ProgrammaticResponsesInput,
): AssistantMessageEventStream;
```

### HTTP Test Seam

```ts
type Result<T, E> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

export interface ResponsesTransport {
  open(
    request: ResponsesHttpRequest,
  ): Promise<Result<Response, ResponsesTransportFailed>>;
}
```

Production uses `fetch`; tests use a recording transport returning real SSE `Response` bodies.

### Request Projection

For every active pi tool:

```ts
{
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
  strict: false,
  allowed_callers: policy.allowedCallers,
}
```

Append:

```ts
{ type: "programmatic_tool_calling" }
```

Do not add `output_schema` until pi exposes a truthful output contract.

### Function Output Projection

```ts
type CompletedCallIndex = ReadonlyMap<
  string,
  {
    readonly caller?: ProgramCallerDto;
    readonly output: string;
  }
>;
```

```ts
{
  type: "function_call_output",
  call_id: toolResult.toolCallId,
  output: projectToolResultToText(toolResult),
  ...(caller === undefined ? {} : { caller }),
}
```

For image-only tool results, use the existing textual placeholder rather than claiming a structured or image output schema.

## Seams, Boundaries, Adapters, and Implementations

### Configuration boundary

```txt
JSONC bytes
  -> JSON.parse(): unknown
  -> options.programmatic_tool_calling: unknown
  -> parseProgrammaticToolCallingPolicy()
  -> ProgrammaticToolCallingPolicy
  -> RouteDescriptor
```

### Responses boundary

```txt
SSE bytes
  -> SSE frame parser
  -> JSON.parse(): unknown
  -> parseResponsesStreamEvent()
  -> typed protocol event
  -> pi content projection
```

No decoded response is cast directly to a protocol type.

### Pi execution seam

Nested calls are emitted as ordinary:

```ts
{
  type: "toolCall",
  id: `${callId}|${itemId}`,
  name,
  arguments,
  thoughtSignature: encodeStoredResponsesItem(rawFunctionCall),
}
```

Pi continues to own:

- argument validation;
- `tool_call` interception;
- permission gates;
- parallel execution;
- mutation queues;
- cancellation;
- result rendering;
- session persistence.

## Call Stacks and Data Flow

### Current / Old Flow

```txt
streamOpencodeCloudflare()
  -> resolveRoute()
  -> buildDelegatedModel()
  -> createDelegatedStream()
  -> streamSimpleOpenAIResponses()
  -> pi-ai payload conversion
  -> POST /openai/responses
  -> pi-ai response conversion
  -> normalized pi events
```

### Proposed / New Flow: Disabled Route

Unchanged:

```txt
policy = Disabled
  -> streamSimpleOpenAIResponses()
```

### Proposed / New Flow: Initial Programmatic Request

```txt
streamOpencodeCloudflare()
  -> resolveRoute()
  -> policy = Enabled
  -> build visible/request model pair
  -> streamProgrammaticOpenAIResponses()
      -> convert context messages
      -> project tools with allowed_callers
      -> append programmatic_tool_calling
      -> apply onPayload
      -> ResponsesTransport.open()
      -> invoke onResponse
      -> parse SSE events
```

### Program Pauses for Client Tools

```txt
response.output_item.done(program)
  -> validate ProgramItemDto
  -> persist as hidden ThinkingContent

response.output_item.done(function_call with caller)
  -> validate FunctionCallItemDto
  -> parse arguments object
  -> reject duplicate completed call_id
  -> emit pi ToolCall with raw item signature

stream completes
  -> stopReason = "toolUse"
  -> pi executes calls through normal tool lifecycle
```

### Program Resumes

```txt
next pi provider turn
  -> Context messages
  -> identify same logical visible model
  -> decode hidden program item
  -> decode raw function_call item
  -> locate corresponding ToolResultMessage
  -> project function_call_output
  -> copy original caller unchanged
  -> POST stateless replay
  -> hosted program resumes
```

Required input ordering:

```txt
program
function_call A
function_call B
function_call_output A
function_call_output B
program_output
message
```

### Internal Continuation

If a response has no pending `function_call` and no final `message`:

```txt
response output
  -> append parsed output items to local replay input
  -> issue next store:false request
  -> repeat until message, tool call, cancellation, or guard failure
```

Use:

```ts
const MAX_INTERNAL_CONTINUATIONS_PER_TURN = 8;
```

Exceeding the guard produces `ProgramContinuationLimitExceeded`.

### Failure Flow

```txt
invalid overlay option
  -> InvalidProgrammaticToolCallingConfig
  -> extension startup fails safely

HTTP rejection
  -> parse known gateway error fields
  -> safe provider error
  -> pi error event

malformed SSE / item / caller
  -> ResponsesProtocolFailed
  -> pi error event
  -> no tool execution

corrupt persisted signature
  -> ProgramStateDecodeFailed
  -> pi error event
  -> no partial replay

duplicate completed call_id
  -> DuplicateFunctionCall
  -> pi error event
  -> no repeated side effect
```

### Retry / Cancellation / Idempotency Flow

- Propagate `options.signal` through fetch and stream reads.
- Compose `timeoutMs` without replacing caller cancellation.
- Classify caller abort as `stopReason: "aborted"`.
- Do not automatically retry a response after stream consumption begins.
- Persist all completed function outputs in conversation history.
- Reject an API-emitted `call_id` already completed in context.
- Replaying a failed continuation resends the same program fingerprint and outputs; it does not re-execute completed pi tools.

### Observability Flow

Preserve existing hooks:

```txt
final request payload
  -> options.onPayload
  -> HTTP request
  -> options.onResponse(status, headers)
```

No new logging framework exists in this extension, so none is introduced.

Safe diagnostic fields:

- operation;
- HTTP status;
- SSE event type;
- output item type;
- continuation count;
- stable error tag;
- non-secret call ID.

Never log or include in errors:

- gateway token;
- full request payload;
- generated program code;
- tool arguments or results;
- program fingerprints;
- raw unknown response bodies.

## Files to Add / Change / Delete

### Add

#### `agent/extensions/opencode-cloudflare/programmatic-tool-calling.ts`

Owns:

- policy types;
- overlay option parser;
- startup configuration error;
- state-envelope encoding and decoding;
- same-logical-model predicate.

#### `agent/extensions/opencode-cloudflare/openai-programmatic-responses.ts`

External Adapter Module owning:

- request projection;
- context conversion;
- SSE parsing;
- response item parsing;
- program state projection;
- caller preservation;
- internal continuation;
- usage and cost calculation;
- cancellation and safe failures;
- production fetch transport and test factory.

#### `test/programmatic-tool-calling-config-regression.mjs`

Proves overlay-to-route configuration behavior.

#### `test/programmatic-tool-calling-regression.mjs`

Proves payload projection, pause, pi-tool projection, replay, caller preservation, and final completion.

### Change

#### `catalog.ts`

- Add `programmaticToolCalling` to `RouteDescriptor`.
- Parse the option for OpenAI routes.
- Default every other route to `Disabled`.

#### `dispatch.ts`

Route enabled OpenAI models to the custom adapter:

```ts
if (
  route.api === "openai-responses" &&
  route.programmaticToolCalling._tag === "Enabled"
) {
  return streamProgrammaticOpenAIResponses(...);
}
```

Keep the current delegated streamer for disabled routes.

#### `README.md`

Document:

- overlay option;
- real hosted execution;
- caller policies;
- string-based tool outputs;
- gateway/model preview requirement;
- security behavior.

#### `package.json`

Add the two new regression scripts to `check`. No new runtime dependency is required.

### Delete

None.

## RGR TDD Test Plan

### Slice 1: Configuration

**RED**

An overlay with:

```json
{
  "allowed_callers": ["direct", "programmatic"]
}
```

does not currently produce an enabled route.

**GREEN**

Add the parser and route field.

Verify malformed shapes fail with only path and reason.

### Slice 2: Initial API Payload

**RED**

An enabled route does not send hosted Programmatic Tool Calling or `allowed_callers`.

**GREEN**

Add the custom request projector.

Assert observable captured request body:

- `store: false`;
- hosted tool present;
- every function has configured callers;
- existing reasoning and verbosity options remain;
- encrypted reasoning is included.

### Slice 3: Program State Projection

**RED**

A `program` item is currently discarded.

**GREEN**

Project it into a hidden redacted thinking block.

Round-trip the block through encode/decode and JSON session serialization.

### Slice 4: Nested Function Calls

**RED**

A nested function call loses its `caller`.

**GREEN**

Emit a normal pi ToolCall with the raw function item signature.

Assert:

- tool name and arguments;
- stable `call_id|item_id`;
- stop reason `toolUse`;
- caller survives signature decoding.

### Slice 5: Stateless Resume

**RED**

Tool results currently replay without `caller` or prior program state.

**GREEN**

Build the next request from the previous assistant message and tool results.

Assert exact item ordering and unchanged `caller`.

### Slice 6: Program Completion

**RED**

`program_output` is dropped and no final message is produced.

**GREEN**

Persist program output and process the final message.

Assert final text, usage, cost, and `stopReason: "stop"`.

### Slice 7: Internal Continuation

**RED**

A response with no function call and no final message returns an empty turn.

**GREEN**

Continue internally with replayed items.

Assert bounded continuation and caller cancellation.

### Slice 8: Failure and Idempotency

Add one behavior at a time:

1. Malformed persisted envelope fails closed.
2. Invalid function arguments do not execute a tool.
3. Missing or malformed program caller fails.
4. Duplicate completed call IDs are rejected.
5. HTTP abort produces `aborted`.
6. Unknown harmless SSE event types are ignored.
7. Unknown required output item types produce a protocol failure.

### Slice 9: Compatibility

Verify through the public stream interface:

- Direct calls still work when callers include `direct`.
- Programmatic-only policy removes direct eligibility.
- State from another logical model is not replayed.
- Visible model aliases remain same-model even when request IDs differ.
- Disabled routes still use the existing pi-ai streamer.

### Slice 10: Live Gateway Probe

Use an environment-provided model ID; never commit the private value.

Prove:

1. Cloudflare accepts `programmatic_tool_calling`.
2. The response contains a real `program` item.
3. Two nested read-only calls can be returned.
4. Pi executes them.
5. Outputs resume the same program.
6. A final assistant message arrives.

This is the only test that proves Cloudflare and the limited-preview model support the feature end to end.

## Risks and Open Questions

- **Gateway support:** Cloudflare may reject or strip the new tool fields or SSE item types. The live probe is required.
- **Preview availability:** The configured Sol route may not have Programmatic Tool Calling enabled despite model-level documentation.
- **Missing output schemas:** Pi tools currently return textual content. The API must accept programmatic tools without `output_schema`; verify live.
- **Protocol drift:** The installed OpenAI SDK lacks these types. The boundary parser must tolerate unknown optional fields while rejecting malformed required fields.
- **Session representation:** Hidden redacted blocks are supported by pi’s types and transformation logic, but persistence/resume must be proven by regression test.
- **Tool mutations:** The raw provider function item remains authoritative for replay even if a pi `tool_call` hook mutates execution arguments.
- **Program side effects:** Programmatic calls still reach pi’s normal approval hooks, but users should not enable programmatic access for tools they would not permit the model to call repeatedly.


<documentation>
# Programmatic Tool Calling

Programmatic Tool Calling lets a model write and run JavaScript that coordinates the tools in a Responses API request. A program can call tools in parallel, use loops and conditions, and keep intermediate results in the hosted runtime. This is useful when a task needs a sequence of related tool calls or needs to process large tool outputs before returning a result.

Your application decides whether Programmatic Tool Calling is available and which eligible tools the model can call directly, from a program, or either way. It continues to run any client-owned tool calls.

Check the [model page](https://developers.openai.com/api/docs/models) before enabling Programmatic Tool Calling.

## Understand the runtime environment

OpenAI runs each generated program in a fresh, isolated V8 runtime. The runtime supports JavaScript with top-level `await`, but it does not provide Node.js, package installation, direct network access, a general-purpose filesystem, subprocess execution, a console, or persistent JavaScript state between program executions. Programs can interact with external systems only through tools enabled in the request and can emit output with `text(...)` or `image(...)`.

Programmatic Tool Calling supports Zero Data Retention (ZDR) workflows without requiring a persistent code-execution container. ZDR must be enabled for the organization or project; setting `store: false` enables stateless continuation but does not enable ZDR by itself. Eligibility and retention depend on the complete request, including its model, tools, and third-party services; see [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Choose when to use Programmatic Tool Calling

Use Programmatic Tool Calling when a stage has predictable control flow and code can return a smaller structured result. Use direct tool calling when one call is sufficient, each result requires fresh model judgment, or the work requires approval or preservation of citations or native artifacts.

| Task shape                                                                                       | Recommended mode                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| A single lookup or action                                                                        | Use direct tool calling.                                                                                             |
| Several results that code can filter, join, rank, remove duplicates from, aggregate, or validate | Use Programmatic Tool Calling when the program can return a smaller structured result.                               |
| Dependent calls with predictable data flow                                                       | Use Programmatic Tool Calling when code can derive later arguments and the limits and failure behavior are explicit. |
| Adaptive search or semantic evaluation                                                           | Use direct tool calling when each result should influence the model's next decision.                                 |
| Writes or approval-sensitive actions                                                             | Use direct tool calling by default to preserve a clear authorization boundary.                                       |
| Final citation or native artifact validation                                                     | Use direct tool calling unless the program preserves the native output and validates every required item.            |

## Configure Programmatic Tool Calling

Add the `programmatic_tool_calling` hosted tool to the request. Then set `allowed_callers` on each eligible tool that the program can invoke.

Enable Programmatic Tool Calling

```json
[
  {
    "type": "function",
    "name": "get_inventory",
    "description": "Return an object with sku (string) and available_units (number).",
    "parameters": {
      "type": "object",
      "properties": {
        "sku": { "type": "string" }
      },
      "required": ["sku"],
      "additionalProperties": false
    },
    "output_schema": {
      "type": "object",
      "properties": {
        "sku": { "type": "string" },
        "available_units": { "type": "number" }
      },
      "required": ["sku", "available_units"],
      "additionalProperties": false
    },
    "allowed_callers": ["programmatic"]
  },
  {
    "type": "programmatic_tool_calling"
  }
]
```


`allowed_callers` controls how the model can invoke a tool:

| Value                        | Behavior                                                |
| ---------------------------- | ------------------------------------------------------- |
| Omitted or `["direct"]`      | The model can call the tool directly.                   |
| `["programmatic"]`           | Only code in a `program` item can call the tool.        |
| `["direct", "programmatic"]` | The model can call the tool directly or from a program. |

`parameters` describes the function arguments. When a function returns predictable structured data, `output_schema` describes the JSON object encoded in its `function_call_output.output` string. Define both so generated JavaScript can use the returned fields reliably.

### Supported tools

The following tool types support `allowed_callers: ["programmatic"]`:

- `function` and `custom`
- `mcp`
- `apply_patch`
- Local and hosted `shell`
- `code_interpreter`

For MCP tools, the tool's `require_approval` policy can pause the program until you approve the call.

For OpenAI-hosted tools, review the tool's data-retention and security guidance before enabling it in a program.

### Combine with tool search

[Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) runs as a top-level Responses API tool, not from inside generated JavaScript. Function, custom, and MCP tools with `defer_loading: true` are not initially available to a program. After the model loads a matching tool, a later program can invoke it through `tools.*` when its `allowed_callers` includes `"programmatic"`. An already-running program cannot invoke tool search, so the model must load deferred tools before starting a program that needs them.

## Guide routing when both modes are available

When your application lets the model call a function directly or from a program, assign each route to a specific workflow stage. Generic instructions such as "use Programmatic Tool Calling efficiently" don't identify the intended boundary. For example:

```text
<tool_orchestration>
Use Programmatic Tool Calling for [bounded stage] using only [eligible tools].
Run independent calls concurrently when safe. Use only documented tool input
and output fields.

Process and reduce the intermediate results, then emit exactly [program result shape],
including the evidence needed for the final answer.

Stop when [condition] is met. Retry transient failures at most [R] times.
Do not repeat completed calls or perform side-effecting actions. If a required
result is still missing, return a clear structured failure.

Use direct tool calls for [semantic judgment, approval, or final validation].
</tool_orchestration>
```

Here is an example of how to use this template:

```text
<tool_orchestration>
Use Programmatic Tool Calling to compare inventory with demand for sku_123
using only get_inventory and get_demand. Run both calls concurrently. Use
only documented tool input and output fields.

Process and reduce the intermediate results, then emit exactly one JSON object
with sku, available_units, requested_units, and shortage_units, where
shortage_units is max(requested_units - available_units, 0). Include
available_units and requested_units as evidence for the calculation.

Stop when both tool results contain the required fields. Retry transient
failures at most 1 time. Do not repeat completed calls or perform
side-effecting actions. If a required result is still missing, return a clear
structured failure.

Use direct tool calls only for approval before any inventory-changing action.
</tool_orchestration>
```

For workflows that need both modes, define one handoff and avoid switching routes or repeating work. If a safe fallback exists, define it once and limit its retries.

## Understand program response items

Each API call still returns the standard [Responses API object](https://developers.openai.com/api/reference/resources/responses/methods/create). Programmatic Tool Calling doesn't introduce a separate response envelope. When the model uses Programmatic Tool Calling, the response's `output` array can contain:

- A `program` item containing the generated JavaScript, a `call_id`, and an opaque `fingerprint` used to resume or replay the program.
- A `function_call` item made by the program. It has its own `call_id`, which your application uses to return the function result. Its `caller.caller_id` matches the program's `call_id`.
- A `program_output` item containing the program's final result and status. Its `call_id` matches the program's `call_id`, and its `status` is `completed` or `incomplete`.

These are separate top-level items in `response.output`; the `caller` field records their execution relationship.

For example, a program can pause while your application runs `get_inventory` and `get_demand`:

Program and nested function calls

```json
[
  {
    "type": "program",
    "id": "prog_123",
    "call_id": "call_prog_123",
    "code": "const [stock, demand] = await Promise.all([tools.get_inventory({ sku: 'sku_123' }), tools.get_demand({ sku: 'sku_123' })]); text(JSON.stringify({ sku: stock.sku, available_units: stock.available_units, requested_units: demand.requested_units, shortage_units: Math.max(demand.requested_units - stock.available_units, 0) }));",
    "fingerprint": "opaque_replay_state"
  },
  {
    "type": "function_call",
    "id": "fc_123",
    "call_id": "call_inventory_123",
    "name": "get_inventory",
    "arguments": "{\\"sku\\":\\"sku_123\\"}",
    "caller": {
      "type": "program",
      "caller_id": "call_prog_123"
    }
  },
  {
    "type": "function_call",
    "id": "fc_456",
    "call_id": "call_demand_123",
    "name": "get_demand",
    "arguments": "{\\"sku\\":\\"sku_123\\"}",
    "caller": {
      "type": "program",
      "caller_id": "call_prog_123"
    }
  }
]
```


These examples show only the relevant items from `response.output`; they omit the surrounding standard Responses object. After your application returns the nested function results, a later response can contain the complete `program_output` item:

Program output

```json
{
  "type": "program_output",
  "id": "prog_out_123",
  "call_id": "call_prog_123",
  "result": "{\\"sku\\":\\"sku_123\\",\\"available_units\\":42,\\"requested_units\\":31,\\"shortage_units\\":0}",
  "status": "completed"
}
```


The JSON string in `program_output.result` follows the program result shape from your instructions. The surrounding `program_output` item follows the API contract shown above. These are separate contracts. A final `message` can arrive with the program output or in a later response, so continue until you receive that message.

OpenAI runs the model-generated JavaScript in the hosted runtime. Your application executes returned client-owned function calls; it does not execute the generated JavaScript.

Return the function result as a `function_call_output`. Copy `caller` from the function call without changing it. The service uses that value to resume the correct program.

## Continue after client-owned function calls

A program can pause more than once as it reaches client-owned tools. Continue until the response contains a final assistant message:

1. Send the request with the hosted tool and functions that allow programmatic calls.
1. Run every returned client-owned function call.
1. Return each function result with the original `call_id` and `caller`.
1. Handle an incomplete response before continuing.
1. If the response contains no pending `function_call` items and no final `message` item, continue from that response. With `store: false`, replay its output items; for a stored response, use `previous_response_id`.
1. Stop when the response contains a final `message` item. Read `response.output_text` or the message's refusal content.

The following example uses `store: false`, preserves every response item, and returns each function result to the program:

Run a programmatic tool-calling loop

```javascript
import OpenAI from "openai";

const client = new OpenAI();

const implementations = {
  get_inventory: async ({ sku }) => ({ sku, available_units: 42 }),
  get_demand: async ({ sku }) => ({ sku, requested_units: 31 }),
};

const tools = [
  {
    type: "function",
    name: "get_inventory",
    description:
      "Return an object with sku (string) and available_units (number).",
    parameters: {
      type: "object",
      properties: { sku: { type: "string" } },
      required: ["sku"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        available_units: { type: "number" },
      },
      required: ["sku", "available_units"],
      additionalProperties: false,
    },
    allowed_callers: ["programmatic"],
  },
  {
    type: "function",
    name: "get_demand",
    description:
      "Return an object with sku (string) and requested_units (number).",
    parameters: {
      type: "object",
      properties: { sku: { type: "string" } },
      required: ["sku"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        requested_units: { type: "number" },
      },
      required: ["sku", "requested_units"],
      additionalProperties: false,
    },
    allowed_callers: ["programmatic"],
  },
  { type: "programmatic_tool_calling" },
];

const input = [
  {
    role: "user",
    content: "Compare inventory with demand for sku_123.",
  },
];

while (true) {
  const response = await client.responses.create({
    model: "YOUR_MODEL_ID",
    store: false,
    input,
    tools,
    include: ["reasoning.encrypted_content"],
  });

  if (response.status !== "completed") {
    throw new Error(`Response ended with status ${response.status}`);
  }

  // Preserve every output item, including program and reasoning items.
  input.push(...response.output);

  const calls = response.output.filter(
    (item) => item.type === "function_call",
  );

  if (calls.length === 0) {
    const message = response.output.find((item) => item.type === "message");
    if (message) {
      const refusal = message.content.find((part) => part.type === "refusal");
      console.log(response.output_text || refusal?.refusal || "");
      break;
    }
    continue;
  }

  const outputs = await Promise.all(
    calls.map(async (call) => {
      const run = implementations[call.name];
      if (!run) throw new Error(`Unknown tool: ${call.name}`);

      const result = await run(JSON.parse(call.arguments));
      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
        // Preserve caller so the runtime can resume the correct program.
        caller: call.caller,
      };
    }),
  );

  input.push(...outputs);
}
```

```python
import json
from openai import OpenAI

client = OpenAI()


def get_inventory(sku):
    return {"sku": sku, "available_units": 42}


def get_demand(sku):
    return {"sku": sku, "requested_units": 31}


implementations = {
    "get_inventory": get_inventory,
    "get_demand": get_demand,
}

tools = [
    {
        "type": "function",
        "name": "get_inventory",
        "description": "Return an object with sku (string) and available_units (number).",
        "parameters": {
            "type": "object",
            "properties": {"sku": {"type": "string"}},
            "required": ["sku"],
            "additionalProperties": False,
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
                "available_units": {"type": "number"},
            },
            "required": ["sku", "available_units"],
            "additionalProperties": False,
        },
        "allowed_callers": ["programmatic"],
    },
    {
        "type": "function",
        "name": "get_demand",
        "description": "Return an object with sku (string) and requested_units (number).",
        "parameters": {
            "type": "object",
            "properties": {"sku": {"type": "string"}},
            "required": ["sku"],
            "additionalProperties": False,
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
                "requested_units": {"type": "number"},
            },
            "required": ["sku", "requested_units"],
            "additionalProperties": False,
        },
        "allowed_callers": ["programmatic"],
    },
    {"type": "programmatic_tool_calling"},
]

input_items = [
    {
        "role": "user",
        "content": "Compare inventory with demand for sku_123.",
    }
]

while True:
    response = client.responses.create(
        model="YOUR_MODEL_ID",
        store=False,
        input=input_items,
        tools=tools,
        include=["reasoning.encrypted_content"],
    )

    if response.status != "completed":
        raise RuntimeError(f"Response ended with status {response.status}")

    # Preserve every output item, including program and reasoning items.
    input_items.extend(
        item.model_dump(exclude_none=True) for item in response.output
    )

    calls = [item for item in response.output if item.type == "function_call"]
    if not calls:
        message = next((item for item in response.output if item.type == "message"), None)
        if message:
            refusal = next(
                (part.refusal for part in message.content if part.type == "refusal"),
                "",
            )
            print(response.output_text or refusal)
            break
        continue

    for call in calls:
        run = implementations.get(call.name)
        if run is None:
            raise ValueError(f"Unknown tool: {call.name}")

        result = run(**json.loads(call.arguments))
        input_items.append(
            {
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": json.dumps(result),
                # Preserve caller so the runtime can resume the correct program.
                "caller": call.caller.model_dump() if call.caller else None,
            }
        )
```


When you store responses, you can continue from `previous_response_id` instead of resending all earlier response items. Send the new `function_call_output` items as the next input. With `store: false`, replay the complete sequence in order, including every `program`, reasoning, function-call, function-call-output, and `program_output` item.

For stateless reasoning-model requests, include `reasoning.encrypted_content` and replay the returned reasoning items. See [conversation state](https://developers.openai.com/api/docs/guides/conversation-state#manually-manage-conversation-state) for the general stateless pattern.

## Design tools for programs

- Return structured, compact data that JavaScript can inspect without parsing prose.
- Use `output_schema` to define each tool's expected return fields and types, and document its error behavior. If the return shape isn't known in advance, keep the tool direct so the model can inspect the result.
- Define the exact program result shape and required evidence. Return a clear structured failure when the program can't produce a valid result.
- Make function calls idempotent when possible. A retry or replay shouldn't repeat an unsafe side effect.
- Check arguments and permissions for each call in your application, even when it comes from a hosted program.
- Give tools specific names and descriptions so the model can compose them correctly.
- Require application-level approval before high-impact actions, regardless of the caller.

{/* vale Vale.Terms = NO */}

## Evaluate Programmatic Tool Calling

Programmatic Tool Calling can reduce the amount of intermediate tool output added to model context, but the effect depends on the task and tool responses. Start with direct tool calling as a baseline, then compare both approaches on representative tasks.

Define the final-answer quality bar and required evidence before measuring efficiency. Evaluate token use and tool calls alongside correctness, completeness, and evidence coverage, and make any accepted quality tradeoff explicit.

{/* vale Vale.Terms = YES */}

Measure:

- Final-answer correctness, completeness, and evidence coverage.
- Input and total tokens, end-to-end latency, and cost.
- Model turns, tool calls, retries, and recovery behavior.
- Safety outcomes, especially for side effects and approval requirements.
- Whether the route that ran matched the intended workflow stage.

## Related guides

- Use [function calling](https://developers.openai.com/api/docs/guides/function-calling) to define client-owned functions.
- Use [tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) to defer large tool definitions until a model needs them.
- Use [conversation state](https://developers.openai.com/api/docs/guides/conversation-state) to continue stored or stateless Responses API requests.
- Review [data controls](https://developers.openai.com/api/docs/guides/your-data) before choosing a storage mode.
</documentation>
