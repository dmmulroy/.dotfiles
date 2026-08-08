import type { Api, Model, ProviderHeaders } from "@earendil-works/pi-ai";

import { resolveCodexFastUpstreamModelId } from "./codex-fast-variants.ts";
import { isJsonRecord } from "./json-record.ts";

/** Rewrite a selected Codex Fast Mode variant to the real model and priority service tier. */
export function rewriteCodexFastRequestPayload(
	payload: unknown,
	visibleModelId: string,
	baseModels: readonly Model<Api>[],
): unknown {
	const upstreamModelId = resolveCodexFastUpstreamModelId(visibleModelId, baseModels);
	if (!upstreamModelId) return payload;
	if (!isJsonRecord(payload)) {
		throw new Error("Codex Fast request payload must be a JSON object");
	}
	return { ...payload, model: upstreamModelId, service_tier: "priority" };
}

/** Add the priority routing hint used by the official Codex Fast Mode client. */
export function addCodexFastRoutingHint(
	headers: ProviderHeaders,
	visibleModelId: string,
	baseModels: readonly Model<Api>[],
): void {
	const upstreamModelId = resolveCodexFastUpstreamModelId(visibleModelId, baseModels);
	if (!upstreamModelId) return;
	headers["x-codex-routing-hint"] = `model=${upstreamModelId};tier=priority`;
}

