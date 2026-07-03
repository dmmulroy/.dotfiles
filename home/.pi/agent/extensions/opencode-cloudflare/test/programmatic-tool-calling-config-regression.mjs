import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-programmatic-config-"));
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

try {
  const { getCatalog } = await import("../catalog.ts");
  const {
    InvalidProgrammaticToolCallingConfig,
    parseProgrammaticToolCallingPolicy,
  } = await import("../programmatic-tool-calling.ts");
  const route = getCatalog().routes.get("fixture-programmatic-model");

  assert.ok(route);
  assert.deepEqual(route.programmaticToolCalling, {
    _tag: "Enabled",
    allowedCallers: ["direct", "programmatic"],
  });
  assert.deepEqual(getCatalog().routes.get("gpt-4o")?.programmaticToolCalling, { _tag: "Disabled" });
  assert.deepEqual(parseProgrammaticToolCallingPolicy(undefined), { _tag: "Disabled" });
  assert.throws(
    () => parseProgrammaticToolCallingPolicy({
      programmatic_tool_calling: { allowed_callers: ["direct"] },
    }),
    (error) => {
      assert.ok(error instanceof InvalidProgrammaticToolCallingConfig);
      assert.equal(error.path, "options.programmatic_tool_calling.allowed_callers");
      assert.equal(error.reason, "missing-programmatic");
      assert.doesNotMatch(error.message, /\[\"direct\"\]/);
      return true;
    },
  );
  assert.throws(
    () => parseProgrammaticToolCallingPolicy({
      programmatic_tool_calling: { allowed_callers: ["programmatic", "unknown-secret-value"] },
    }),
    (error) => {
      assert.ok(error instanceof InvalidProgrammaticToolCallingConfig);
      assert.equal(error.reason, "invalid-caller");
      assert.doesNotMatch(error.message, /unknown-secret-value/);
      return true;
    },
  );

  const invalidOverlayPath = path.join(tempDir, "invalid-overlay.jsonc");
  fs.writeFileSync(invalidOverlayPath, JSON.stringify({
    provider: {
      openai: {
        models: {
          "fixture-invalid-programmatic-model": {
            options: {
              programmatic_tool_calling: {
                allowed_callers: ["programmatic", "fixture-secret-invalid-caller"],
              },
            },
          },
        },
      },
    },
  }));
  const child = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(new URL("../catalog.ts", import.meta.url).href)})`,
  ], {
    encoding: "utf8",
    env: { ...process.env, OPENCODE_CLOUDFLARE_LOCAL_CONFIG: invalidOverlayPath },
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /options\.programmatic_tool_calling\.allowed_callers: invalid-caller/);
  assert.doesNotMatch(child.stderr, /fixture-secret-invalid-caller/);

  console.log("programmatic tool calling config regression checks passed");
} finally {
  delete process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
