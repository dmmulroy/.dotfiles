/**
 * Runs Herdr tool operations on one lazily built SDK runtime and converts their exits into pi tool
 * results: success → `structuredContent` JSON, typed failure → rejection whose message starts with
 * the SDK error tag, interruption (tool abort) → rejection.
 */
import { Cause, Duration, Effect, Exit, Layer, ManagedRuntime, Option, Schema } from "effect";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { HerdrSdk } from "./vendor/herdr-sdk/index.mjs";
import type { HerdrToolOperation } from "./herdr-tool-operations.ts";
import { encodeHerdrToolResult, HERDR_REQUEST_TIMEOUT_FIELD, type HerdrToolJson } from "./herdr-tool-schemas.ts";

/** Extra local deadline beyond a server-side wait, so the server reports its own timeout first. */
export const HERDR_SERVER_WAIT_DEADLINE_MARGIN_MS = 5_000;

/** Owns one SDK runtime for a pi session; rebuilt after `dispose()` or a configuration failure. */
export class HerdrToolRuntime {
	#runtime: ManagedRuntime.ManagedRuntime<HerdrSdk, unknown> | undefined;

	constructor(private readonly makeLayer: () => Layer.Layer<HerdrSdk, unknown>) {}

	async run<A>(effect: Effect.Effect<A, unknown, HerdrSdk>, signal: AbortSignal | undefined) {
		this.#runtime ??= ManagedRuntime.make(this.makeLayer());
		return this.#runtime.runPromiseExit(effect, signal === undefined ? undefined : { signal });
	}

	async dispose(): Promise<void> {
		const runtime = this.#runtime;
		this.#runtime = undefined;
		await runtime?.dispose();
	}
}

/** Error carrying the SDK error tag, so scripts can branch on `error.message.startsWith(tag)`. */
export class HerdrToolError extends Error {
	constructor(
		readonly tag: string,
		message: string,
	) {
		super(`${tag}: ${message}`);
		this.name = "HerdrToolError";
	}
}

function describeFailure(error: unknown): HerdrToolError {
	if (typeof error === "object" && error !== null) {
		const tag = "_tag" in error && typeof error._tag === "string" ? error._tag : (error as Error).name;
		const message = "message" in error && typeof error.message === "string" ? error.message : String(error);
		return new HerdrToolError(tag || "Error", message);
	}
	return new HerdrToolError("Error", String(error));
}

function serverWaitMillis(params: Record<string, unknown>): number | undefined {
	const wait = params.wait as { timeoutMs?: unknown } | undefined;
	const timeoutMs = params.timeoutMs ?? wait?.timeoutMs;
	return typeof timeoutMs === "number" ? timeoutMs : undefined;
}

/** Splits flat tool parameters back into the SDK's positional fields, input object, and options. */
export function makeHerdrToolProgram(operation: HerdrToolOperation, params: Record<string, unknown>) {
	// Field schemas are context-free SDK schemas (IDs, literals, strings); none needs services.
	const fieldsSchema = Schema.Struct(operation.fields) as unknown as Schema.Codec<Record<string, unknown>, unknown>;
	const decodeFields = Schema.decodeUnknownEffect(fieldsSchema);
	return Effect.gen(function* () {
		const fieldNames = new Set(Object.keys(operation.fields));
		const rawFields: Record<string, unknown> = {};
		const rawInput: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(params)) {
			if (key === HERDR_REQUEST_TIMEOUT_FIELD || value === undefined) continue;
			(fieldNames.has(key) ? rawFields : rawInput)[key] = value;
		}
		const fields = yield* decodeFields(rawFields);
		const input =
			operation.spread === undefined || (operation.spreadOptional && Object.keys(rawInput).length === 0)
				? undefined
				: rawInput;

		const requestTimeoutMs = params[HERDR_REQUEST_TIMEOUT_FIELD];
		const serverWait = serverWaitMillis(params);
		const deadlineMs =
			typeof requestTimeoutMs === "number"
				? requestTimeoutMs
				: serverWait === undefined
					? undefined
					: serverWait + HERDR_SERVER_WAIT_DEADLINE_MARGIN_MS;
		const options = deadlineMs === undefined ? {} : { requestTimeout: Duration.millis(deadlineMs) };

		const herdr = yield* HerdrSdk;
		const result = yield* operation.run(herdr, fields, input, options);
		return encodeHerdrToolResult(result);
	});
}

/** Converts an operation exit into a pi tool result, throwing for every failure. */
export function toHerdrToolResult(exit: Exit.Exit<HerdrToolJson, unknown>): AgentToolResult<undefined> {
	if (Exit.isSuccess(exit)) {
		return {
			content: [{ type: "text", text: JSON.stringify(exit.value) }],
			structuredContent: exit.value,
			details: undefined,
		};
	}
	const error = Cause.findErrorOption(exit.cause);
	if (Option.isSome(error)) throw describeFailure(error.value);
	if (Cause.hasInterruptsOnly(exit.cause)) throw new HerdrToolError("Interrupted", "the Herdr call was aborted");
	throw new HerdrToolError("Defect", Cause.pretty(exit.cause));
}
