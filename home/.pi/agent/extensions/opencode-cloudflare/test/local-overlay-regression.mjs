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
        "anthropic/fixture-adaptive-anthropic-model": {
          "id": "fixture-adaptive-anthropic-model",
          "name": "Fixture Adaptive Anthropic Model",
          "attachment": true,
          "reasoning": true,
          "thinkingLevelMap": { "xhigh": "xhigh" },
          "cost": { "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 },
          "limit": { "context": 1000000, "output": 128000 },
          "compat": { "forceAdaptiveThinking": true }
        }
      }
    },
    "openai": {
      "models": {
        "custom-openai-responses-model": {
          "id": "custom-openai-responses-model",
          "name": "Custom OpenAI Responses Model",
          "attachment": true,
          "reasoning": true,
          "thinkingLevelMap": { "off": "none", "minimal": null, "xhigh": "xhigh" },
          "options": { "text": { "verbosity": "medium" } },
          "limit": { "context": 1000000, "output": 128000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
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

	const fixtureAdaptiveModel = catalog.models.find((model) => model.id === "fixture-adaptive-anthropic-model");
	assert.ok(fixtureAdaptiveModel);
	assert.equal(fixtureAdaptiveModel.name, "Fixture Adaptive Anthropic Model");
	assert.deepEqual(fixtureAdaptiveModel.thinkingLevelMap, { xhigh: "xhigh" });
	assert.equal(fixtureAdaptiveModel.cost.cacheWrite, 6.25);
	assert.equal(fixtureAdaptiveModel.contextWindow, 1000000);
	assert.equal(fixtureAdaptiveModel.maxTokens, 128000);
	assert.equal(catalog.routes.get("fixture-adaptive-anthropic-model")?.requestModelId, "fixture-adaptive-anthropic-model");
	assert.deepEqual(catalog.routes.get("fixture-adaptive-anthropic-model")?.compat, { forceAdaptiveThinking: true });

	const openaiIds = new Set(catalog.models.map((model) => model.id));
	assert.ok(openaiIds.has("gpt-4o"), "a local OpenAI overlay augments rather than replaces built-in gateway models");
	assert.ok(openaiIds.has("gpt-5.5"), "new built-in OpenAI models remain visible with a local overlay");

	const openaiResponsesModel = catalog.models.find((model) => model.id === "custom-openai-responses-model");
	assert.ok(openaiResponsesModel);
	assert.deepEqual(openaiResponsesModel.thinkingLevelMap, { off: "none", minimal: null, xhigh: "xhigh" });
	assert.equal(openaiResponsesModel.contextWindow, 1000000);
	assert.equal(openaiResponsesModel.maxTokens, 128000);
	assert.equal(catalog.routes.get("custom-openai-responses-model")?.backend, "openai");
	assert.equal(catalog.routes.get("custom-openai-responses-model")?.api, "openai-responses");
	assert.equal(catalog.routes.get("custom-openai-responses-model")?.responseVerbosity, "medium");

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
