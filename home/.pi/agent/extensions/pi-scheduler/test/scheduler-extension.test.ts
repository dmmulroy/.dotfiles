import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { AuthStorage, discoverAndLoadExtensions, ExtensionRunner, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixture-extension.ts");
const toolFixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixture-tool-extension.ts");

test("/schedule list renders directly without appending a session message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-scheduler-extension-"));
  try {
    const sessionManager = SessionManager.inMemory(cwd);
    const loaded = await discoverAndLoadExtensions([fixturePath], cwd, join(cwd, ".agent"));
    assert.deepEqual(loaded.errors, []);
    const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, sessionManager, ModelRegistry.inMemory(AuthStorage.inMemory()));
    const notifications: string[] = [];
    runner.setUIContext({ ...runner.getUIContext(), notify: (message) => notifications.push(message) });
    const command = runner.getCommand("schedule");
    assert.ok(command);
    await command.handler("list", runner.createCommandContext());
    assert.match(notifications[0] ?? "", /job_extension_test.*Extension test/);
    assert.equal(sessionManager.getEntries().length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("model mutations require UI approval and rejection sends no daemon request", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-scheduler-extension-"));
  const recordPath = join(cwd, "requests.log");
  await writeFile(recordPath, "", "utf8");
  process.env.PI_SCHEDULER_TEST_RECORD = recordPath;
  try {
    const sessionManager = SessionManager.inMemory(cwd);
    const loaded = await discoverAndLoadExtensions([toolFixturePath], cwd, join(cwd, ".agent"));
    assert.deepEqual(loaded.errors, []);
    const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, sessionManager, ModelRegistry.inMemory(AuthStorage.inMemory()));
    runner.setUIContext({ ...runner.getUIContext(), confirm: async () => false });
    const tool = runner.getToolDefinition("scheduled_task");
    assert.ok(tool);
    const rejected = await tool.execute("call", { action: "pause", id: "job_tool_test" }, new AbortController().signal, undefined, runner.createContext());
    assert.match(rejected.content[0]?.type === "text" ? rejected.content[0].text : "", /rejected/iu);
    assert.equal(await readFile(recordPath, "utf8"), "");

    runner.setUIContext(undefined, "print");
    const headless = await tool.execute("call", { action: "pause", id: "job_tool_test" }, new AbortController().signal, undefined, runner.createContext());
    assert.match(headless.content[0]?.type === "text" ? headless.content[0].text : "", /ApprovalRequiredError/);
    assert.equal(await readFile(recordPath, "utf8"), "");
  } finally {
    delete process.env.PI_SCHEDULER_TEST_RECORD;
    await rm(cwd, { recursive: true, force: true });
  }
});
