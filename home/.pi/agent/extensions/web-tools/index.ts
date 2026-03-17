import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebFetchTool } from "./webfetch.ts";
import { createWebSearchTool } from "./websearch.ts";

export default function webToolsExtension(pi: ExtensionAPI) {
	pi.registerTool(createWebFetchTool());
	pi.registerTool(createWebSearchTool());
}
