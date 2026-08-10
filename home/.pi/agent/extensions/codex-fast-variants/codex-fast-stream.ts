import type {
	Api,
	AssistantMessageEventStream,
	Context,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple as streamSimpleByApi } from "@earendil-works/pi-ai/compat";

import {
	addCodexFastRoutingHint,
	rewriteCodexFastRequestPayload,
} from "./codex-fast-request.ts";
import { resolveCodexFastUpstreamModelId } from "./codex-fast-variants.ts";

/** Create the Codex stream wrapper that applies Fast routing to every request path, including compaction. */
export function createCodexFastStream(
	baseModels: readonly Model<Api>[],
): (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream {
	return (visibleModel, context, options = {}) => {
		const upstreamModelId = resolveCodexFastUpstreamModelId(
			visibleModel.id,
			baseModels,
		);
		if (!upstreamModelId) {
			return streamSimpleByApi(visibleModel, context, options);
		}

		const callerOnPayload = options.onPayload;
		const headers = { ...options.headers };
		addCodexFastRoutingHint(headers, visibleModel.id, baseModels);
		return streamSimpleByApi(visibleModel, context, {
			...options,
			headers,
			onPayload: async (payload, requestModel) => {
				const callerPayload = await callerOnPayload?.(payload, requestModel) ?? payload;
				return rewriteCodexFastRequestPayload(
					callerPayload,
					visibleModel.id,
					baseModels,
				);
			},
		});
	};
}
