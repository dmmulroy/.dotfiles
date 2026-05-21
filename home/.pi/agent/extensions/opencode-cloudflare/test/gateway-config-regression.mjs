import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshCatalog } from "../catalog.ts";
import { clearGatewayConfigCache, getGatewayConfig, getGatewayConfigStatus } from "../wellknown.ts";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const wellKnown = JSON.parse(fs.readFileSync(path.join(testDir, "fixtures", "wellknown.json"), "utf8"));
const originalFetch = globalThis.fetch;
let fetchMode = "live";

globalThis.fetch = async (input) => {
	const url = typeof input === "string" ? input : input.url;
	if (url.endsWith("/.well-known/opencode")) {
		if (fetchMode === "unavailable") {
			return new Response("well-known unavailable", { status: 503, statusText: "Unavailable" });
		}
		return new Response(JSON.stringify(wellKnown), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}
	throw new Error(`Unexpected fetch in gateway config regression: ${url}`);
};

try {
	clearGatewayConfigCache();
	const catalog = await refreshCatalog(true);
	const ids = new Set(catalog.models.map((model) => model.id));

	assert.ok(ids.has("gpt-4o"), "non-blacklisted OpenAI models remain visible");
	assert.ok(!ids.has("gpt-5.4-pro"), "OpenAI built-in/dynamic blacklists are honored");
	assert.ok(!ids.has("claude-opus-4-7-fast"), "Anthropic dynamic blacklists are honored");

	const kimi26 = catalog.models.find((model) => model.id === "@cf/moonshotai/kimi-k2.6");
	assert.ok(kimi26, "cloudflare-workers-ai aliases resolve to the Workers AI catalog");
	assert.equal(kimi26.maxTokens, 32000);
	assert.equal(catalog.routes.get("@cf/moonshotai/kimi-k2.6")?.requestModelId, "workers-ai/@cf/moonshotai/kimi-k2.6");
	assert.ok(ids.has("@cf/google/gemma-4-26b-a4b-it"));
	assert.ok(ids.has("@cf/zai-org/glm-5.1"));
	assert.equal(getGatewayConfigStatus().cacheSource, "live");
	assert.equal(getGatewayConfigStatus().lastFetchError, undefined);

	fetchMode = "unavailable";
	clearGatewayConfigCache();
	const fallback = await getGatewayConfig({ forceReload: true, fallbackToDefault: true });
	assert.equal(fallback.source, "fallback");
	assert.equal(getGatewayConfigStatus().cacheSource, "fallback");
	assert.match(getGatewayConfigStatus().lastFetchError || "", /503 Unavailable/);

	console.log("gateway config regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	clearGatewayConfigCache();
}
