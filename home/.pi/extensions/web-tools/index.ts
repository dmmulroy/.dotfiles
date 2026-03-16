import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerWebToolsSettings } from "./settings.ts";
import { createWebFetchTool } from "./webfetch.ts";
import { createWebSearchTool } from "./websearch.ts";

export default function webToolsExtension(pi: ExtensionAPI) {
	pi.registerTool(createWebFetchTool());
	pi.registerTool(createWebSearchTool());

	registerWebToolsSettings(pi);

	pi.on("session_start", async (_event, _ctx) => {
		registerWebToolsSettings(pi);
	});
}
