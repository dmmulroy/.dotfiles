import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-programmatic-"));
const overlayPath = path.join(tempDir, "overlay.jsonc");
fs.writeFileSync(overlayPath, JSON.stringify({
  provider: {
    openai: {
      models: {
        "fixture-programmatic-model": {
          id: "fixture-programmatic-request-model",
          name: "Fixture Programmatic Model",
          reasoning: true,
          options: {
            text: { verbosity: "medium" },
            reasoning: { context: "all_turns" },
            programmatic_tool_calling: {
              allowed_callers: ["direct", "programmatic"],
            },
          },
        },
      },
    },
  },
}));
process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG = overlayPath;

const { streamOpencodeCloudflare } = await import("../dispatch.ts");
const { decodeStoredResponsesItem } = await import("../programmatic-tool-calling.ts");
const {
  createProgrammaticOpenAIResponsesStreamer,
  ResponsesTransportFailed,
} = await import("../openai-programmatic-responses.ts");
const capturedRequests = [];
const observedPayloads = [];
const finalResponseMessage = {
  type: "message",
  id: "msg_fixture_final",
  role: "assistant",
  status: "completed",
  content: [{
    type: "output_text",
    text: "Checked two files.",
    annotations: [{
      type: "url_citation",
      start_index: 0,
      end_index: 7,
      url: "https://example.com/files",
      title: "Files",
    }],
  }],
};
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.endsWith("/.well-known/opencode")) {
    return new Response("gateway config unavailable in test", { status: 503 });
  }

  capturedRequests.push({
    url,
    headers: new Headers(init?.headers ?? (typeof input === "string" ? undefined : input.headers)),
    body: JSON.parse(String(init?.body ?? "{}")),
  });

  if (capturedRequests.length === 2) {
    const secondBatchCall = {
      type: "function_call",
      id: "fc_fixture_read_two",
      call_id: "call_fixture_read_two",
      name: "read",
      arguments: "{\"path\":\"two.txt\"}",
      caller: { type: "program", caller_id: "call_program_fixture" },
      status: "completed",
    };
    return new Response([
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: secondBatchCall })}\n\n`,
      'data: {"type":"response.completed","response":{"id":"resp_second_batch","status":"completed","output":[],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
    ].join(""), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  if (capturedRequests.length > 2) {
    const programOutput = {
      type: "program_output",
      id: "prog_out_fixture",
      call_id: "call_program_fixture",
      result: "{\"files\":[\"one.txt\",\"two.txt\"]}",
      status: "completed",
    };
    return new Response([
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: programOutput })}\n\n`,
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 1, item: finalResponseMessage })}\n\n`,
      'data: {"type":"response.completed","response":{"id":"resp_resume","status":"completed","output":[],"usage":{"input_tokens":5,"input_tokens_details":{"cached_tokens":1},"output_tokens":2,"total_tokens":7}}}\n\n',
    ].join(""), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  const program = {
    type: "program",
    id: "prog_fixture",
    call_id: "call_program_fixture",
    code: "const result = await tools.read({ path: 'one.txt' }); text(result);",
    fingerprint: "fixture-fingerprint",
    status: "completed",
  };
  const functionCall = {
    type: "function_call",
    id: "fc_fixture_read",
    call_id: "call_fixture_read",
    name: "read",
    arguments: "{\"path\":\"one.txt\"}",
    caller: { type: "program", caller_id: "call_program_fixture" },
    status: "completed",
  };
  return new Response([
    `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: program })}\n\n`,
    `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 1, item: functionCall })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_initial","status":"completed","output":[],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
  ].join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
};

try {
  const model = {
    id: "fixture-programmatic-model",
    name: "Fixture Programmatic Model",
    api: "opencode-cloudflare",
    provider: "opencode.cloudflare.dev",
    baseUrl: "https://opencode.cloudflare.dev",
    reasoning: true,
    input: ["text"],
    cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
  const context = {
    systemPrompt: "Use tools when useful.",
    messages: [{ role: "user", content: "Check two files.", timestamp: Date.now() }],
    tools: [
      {
        name: "read",
        description: "Read a file.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  };

  const stream = streamOpencodeCloudflare(model, context, {
    apiKey: "fixture-gateway-token",
    reasoning: "high",
    onPayload: (payload) => {
      observedPayloads.push(payload);
    },
  });
  let finalMessage;
  const toolCalls = [];
  for await (const event of stream) {
    if (event.type === "error") {
      throw new Error(event.error.errorMessage ?? "unexpected stream error");
    }
    if (event.type === "toolcall_end") {
      toolCalls.push(event.toolCall);
    }
    if (event.type === "done") {
      finalMessage = event.message;
    }
  }

  assert.equal(capturedRequests.length, 1);
  const request = capturedRequests[0];
  assert.equal(request.url, "https://opencode.cloudflare.dev/openai/responses");
  assert.equal(request.headers.get("authorization"), "Bearer fixture-gateway-token");
  assert.equal(request.headers.get("cf-access-token"), "fixture-gateway-token");
  assert.doesNotMatch(JSON.stringify(request.body), /fixture-gateway-token/);
  assert.equal(request.body.model, "fixture-programmatic-request-model");
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.include, ["reasoning.encrypted_content"]);
  assert.deepEqual(request.body.reasoning, { effort: "high", summary: "auto", context: "all_turns" });
  assert.deepEqual(request.body.text, { verbosity: "medium" });
  assert.deepEqual(request.body.tools, [
    {
      type: "function",
      name: "read",
      description: "Read a file.",
      parameters: context.tools[0].parameters,
      strict: false,
      allowed_callers: ["direct", "programmatic"],
    },
    { type: "programmatic_tool_calling" },
  ]);
  assert.equal(observedPayloads.length, 1);
  assert.deepEqual(observedPayloads[0], request.body);

  assert.ok(finalMessage);
  assert.equal(finalMessage.stopReason, "toolUse");
  assert.equal(finalMessage.content.length, 2);
  assert.deepEqual({
    type: finalMessage.content[0].type,
    thinking: finalMessage.content[0].thinking,
    redacted: finalMessage.content[0].redacted,
  }, {
    type: "thinking",
    thinking: "",
    redacted: true,
  });
  const persistedMessage = JSON.parse(JSON.stringify(finalMessage));
  const decodedProgram = decodeStoredResponsesItem(persistedMessage.content[0].thinkingSignature);
  assert.equal(decodedProgram._tag, "ok");
  assert.deepEqual(decodedProgram.value.item, {
    type: "program",
    id: "prog_fixture",
    call_id: "call_program_fixture",
    code: "const result = await tools.read({ path: 'one.txt' }); text(result);",
    fingerprint: "fixture-fingerprint",
    status: "completed",
  });

  assert.deepEqual(toolCalls.map(({ id, name, arguments: args }) => ({ id, name, arguments: args })), [
    {
      id: "call_fixture_read|fc_fixture_read",
      name: "read",
      arguments: { path: "one.txt" },
    },
  ]);
  const decodedFunctionCall = decodeStoredResponsesItem(toolCalls[0].thoughtSignature);
  assert.equal(decodedFunctionCall._tag, "ok");
  assert.deepEqual(decodedFunctionCall.value.item.caller, {
    type: "program",
    caller_id: "call_program_fixture",
  });

  const resumeContext = {
    ...context,
    messages: [
      context.messages[0],
      finalMessage,
      {
        role: "toolResult",
        toolCallId: "call_fixture_read|fc_fixture_read",
        toolName: "read",
        content: [{ type: "text", text: "contents of one.txt" }],
        isError: false,
        timestamp: Date.now(),
      },
    ],
  };
  const resumeStream = streamOpencodeCloudflare(model, resumeContext, {
    apiKey: "fixture-gateway-token",
    reasoning: "high",
  });
  let resumedMessage;
  const secondBatchToolCalls = [];
  for await (const event of resumeStream) {
    if (event.type === "error") {
      throw new Error(event.error.errorMessage ?? "unexpected resume stream error");
    }
    if (event.type === "toolcall_end") secondBatchToolCalls.push(event.toolCall);
    if (event.type === "done") resumedMessage = event.message;
  }

  assert.equal(capturedRequests.length, 2);
  const firstResumeInput = [
    { role: "developer", content: "Use tools when useful." },
    { role: "user", content: [{ type: "input_text", text: "Check two files." }] },
    decodedProgram.value.item,
    decodedFunctionCall.value.item,
    {
      type: "function_call_output",
      call_id: "call_fixture_read",
      output: "contents of one.txt",
      caller: { type: "program", caller_id: "call_program_fixture" },
    },
  ];
  assert.deepEqual(capturedRequests[1].body.input, firstResumeInput);

  assert.ok(resumedMessage);
  assert.equal(resumedMessage.stopReason, "toolUse");
  assert.deepEqual(secondBatchToolCalls.map(({ id, name, arguments: args }) => ({ id, name, arguments: args })), [
    {
      id: "call_fixture_read_two|fc_fixture_read_two",
      name: "read",
      arguments: { path: "two.txt" },
    },
  ]);
  const decodedSecondBatchCall = decodeStoredResponsesItem(secondBatchToolCalls[0].thoughtSignature);
  assert.equal(decodedSecondBatchCall._tag, "ok");
  assert.deepEqual(decodedSecondBatchCall.value.item.caller, {
    type: "program",
    caller_id: "call_program_fixture",
  });

  const completionContext = {
    ...context,
    messages: [
      ...resumeContext.messages,
      resumedMessage,
      {
        role: "toolResult",
        toolCallId: "call_fixture_read_two|fc_fixture_read_two",
        toolName: "read",
        content: [{ type: "image", mimeType: "image/png", data: "fixture-image-data" }],
        isError: false,
        timestamp: Date.now(),
      },
    ],
  };
  const completionStream = streamOpencodeCloudflare(model, completionContext, {
    apiKey: "fixture-gateway-token",
    reasoning: "high",
  });
  let completedMessage;
  for await (const event of completionStream) {
    if (event.type === "error") {
      throw new Error(event.error.errorMessage ?? "unexpected completion stream error");
    }
    if (event.type === "done") completedMessage = event.message;
  }

  assert.equal(capturedRequests.length, 3);
  assert.deepEqual(capturedRequests[2].body.input, [
    ...firstResumeInput,
    decodedSecondBatchCall.value.item,
    {
      type: "function_call_output",
      call_id: "call_fixture_read_two",
      output: "(see attached image)",
      caller: { type: "program", caller_id: "call_program_fixture" },
    },
  ]);
  assert.ok(completedMessage);
  assert.equal(completedMessage.stopReason, "stop");
  assert.equal(completedMessage.content.length, 2);
  assert.deepEqual({
    type: completedMessage.content[0].type,
    thinking: completedMessage.content[0].thinking,
    redacted: completedMessage.content[0].redacted,
  }, {
    type: "thinking",
    thinking: "",
    redacted: true,
  });
  const decodedProgramOutput = decodeStoredResponsesItem(completedMessage.content[0].thinkingSignature);
  assert.equal(decodedProgramOutput._tag, "ok");
  assert.equal(decodedProgramOutput.value.item.type, "program_output");
  assert.equal(completedMessage.content[1].type, "text");
  assert.equal(completedMessage.content[1].text, "Checked two files.");
  const decodedFinalMessage = decodeStoredResponsesItem(completedMessage.content[1].textSignature);
  assert.equal(decodedFinalMessage._tag, "ok");
  assert.deepEqual(decodedFinalMessage.value.item, finalResponseMessage);
  assert.deepEqual(completedMessage.usage, {
    input: 4,
    output: 2,
    cacheRead: 1,
    cacheWrite: 0,
    totalTokens: 7,
    cost: {
      input: 0.000004,
      output: 0.000004,
      cacheRead: 0.0000005,
      cacheWrite: 0,
      total: 0.0000085,
    },
  });

  let losslessReplayRequest;
  const losslessReplayStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      losslessReplayRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: "msg_after_replay",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Replay complete.", annotations: [] }],
            },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_after_replay","status":"completed"}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      ...context,
      messages: [
        ...completionContext.messages,
        completedMessage,
        { role: "user", content: "Continue after the cited answer.", timestamp: Date.now() },
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of losslessReplayStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  assert.ok(losslessReplayRequest);
  assert.deepEqual(
    losslessReplayRequest.input.find((item) => item.type === "message" && item.id === "msg_fixture_final"),
    finalResponseMessage,
  );

  const continuationProgram = {
    type: "program",
    id: "prog_continuation",
    call_id: "call_program_continuation",
    code: "text('ok')",
    fingerprint: "fp_continuation",
  };
  const continuationProgramOutput = {
    type: "program_output",
    id: "prog_out_continuation",
    call_id: "call_program_continuation",
    result: "{\"ok\":true}",
    status: "completed",
  };
  const continuationMessage = {
    type: "message",
    id: "msg_continuation_final",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Continuation complete.", annotations: [] }],
  };
  const continuationRequests = [];
  const continuationResponses = [
    new Response([
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: continuationProgram })}\n\n`,
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 1, item: continuationProgramOutput })}\n\n`,
      'data: {"type":"response.completed","response":{"id":"resp_continuation_1","status":"completed","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
    new Response([
      `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: continuationMessage })}\n\n`,
      'data: {"type":"response.completed","response":{"id":"resp_continuation_2","status":"completed","usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
  ];
  const recordingTransport = {
    async open(request) {
      continuationRequests.push(JSON.parse(String(request.init.body)));
      const response = continuationResponses.shift();
      assert.ok(response);
      return { _tag: "ok", value: response };
    },
  };
  const streamContinuation = createProgrammaticOpenAIResponsesStreamer(recordingTransport);
  const continuationStream = streamContinuation({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token", reasoning: "high" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let continuationFinalMessage;
  for await (const event of continuationStream) {
    if (event.type === "error") {
      throw new Error(event.error.errorMessage ?? "unexpected internal continuation error");
    }
    if (event.type === "done") continuationFinalMessage = event.message;
  }

  assert.equal(continuationRequests.length, 2);
  assert.deepEqual(continuationRequests[1].input, [
    { role: "developer", content: "Use tools when useful." },
    { role: "user", content: [{ type: "input_text", text: "Check two files." }] },
    continuationProgram,
    continuationProgramOutput,
  ]);
  // program (hidden) + program_output (hidden) from first response, then message from second.
  const continuationTextBlock = continuationFinalMessage.content.find((b) => b.type === "text");
  assert.equal(continuationTextBlock.text, "Continuation complete.");
  assert.equal(continuationFinalMessage.usage.totalTokens, 7);

  const duplicateCallResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_duplicate",
        call_id: "call_fixture_read",
        name: "read",
        arguments: "{\"path\":\"one.txt\"}",
        caller: { type: "program", caller_id: "call_program_fixture" },
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_duplicate","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const duplicateTransport = {
    async open() {
      return { _tag: "ok", value: duplicateCallResponse };
    },
  };
  const duplicateStream = createProgrammaticOpenAIResponsesStreamer(duplicateTransport)({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: resumeContext,
    options: { apiKey: "fixture-gateway-token", reasoning: "high" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let duplicateError;
  let duplicateToolCalls = 0;
  for await (const event of duplicateStream) {
    if (event.type === "error") duplicateError = event.error;
    if (event.type === "toolcall_end") duplicateToolCalls += 1;
  }
  assert.equal(duplicateToolCalls, 0);
  assert.equal(duplicateError.stopReason, "error");
  assert.match(duplicateError.errorMessage, /already completed/);

  const missingCallerResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_missing_caller",
        call_id: "call_missing_caller",
        name: "read",
        arguments: "{\"path\":\"one.txt\"}",
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_missing_caller","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const missingCallerStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      const payload = JSON.parse(String(request.init.body));
      assert.deepEqual(payload.tools[0].allowed_callers, ["programmatic"]);
      assert.deepEqual(payload.include, ["reasoning.encrypted_content"]);
      return { _tag: "ok", value: missingCallerResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token", reasoning: "high" },
    policy: { _tag: "Enabled", allowedCallers: ["programmatic"] },
  });
  let missingCallerError;
  let missingCallerToolCalls = 0;
  for await (const event of missingCallerStream) {
    if (event.type === "error") missingCallerError = event.error;
    if (event.type === "toolcall_end") missingCallerToolCalls += 1;
  }
  assert.equal(missingCallerToolCalls, 0);
  assert.equal(missingCallerError.stopReason, "error");
  assert.match(missingCallerError.errorMessage, /caller is missing/);

  let corruptStateRequests = 0;
  const corruptStateStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      corruptStateRequests += 1;
      throw new Error("transport must not be reached");
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      messages: [{
        role: "assistant",
        api: "openai-responses",
        provider: model.provider,
        model: model.id,
        content: [{
          type: "thinking",
          thinking: "",
          redacted: true,
          thinkingSignature: "opencode-cloudflare:openai-responses:v1:{not-json",
        }],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      }],
      tools: context.tools,
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let corruptStateError;
  for await (const event of corruptStateStream) {
    if (event.type === "error") corruptStateError = event.error;
  }
  assert.equal(corruptStateRequests, 0);
  assert.equal(corruptStateError.stopReason, "error");
  assert.match(corruptStateError.errorMessage, /invalid-json/);

  const malformedArgumentsResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_bad_arguments",
        call_id: "call_bad_arguments",
        name: "read",
        arguments: "[]",
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_bad_arguments","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const malformedArgumentsStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: malformedArgumentsResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let malformedArgumentsError;
  let malformedArgumentsToolCalls = 0;
  for await (const event of malformedArgumentsStream) {
    if (event.type === "error") malformedArgumentsError = event.error;
    if (event.type === "toolcall_end") malformedArgumentsToolCalls += 1;
  }
  assert.equal(malformedArgumentsToolCalls, 0);
  assert.match(malformedArgumentsError.errorMessage, /arguments are malformed/);

  const unknownItemResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: { type: "future_required_item", id: "future_1" },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_unknown_item","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const unknownItemStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: unknownItemResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let unknownItemError;
  for await (const event of unknownItemStream) {
    if (event.type === "error") unknownItemError = event.error;
  }
  assert.equal(unknownItemError.stopReason, "error");
  assert.match(unknownItemError.errorMessage, /unsupported/);
  assert.doesNotMatch(unknownItemError.errorMessage, /future_required_item/);

  const rejectedResponses = [];
  const rejectedStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return {
        _tag: "ok",
        value: new Response(JSON.stringify({
          error: "Unauthorized",
          message: "fixture-secret-response-body",
          status: 401,
        }), {
          status: 401,
          headers: { "content-type": "application/json", "x-fixture": "observed" },
        }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: {
      apiKey: "fixture-gateway-token",
      onResponse: (response) => rejectedResponses.push(response),
    },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let rejectedMessage;
  for await (const event of rejectedStream) {
    if (event.type === "error") rejectedMessage = event.error;
  }
  assert.deepEqual(rejectedResponses, [{
    status: 401,
    headers: { "content-type": "application/json", "x-fixture": "observed" },
  }]);
  assert.match(rejectedMessage.errorMessage, /rejected the Access token/);
  assert.doesNotMatch(rejectedMessage.errorMessage, /fixture-secret-response-body/);
  assert.doesNotMatch(rejectedMessage.errorMessage, /fixture-gateway-token/);

  const directCallResponse = new Response([
    'data: {"type":"response.future_harmless_metric","value":1}\n\n',
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "reasoning",
        id: "rs_direct",
        summary: [{ type: "summary_text", text: "Use a direct read." }],
        encrypted_content: "fixture-encrypted-reasoning",
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 1,
      item: {
        type: "function_call",
        id: "fc_direct",
        call_id: "call_direct",
        name: "read",
        arguments: "{\"path\":\"direct.txt\"}",
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_direct","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const directCallStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: directCallResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  const directToolCalls = [];
  let directCallMessage;
  for await (const event of directCallStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
    if (event.type === "toolcall_end") directToolCalls.push(event.toolCall);
    if (event.type === "done") directCallMessage = event.message;
  }
  assert.deepEqual(directToolCalls.map((call) => call.id), ["call_direct|fc_direct"]);
  assert.equal(directCallMessage.content[0].thinking, "Use a direct read.");
  const decodedReasoning = decodeStoredResponsesItem(directCallMessage.content[0].thinkingSignature);
  assert.equal(decodedReasoning._tag, "ok");
  assert.equal(decodedReasoning.value.item.encrypted_content, "fixture-encrypted-reasoning");

  const incompleteMessage = {
    type: "message",
    id: "msg_incomplete",
    role: "assistant",
    status: "incomplete",
    content: [{ type: "output_text", text: "Partial answer.", annotations: [] }],
  };
  const incompleteStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "function_call",
              id: "fc_incomplete",
              call_id: "call_incomplete",
              name: "read",
              arguments: "{\"path\":\"partial.txt\"}",
            },
          })}\n\n`,
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 1,
            item: incompleteMessage,
          })}\n\n`,
          'data: {"type":"response.incomplete","response":{"id":"resp_incomplete","status":"incomplete","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let incompleteResult;
  let incompleteToolCalls = 0;
  for await (const event of incompleteStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
    if (event.type === "toolcall_end") incompleteToolCalls += 1;
    if (event.type === "done") incompleteResult = event;
  }
  assert.equal(incompleteResult.reason, "length");
  assert.equal(incompleteToolCalls, 0);
  assert.equal(incompleteResult.message.content.some((block) => block.type === "toolCall"), false);
  assert.equal(incompleteResult.message.content[0].text, "Partial answer.");
  assert.equal(incompleteResult.message.usage.totalTokens, 3);

  const unterminatedStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return {
        _tag: "ok",
        value: new Response(
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: incompleteMessage,
          })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let unterminatedError;
  let unterminatedDone = false;
  for await (const event of unterminatedStream) {
    if (event.type === "error") unterminatedError = event.error;
    if (event.type === "done") unterminatedDone = true;
  }
  assert.equal(unterminatedDone, false);
  assert.equal(unterminatedError.stopReason, "error");
  assert.match(unterminatedError.errorMessage, /without a terminal response event/);

  const abortController = new AbortController();
  abortController.abort();
  const abortedStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      assert.equal(request.init.signal.aborted, true);
      return {
        _tag: "err",
        error: new ResponsesTransportFailed(new DOMException("fixture secret", "AbortError")),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token", signal: abortController.signal },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let abortedMessage;
  for await (const event of abortedStream) {
    if (event.type === "error") abortedMessage = event.error;
  }
  assert.equal(abortedMessage.stopReason, "aborted");
  assert.doesNotMatch(abortedMessage.errorMessage, /fixture secret/);

  let foreignModelRequest;
  const foreignModelStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      foreignModelRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: "msg_foreign_state_final",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Foreign state skipped.", annotations: [] }],
            },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_foreign_state","status":"completed"}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      ...resumeContext,
      messages: [
        resumeContext.messages[0],
        { ...finalMessage, model: "other-visible-model" },
        resumeContext.messages[2],
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of foreignModelStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  assert.equal(foreignModelRequest.input.some((item) => item.type === "program"), false);
  const foreignFunctionCall = foreignModelRequest.input.find((item) => item.type === "function_call");
  assert.ok(foreignFunctionCall);
  assert.equal(foreignFunctionCall.caller, undefined);
  const foreignFunctionOutput = foreignModelRequest.input.find((item) => item.type === "function_call_output");
  assert.ok(foreignFunctionOutput);
  assert.equal(foreignFunctionOutput.caller, undefined);

  let continuationLimitRequests = 0;
  const continuationLimitStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      continuationLimitRequests += 1;
      return {
        _tag: "ok",
        value: new Response(
          `data: ${JSON.stringify({
            type: "response.completed",
            response: {
              id: `resp_limit_${continuationLimitRequests}`,
              status: "completed",
              usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
            },
          })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let continuationLimitError;
  for await (const event of continuationLimitStream) {
    if (event.type === "error") continuationLimitError = event.error;
  }
  assert.equal(continuationLimitRequests, 9);
  assert.match(continuationLimitError.errorMessage, /continuation limit exceeded/);

  // ---------------------------------------------------------------------------
  // F1: Direct call without caller under dual policy after a program item
  // ---------------------------------------------------------------------------
  const mixedDirectCallResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "program",
        id: "prog_mixed",
        call_id: "call_prog_mixed",
        code: "tools.read({ path: 'a.txt' })",
        fingerprint: "fp_mixed",
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 1,
      item: {
        type: "function_call",
        id: "fc_nested_mixed",
        call_id: "call_nested_mixed",
        name: "read",
        arguments: "{\"path\":\"a.txt\"}",
        caller: { type: "program", caller_id: "call_prog_mixed" },
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 2,
      item: {
        type: "function_call",
        id: "fc_direct_mixed",
        call_id: "call_direct_mixed",
        name: "read",
        arguments: "{\"path\":\"b.txt\"}",
        // A nullable caller is a direct call under dual policy.
        caller: null,
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_mixed","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const mixedDirectStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: mixedDirectCallResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  const mixedToolCalls = [];
  let mixedError;
  for await (const event of mixedDirectStream) {
    if (event.type === "error") mixedError = event.error;
    if (event.type === "toolcall_end") mixedToolCalls.push(event.toolCall);
  }
  assert.equal(mixedError, undefined, "direct call under dual policy should succeed");
  assert.equal(mixedToolCalls.length, 2);
  assert.equal(mixedToolCalls[0].name, "read");
  assert.equal(mixedToolCalls[1].name, "read");
  const decodedNullableCaller = decodeStoredResponsesItem(mixedToolCalls[1].thoughtSignature);
  assert.equal(decodedNullableCaller._tag, "ok");
  assert.equal(decodedNullableCaller.value.item.caller, null);

  // ---------------------------------------------------------------------------
  // F1: Resumed nested call with unknown program caller
  // ---------------------------------------------------------------------------
  const unknownCallerResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_unknown_caller",
        call_id: "call_unknown_caller",
        name: "read",
        arguments: "{\"path\":\"x.txt\"}",
        caller: { type: "program", caller_id: "call_nonexistent_program" },
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_unknown_caller","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const unknownCallerStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: unknownCallerResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let unknownCallerError;
  for await (const event of unknownCallerStream) {
    if (event.type === "error") unknownCallerError = event.error;
  }
  assert.ok(unknownCallerError);
  assert.match(unknownCallerError.errorMessage, /unknown program/);

  // ---------------------------------------------------------------------------
  // F1: program_output referencing an unknown program
  // ---------------------------------------------------------------------------
  const unknownProgramOutputResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "program_output",
        id: "prog_out_orphan",
        call_id: "call_nonexistent_program",
        result: "{}",
        status: "completed",
      },
    })}\n\n`,
    'data: {"type":"response.completed","response":{"id":"resp_orphan_po","status":"completed"}}\n\n',
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const unknownProgramOutputStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: unknownProgramOutputResponse };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let unknownProgramOutputError;
  for await (const event of unknownProgramOutputStream) {
    if (event.type === "error") unknownProgramOutputError = event.error;
  }
  assert.ok(unknownProgramOutputError);
  assert.match(unknownProgramOutputError.errorMessage, /unknown program/);

  // ---------------------------------------------------------------------------
  // F2: Fork/branch with orphaned function calls produces synthetic outputs
  // ---------------------------------------------------------------------------
  let orphanRequest;
  const orphanForkStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      orphanRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: "msg_orphan_final",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Done after orphan.", annotations: [] }],
            },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_orphan","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      ...context,
      messages: [
        context.messages[0],
        // Assistant message with a tool call but no subsequent tool result (orphan).
        finalMessage,
        // User message immediately after — no tool result in between.
        { role: "user", content: "Continue without tool result.", timestamp: Date.now() },
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of orphanForkStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  assert.ok(orphanRequest);
  // The synthetic function_call_output should appear before the user message.
  const syntheticOutput = orphanRequest.input.find(
    (item) => item.type === "function_call_output" && item.output === "No result provided",
  );
  assert.ok(syntheticOutput, "synthetic function_call_output must be injected for orphaned calls");
  assert.equal(syntheticOutput.call_id, "call_fixture_read");
  // The orphaned call had a program caller, which must be preserved on the synthetic output.
  assert.deepEqual(syntheticOutput.caller, { type: "program", caller_id: "call_program_fixture" });

  // ---------------------------------------------------------------------------
  // F3: Incomplete response without message or calls does not continue
  // ---------------------------------------------------------------------------
  let incompleteNoContinuationRequests = 0;
  const incompleteNoContinuationStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      incompleteNoContinuationRequests += 1;
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "program_output",
              id: "prog_out_incomplete",
              call_id: "call_program_continuation",
              result: "{\"partial\":true}",
              status: "incomplete",
            },
          })}\n\n`,
          'data: {"type":"response.incomplete","response":{"id":"resp_incomplete_no_msg","status":"incomplete","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      ...context,
      messages: [
        ...context.messages,
        // Provide a program in context so program_output call_id is known.
        {
          role: "assistant",
          api: "openai-responses",
          provider: model.provider,
          model: model.id,
          content: [{
            type: "thinking",
            thinking: "",
            redacted: true,
            thinkingSignature: (await import("../programmatic-tool-calling.ts")).encodeStoredResponsesItem({
              type: "program",
              id: "prog_ctx",
              call_id: "call_program_continuation",
              code: "text('hi')",
              fingerprint: "fp_ctx",
            }),
          }],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: Date.now(),
        },
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let incompleteNoContinuationDone;
  for await (const event of incompleteNoContinuationStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
    if (event.type === "done") incompleteNoContinuationDone = event;
  }
  assert.equal(incompleteNoContinuationRequests, 1, "incomplete response must not trigger continuation");
  assert.equal(incompleteNoContinuationDone.reason, "length");

  // ---------------------------------------------------------------------------
  // F4: Phase round-trip through persisted context
  // ---------------------------------------------------------------------------
  let phaseRequest;
  const phaseStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      phaseRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: "msg_phase_final",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Phase test.", annotations: [] }],
            },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_phase","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: {
      ...model,
      id: "fixture-programmatic-request-model",
      api: "openai-responses",
      baseUrl: "https://opencode.cloudflare.dev/openai",
    },
    context: {
      ...context,
      messages: [
        context.messages[0],
        {
          role: "assistant",
          api: "openai-responses",
          provider: model.provider,
          model: model.id,
          content: [{
            type: "text",
            text: "Commentary content.",
            textSignature: JSON.stringify({ v: 1, id: "msg_commentary_1", phase: "commentary" }),
          }],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: Date.now(),
        },
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of phaseStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  assert.ok(phaseRequest);
  const replayedMsg = phaseRequest.input.find((item) => item.type === "message" && item.id === "msg_commentary_1");
  assert.ok(replayedMsg, "replayed message must preserve id");
  assert.equal(replayedMsg.phase, "commentary", "replayed message must preserve phase");

  // ---------------------------------------------------------------------------
  // F4: Long id is clamped to 64 characters
  // ---------------------------------------------------------------------------
  let longIdRequest;
  const longId = "msg_" + "a".repeat(100);
  const longIdStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      longIdRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: { type: "message", id: "msg_long_final", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_long","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: { ...model, id: "fixture-programmatic-request-model", api: "openai-responses", baseUrl: "https://opencode.cloudflare.dev/openai" },
    context: {
      ...context,
      messages: [
        context.messages[0],
        {
          role: "assistant", api: "openai-responses", provider: model.provider, model: model.id,
          content: [{ type: "text", text: "Long id.", textSignature: JSON.stringify({ v: 1, id: longId }) }],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop", timestamp: Date.now(),
        },
      ],
    },
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of longIdStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  const longIdMsg = longIdRequest.input.find((item) => item.type === "message" && item.role === "assistant");
  assert.ok(longIdMsg);
  assert.ok(longIdMsg.id.length <= 64, `replayed id must be <= 64 chars, got ${longIdMsg.id.length}`);

  // ---------------------------------------------------------------------------
  // F5: Session ID projected as prompt_cache_key
  // ---------------------------------------------------------------------------
  let sessionIdRequest;
  const sessionIdStream = createProgrammaticOpenAIResponsesStreamer({
    async open(request) {
      sessionIdRequest = JSON.parse(String(request.init.body));
      return {
        _tag: "ok",
        value: new Response([
          `data: ${JSON.stringify({
            type: "response.output_item.done",
            output_index: 0,
            item: { type: "message", id: "msg_sid", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] },
          })}\n\n`,
          'data: {"type":"response.completed","response":{"id":"resp_sid","status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: { ...model, id: "fixture-programmatic-request-model", api: "openai-responses", baseUrl: "https://opencode.cloudflare.dev/openai" },
    context,
    options: { apiKey: "fixture-gateway-token", sessionId: "fixture-session-id" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  for await (const event of sessionIdStream) {
    if (event.type === "error") throw new Error(event.error.errorMessage);
  }
  assert.equal(sessionIdRequest.prompt_cache_key, "fixture-session-id");

  // ---------------------------------------------------------------------------
  // F6: Invalid usage fails closed
  // ---------------------------------------------------------------------------
  const invalidUsageStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return {
        _tag: "ok",
        value: new Response([
          'data: {"type":"response.completed","response":{"id":"resp_bad_usage","status":"completed","usage":{"input_tokens":"many","output_tokens":1,"total_tokens":2}}}\n\n',
        ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }),
      };
    },
  })({
    visibleModel: model,
    requestModel: { ...model, id: "fixture-programmatic-request-model", api: "openai-responses", baseUrl: "https://opencode.cloudflare.dev/openai" },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let invalidUsageError;
  for await (const event of invalidUsageStream) {
    if (event.type === "error") invalidUsageError = event.error;
  }
  assert.ok(invalidUsageError);
  assert.match(invalidUsageError.errorMessage, /usage field is invalid/);

  // ---------------------------------------------------------------------------
  // F7: Untrusted values never appear in error messages
  // ---------------------------------------------------------------------------
  // Duplicate call id must not leak in the message.
  assert.doesNotMatch(duplicateError.errorMessage, /call_fixture_read/);
  // Unknown item type must not leak.
  assert.doesNotMatch(unknownItemError.errorMessage, /future_required_item/);

  // response.failed code must not leak.
  const failedCodeResponse = new Response([
    `data: ${JSON.stringify({
      type: "response.failed",
      response: { error: { code: "secret_error_code_42" } },
    })}\n\n`,
  ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const failedCodeStream = createProgrammaticOpenAIResponsesStreamer({
    async open() {
      return { _tag: "ok", value: failedCodeResponse };
    },
  })({
    visibleModel: model,
    requestModel: { ...model, id: "fixture-programmatic-request-model", api: "openai-responses", baseUrl: "https://opencode.cloudflare.dev/openai" },
    context,
    options: { apiKey: "fixture-gateway-token" },
    policy: { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] },
  });
  let failedCodeError;
  for await (const event of failedCodeStream) {
    if (event.type === "error") failedCodeError = event.error;
  }
  assert.ok(failedCodeError);
  assert.doesNotMatch(failedCodeError.errorMessage, /secret_error_code_42/);
  assert.match(failedCodeError.errorMessage, /request failed/);

  console.log("programmatic tool calling regression checks passed");
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
