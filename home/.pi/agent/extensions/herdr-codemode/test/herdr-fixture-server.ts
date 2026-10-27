/**
 * Isolated Herdr socket fixture: answers every wire method with a response synthesized from the
 * vendored wire schema, mirroring the SDK's own parity fixture. Tests never touch a live Herdr.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import herdrApiSchema from "../vendor/herdr-sdk/herdr-api.schema.json" with { type: "json" };
import wireResultTypes from "../vendor/herdr-sdk/wire-result-types.json" with { type: "json" };

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonSchemaNode = { [key: string]: any };

export interface HerdrFixtureRequest {
	readonly id: string;
	readonly method: string;
	readonly params: Record<string, JsonValue>;
}

/** What the fixture sends for one request: a JSON response, or nothing (the request stalls). */
export type HerdrFixtureReply = { readonly kind: "json"; readonly body: JsonValue } | { readonly kind: "stall" };

export const allHerdrWireMethods: readonly string[] = Object.keys(wireResultTypes);

const successDefinitions: Record<string, JsonSchemaNode> = herdrApiSchema.schemas.success_response.$defs;
const resultSchemas: JsonSchemaNode[] = successDefinitions.ResponseResult!.oneOf;

function synthesize(schema: JsonSchemaNode | boolean, key: string): JsonValue {
	if (schema === false) throw new Error("Cannot synthesize a false JSON schema");
	if (schema === true) return {};
	if (typeof schema.$ref === "string") {
		const definition = successDefinitions[schema.$ref.split("/").at(-1)!];
		if (definition === undefined) throw new Error(`Unknown success-schema reference ${schema.$ref}`);
		return synthesize(definition, key);
	}
	if (schema.const !== undefined) return schema.const;
	if (Array.isArray(schema.enum)) return schema.enum[0];
	const union = schema.oneOf?.[0] ?? schema.anyOf?.[0];
	if (union !== undefined) return synthesize(union, key);
	const type = Array.isArray(schema.type) ? schema.type.find((candidate: string) => candidate !== "null") : schema.type;
	switch (type) {
		case "object": {
			const output: { [key: string]: JsonValue } = {};
			for (const required of schema.required ?? []) output[required] = synthesize(schema.properties[required], required);
			return output;
		}
		case "array":
			return [];
		case "boolean":
			return false;
		case "integer":
		case "number": {
			const minimum = schema.minimum ?? 0;
			return typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : minimum;
		}
		case "null":
			return null;
		case "string": {
			const lower = key.toLowerCase();
			const isPath = lower.includes("path") || lower === "cwd" || lower.endsWith("_cwd") || lower.endsWith("_root");
			return isPath ? "/tmp/herdr-codemode-fixture" : "fixture";
		}
		default:
			return {};
	}
}

/** A schema-valid success response for one request, as Herdr protocol 22 would send it. */
export function makeHerdrFixtureSuccess(request: HerdrFixtureRequest): JsonValue {
	if (request.method === "ping") {
		return { id: request.id, result: { type: "pong", version: "0.9.5", protocol: 22 } };
	}
	const accepted = (wireResultTypes as Record<string, string[]>)[request.method];
	if (accepted === undefined) throw new Error(`Fixture has no result type for ${request.method}`);
	const resultType = request.method === "plugin.pane.open" && request.params.placement === "popup" ? "ok" : accepted[0]!;
	const schema = resultSchemas.find((candidate) => candidate.properties?.type?.const === resultType);
	if (schema === undefined) throw new Error(`Fixture has no result schema for ${resultType}`);
	return { id: request.id, result: synthesize(schema, "result") };
}

export interface HerdrFixtureServer {
	readonly socketPath: string;
	readonly requests: HerdrFixtureRequest[];
	close(): Promise<void>;
}

/** Starts a fixture socket; `reply` may override the default schema-valid success per request. */
export async function startHerdrFixtureServer(
	reply: (request: HerdrFixtureRequest) => HerdrFixtureReply | undefined = () => undefined,
): Promise<HerdrFixtureServer> {
	const directory = await mkdtemp(join(tmpdir(), "herdr-cm-"));
	const socketPath = join(directory, "herdr.sock");
	const requests: HerdrFixtureRequest[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => undefined);
		let buffered = "";
		socket.on("data", (chunk) => {
			buffered += chunk.toString("utf8");
			let newline = buffered.indexOf("\n");
			while (newline !== -1) {
				const line = buffered.slice(0, newline);
				buffered = buffered.slice(newline + 1);
				newline = buffered.indexOf("\n");
				if (line.trim() === "") continue;
				const request = JSON.parse(line) as HerdrFixtureRequest;
				requests.push(request);
				const override = request.method === "ping" ? undefined : reply(request);
				if (override?.kind === "stall") continue;
				const body = override?.kind === "json" ? override.body : makeHerdrFixtureSuccess(request);
				socket.write(`${JSON.stringify(body)}\n`);
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => resolve());
	});
	return {
		socketPath,
		requests,
		async close() {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(directory, { recursive: true, force: true });
		},
	};
}
