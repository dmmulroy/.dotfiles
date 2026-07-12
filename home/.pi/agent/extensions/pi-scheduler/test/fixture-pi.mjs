#!/usr/bin/env node
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  if (process.env.FIXTURE_HANG === "1") {
    setInterval(() => {}, 1_000);
    return;
  }
  const message = {
    role: "assistant",
    content: [{ type: "text", text: `completed: ${prompt}` }],
    api: "test-api",
    provider: "test",
    model: "public-test-model",
    usage: {
      input: 3,
      output: 4,
      cacheRead: 1,
      cacheWrite: 2,
      totalTokens: 10,
      cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  process.stdout.write(`${JSON.stringify({ type: "message_end", message })}\n`);
});
