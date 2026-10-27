/**
 * Exposes the vendored @herdr/sdk to pi codemode scripts as `tools.herdr_*` tools.
 *
 * Like Cloudflare's Code Mode MCP server, only a search tool is listed in the codemode description:
 * `herdr_search` returns the usage instructions and matching tools, `describeTool(name)` gives a
 * signature, and every operation tool is deferred (callable, never listed).
 */
import type { ExtensionAPI, ToolDefinition, ToolNamespace } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import type { Layer } from "effect";
import { herdrSdkLayerFromOptions, type HerdrSdk } from "./vendor/herdr-sdk/index.mjs";
import { herdrToolOperations, type HerdrToolOperation } from "./herdr-tool-operations.ts";
import { HerdrToolRuntime, makeHerdrToolProgram, toHerdrToolResult } from "./herdr-tool-runtime.ts";
import {
	herdrToolOutputJsonSchema,
	herdrToolParametersJsonSchema,
	herdrToolVoidOutputJsonSchema,
} from "./herdr-tool-schemas.ts";
import { herdrToolInstructions, toHerdrSearchToolDefinition } from "./herdr-tool-search.ts";

const EXTENSION_VERSION = "0.1.0";

export const herdrToolNamespace: ToolNamespace = {
	name: "herdr",
	description: "Herdr terminal workspaces, tabs, panes, and agents.",
	instructions: herdrToolInstructions,
};

/** Builds the pi tool definition for one Herdr operation. */
export function toHerdrToolDefinition(
	operation: HerdrToolOperation,
	runtime: HerdrToolRuntime,
): ToolDefinition<TSchema, undefined> {
	return {
		name: `herdr_${operation.name}`,
		label: `herdr ${operation.name.replaceAll("_", ".")}`,
		description: operation.description,
		parameters: herdrToolParametersJsonSchema(operation) as TSchema,
		outputSchema: (operation.output === "void"
			? herdrToolVoidOutputJsonSchema
			: herdrToolOutputJsonSchema(operation.output)) as TSchema,
		exposure: "deferred",
		namespace: herdrToolNamespace,
		annotations: operation.annotations,
		async execute(_toolCallId, params, signal) {
			const exit = await runtime.run(makeHerdrToolProgram(operation, params as Record<string, unknown>), signal);
			try {
				return toHerdrToolResult(exit);
			} catch (error) {
				// A configuration failure is cached by the runtime's Layer; rebuild it on the next call.
				if ((error as { tag?: string }).tag === "HerdrConfigurationError") await runtime.dispose();
				throw error;
			}
		},
	};
}

/** Whether this pi process should register Herdr tools: inside Herdr, or when forced on. */
export function shouldRegisterHerdrTools(env: NodeJS.ProcessEnv): boolean {
	if (env.PI_HERDR_CODEMODE === "0") return false;
	return (
		env.PI_HERDR_CODEMODE === "1" ||
		env.HERDR_ENV === "1" ||
		env.HERDR_SOCKET_PATH !== undefined ||
		env.HERDR_SESSION !== undefined
	);
}

/** Registers `herdr_search` and every Herdr operation tool; the SDK runtime is built on the first call and disposed with the session. */
export function registerHerdrCodemodeTools(
	pi: ExtensionAPI,
	makeLayer: () => Layer.Layer<HerdrSdk, unknown> = () =>
		herdrSdkLayerFromOptions({ application: { name: "pi-herdr-codemode", version: EXTENSION_VERSION } }),
): HerdrToolRuntime {
	const runtime = new HerdrToolRuntime(makeLayer);
	pi.registerTool({ ...toHerdrSearchToolDefinition(herdrToolOperations), namespace: herdrToolNamespace });
	for (const operation of herdrToolOperations) pi.registerTool(toHerdrToolDefinition(operation, runtime));
	pi.on("session_shutdown", () => runtime.dispose());
	return runtime;
}

export default function herdrCodemodeExtension(pi: ExtensionAPI) {
	if (!shouldRegisterHerdrTools(process.env)) return;
	registerHerdrCodemodeTools(pi);
}
