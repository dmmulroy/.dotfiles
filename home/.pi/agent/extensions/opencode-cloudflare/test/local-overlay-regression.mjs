import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-local-overlay-"));
const overlayPath = path.join(tempDir, "overlay.jsonc");

fs.writeFileSync(overlayPath, `{
  // Local provider model overlays are OpenCode-shaped and provider-generic.
  "provider": {
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
