import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-local-overlay-"));
const overlayPath = path.join(tempDir, "overlay.jsonc");

fs.writeFileSync(overlayPath, `{
  // Local provider model overlays are OpenCode-shaped and provider-generic.
  "provider": {
    "anthropic": {
      "models": {
        "anthropic/claude-opus-4-8": {
          "id": "claude-opus-4-8",
          "name": "Claude Opus 4.8",
          "attachment": true,
          "reasoning": true,
          "thinkingLevelMap": { "xhigh": "xhigh" },
          "cost": { "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 },
          "limit": { "context": 1000000, "output": 128000 },
          "compat": { "forceAdaptiveThinking": true }
        }
      }
    },
    "google": {
      "models": {
        "custom-google-model": {
          "name": "Custom Google Model",
          "attachment": true,
          "reasoning": true,
          "limit": { "context": 1000000, "output": 12345 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    },
    "cloudflare-workers-ai": {
      "models": {
        "@cf/example/custom-worker": {
          "id": "workers-ai/@cf/example/custom-worker",
          "name": "Custom Worker Model",
          "attachment": false,
          "reasoning": false,
          "limit": { "context": 64000, "output": 4096 },
        }
      }
    }
  }
}`);

process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG = overlayPath;

try {
	const { getCatalog } = await import("../catalog.ts");
	const catalog = getCatalog();

	const opus48 = catalog.models.find((model) => model.id === "claude-opus-4-8");
	assert.ok(opus48);
	assert.equal(opus48.name, "Claude Opus 4.8");
	assert.deepEqual(opus48.thinkingLevelMap, { xhigh: "xhigh" });
	assert.equal(opus48.cost.cacheWrite, 6.25);
	assert.equal(opus48.contextWindow, 1000000);
	assert.equal(opus48.maxTokens, 128000);
	assert.equal(catalog.routes.get("claude-opus-4-8")?.requestModelId, "claude-opus-4-8");
	assert.deepEqual(catalog.routes.get("claude-opus-4-8")?.compat, { forceAdaptiveThinking: true });

	const googleModel = catalog.models.find((model) => model.id === "custom-google-model");
	assert.ok(googleModel);
	assert.equal(googleModel.name, "Custom Google Model");
	assert.deepEqual(googleModel.input, ["text", "image"]);
	assert.equal(googleModel.contextWindow, 1000000);
	assert.equal(googleModel.maxTokens, 12345);
	assert.equal(catalog.routes.get("custom-google-model")?.backend, "google");
	assert.equal(catalog.routes.get("custom-google-model")?.api, "google-generative-ai");

	const workerModel = catalog.models.find((model) => model.id === "@cf/example/custom-worker");
	assert.ok(workerModel);
	assert.equal(workerModel.name, "@cf/example/custom-worker (Custom Worker Model)");
	assert.equal(workerModel.reasoning, false);
	assert.equal(catalog.routes.get("@cf/example/custom-worker")?.backend, "workers-ai");
	assert.equal(catalog.routes.get("@cf/example/custom-worker")?.requestModelId, "workers-ai/@cf/example/custom-worker");

	console.log("local overlay regression checks passed");
} finally {
	delete process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG;
	fs.rmSync(tempDir, { recursive: true, force: true });
}
