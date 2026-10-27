/**
 * JSON Schemas and JSON values for Herdr codemode tools, derived from the vendored SDK's Effect
 * Schemas so tool parameters and results cannot drift from the SDK.
 *
 * - Parameters: one flat object. SDK positional arguments become named fields, and object inputs
 *   (including unions of objects such as `{ tabId } | { paneId }`) spread into top-level fields.
 * - Results: the SDK's decoded domain values as plain JSON. Effect `Option` becomes `value | null`,
 *   and `void` becomes `null`.
 */
import { Duration, Option, Schema } from "effect";

/** A JSON Schema node. */
export type JsonSchema = { readonly [key: string]: unknown };

/** A JSON value returned to codemode scripts as `structuredContent`. */
export type HerdrToolJson =
	| null
	| boolean
	| number
	| string
	| HerdrToolJson[]
	| { [key: string]: HerdrToolJson };

/** JSON Schema of a tool that resolves to nothing. */
export const herdrToolVoidOutputJsonSchema: JsonSchema = { type: "null" };

interface JsonSchemaParts {
	readonly schema: JsonSchema;
	readonly definitions: Record<string, JsonSchema>;
}

function toJsonSchemaParts(schema: Schema.Top): JsonSchemaParts {
	const document = Schema.toJsonSchemaDocument(schema);
	return {
		schema: mergeConstraintAllOf(document.schema) as JsonSchema,
		definitions: mergeConstraintAllOf(document.definitions) as Record<string, JsonSchema>,
	};
}

/**
 * Effect emits checks as `{ type: "string", allOf: [{ minLength: 1 }] }`. Codemode declarations
 * render that as `unknown`, so fold constraint-only `allOf` members into their parent.
 */
function mergeConstraintAllOf(node: unknown): unknown {
	return mapJsonSchema(node, (candidate) => {
		const members = candidate.allOf;
		if (!Array.isArray(members)) return undefined;
		const isConstraint = (member: unknown) =>
			typeof member === "object" &&
			member !== null &&
			!["type", "$ref", "anyOf", "oneOf", "allOf", "properties", "items"].some((key) => key in member);
		if (!members.every(isConstraint)) return undefined;
		const { allOf: _allOf, ...rest } = candidate;
		const merged: Record<string, unknown> = { ...rest };
		for (const member of members as JsonSchema[]) {
			for (const [key, value] of Object.entries(member)) if (!(key in merged)) merged[key] = value;
		}
		return mergeConstraintAllOf(merged) as JsonSchema;
	});
}

/** Validation-only keywords; result schemas document shape, so they drop these. */
const RESULT_SCHEMA_VALIDATION_KEYWORDS = new Set([
	"minLength",
	"maxLength",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minItems",
	"maxItems",
	"pattern",
	"format",
	"additionalProperties",
]);

/** Result schemas keep types and field names only: `integer` becomes `number`, constraints go. */
function toResultShapeSchema(node: unknown): unknown {
	return mapJsonSchema(node, (candidate) => {
		const output: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(candidate)) {
			if (RESULT_SCHEMA_VALIDATION_KEYWORDS.has(key) && typeof value !== "object") continue;
			if (key === "additionalProperties" && value === false) continue;
			if (key === "type" && value === "integer") {
				output[key] = "number";
				continue;
			}
			output[key] = key === "properties" || key === "$defs"
				? Object.fromEntries(Object.entries(value as JsonSchema).map(([name, child]) => [name, toResultShapeSchema(child)]))
				: toResultShapeSchema(value);
		}
		return output;
	});
}

function mapJsonSchema(node: unknown, visit: (node: JsonSchema) => JsonSchema | undefined): unknown {
	if (Array.isArray(node)) return node.map((item) => mapJsonSchema(item, visit));
	if (typeof node !== "object" || node === null) return node;
	const replaced = visit(node as JsonSchema);
	if (replaced !== undefined) return replaced;
	return Object.fromEntries(
		Object.entries(node).map(([key, value]) => [key, mapJsonSchema(value, visit)]),
	);
}

/**
 * Collects `$defs` from several schema documents into one, renaming colliding definitions and
 * rewriting the `#/$defs/...` references of each document that was renamed.
 */
class HerdrJsonSchemaDefinitions {
	readonly definitions: Record<string, JsonSchema> = {};

	adopt(parts: JsonSchemaParts): JsonSchema {
		const renames = new Map<string, string>();
		for (const [name, definition] of Object.entries(parts.definitions)) {
			const existing = this.definitions[name];
			if (existing === undefined || JSON.stringify(existing) === JSON.stringify(definition)) continue;
			let index = 1;
			while (this.definitions[`${name}_${index}`] !== undefined) index++;
			renames.set(name, `${name}_${index}`);
		}
		const rewrite = (node: unknown) =>
			mapJsonSchema(node, (candidate) => {
				const ref = candidate.$ref;
				if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return undefined;
				const renamed = renames.get(ref.slice("#/$defs/".length));
				return renamed === undefined ? undefined : { ...candidate, $ref: `#/$defs/${renamed}` };
			}) as JsonSchema;
		for (const [name, definition] of Object.entries(parts.definitions)) {
			this.definitions[renames.get(name) ?? name] = rewrite(definition);
		}
		return rewrite(parts.schema);
	}

	attachTo(schema: JsonSchema): JsonSchema {
		return Object.keys(this.definitions).length === 0 ? schema : { ...schema, $defs: this.definitions };
	}
}

/** Object variants of an input schema: one for an object, several for a union of objects. */
function objectVariantsOf(schema: JsonSchema): readonly JsonSchema[] | undefined {
	if (schema.type === "object") return [schema];
	const variants = schema.anyOf;
	if (Array.isArray(variants) && variants.every((variant) => (variant as JsonSchema).type === "object")) {
		return variants as JsonSchema[];
	}
	return undefined;
}

function isForbiddenProperty(schema: unknown): boolean {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"not" in schema &&
		Object.keys(schema).length === 1
	);
}

/** Parameter layout of one Herdr tool. */
export interface HerdrToolParameterShape {
	/** Named fields for SDK positional arguments, such as `{ paneId: PaneId }`. */
	readonly fields?: Schema.Struct.Fields;
	/** SDK object input whose fields become top-level tool fields. */
	readonly spread?: Schema.Top;
	/** Whether the SDK accepts the spread input as absent. Its fields are then all optional. */
	readonly spreadOptional?: boolean;
	/** Spread fields the tool requires although the SDK input leaves them optional. */
	readonly requiredSpreadFields?: readonly string[];
}

/** Field accepted by every Herdr tool: the local SDK deadline for that call. */
export const HERDR_REQUEST_TIMEOUT_FIELD = "requestTimeoutMs";

/**
 * Flat JSON Schema for a tool's parameters. Throws when two parts declare one field differently,
 * so a bad operation table fails at registration and in tests rather than at call time.
 */
export function herdrToolParametersJsonSchema(shape: HerdrToolParameterShape): JsonSchema {
	const definitions = new HerdrJsonSchemaDefinitions();
	const properties: Record<string, unknown> = {};
	const required = new Set<string>();

	const addProperties = (variants: readonly JsonSchema[], optional: boolean, origin: string) => {
		// Per key: the schema seen so far and whether it came from a variant that requires the key.
		const seenInThisPart = new Map<string, { encoded: string; required: boolean }>();
		for (const variant of variants) {
			const variantRequired = new Set((variant.required ?? []) as string[]);
			for (const [key, property] of Object.entries((variant.properties ?? {}) as Record<string, unknown>)) {
				if (isForbiddenProperty(property)) continue;
				const encoded = JSON.stringify(property);
				const required = variantRequired.has(key);
				const previous = seenInThisPart.get(key);
				if (previous === undefined && key in properties) {
					throw new Error(`Herdr tool parameter "${key}" is declared twice (${origin})`);
				}
				if (previous !== undefined && previous.encoded !== encoded) {
					// Variants may constrain a shared key differently, such as `keys` needing one item only
					// when it is the required field. Keep the schema of a variant where the key is optional;
					// the SDK still checks the exact variant when it decodes the input.
					if (previous.required === required) {
						throw new Error(`Herdr tool parameter "${key}" differs between variants of ${origin}`);
					}
					if (!previous.required) continue;
				}
				seenInThisPart.set(key, { encoded, required });
				properties[key] = property;
			}
		}
		if (optional || variants.length !== 1) return;
		for (const key of (variants[0]?.required ?? []) as string[]) required.add(key);
	};

	if (shape.fields !== undefined && Object.keys(shape.fields).length > 0) {
		const fieldsSchema = definitions.adopt(toJsonSchemaParts(Schema.Struct(shape.fields)));
		addProperties([fieldsSchema], false, "fields");
	}
	if (shape.spread !== undefined) {
		const spreadSchema = definitions.adopt(toJsonSchemaParts(shape.spread));
		const variants = objectVariantsOf(spreadSchema);
		if (variants === undefined) throw new Error("Herdr tool spread input must be an object or a union of objects");
		addProperties(variants, shape.spreadOptional === true, "spread input");
	}
	for (const key of shape.requiredSpreadFields ?? []) {
		if (!(key in properties)) throw new Error(`Herdr tool cannot require unknown parameter "${key}"`);
		required.add(key);
	}
	if (HERDR_REQUEST_TIMEOUT_FIELD in properties) {
		throw new Error(`Herdr tool parameter "${HERDR_REQUEST_TIMEOUT_FIELD}" is reserved`);
	}
	// Plain number keeps every declaration short; the SDK rejects negative or non-finite deadlines.
	properties[HERDR_REQUEST_TIMEOUT_FIELD] = { type: "number" };

	return definitions.attachTo({
		type: "object",
		properties: withoutNonEmptyStringChecks(properties),
		...(required.size > 0 ? { required: [...required] } : {}),
		additionalProperties: false,
	});
}

/**
 * Drops `minLength: 1` from string parameters. Nearly every ID carries it, and codemode renders it
 * as a comment line per field; the SDK still rejects empty IDs and strings when it decodes them.
 */
function withoutNonEmptyStringChecks(properties: Record<string, unknown>): Record<string, unknown> {
	return mapJsonSchema(properties, (candidate) => {
		if (candidate.type !== "string" || candidate.minLength !== 1) return undefined;
		const { minLength: _minLength, ...rest } = candidate;
		return withoutNonEmptyStringChecks(rest) as JsonSchema;
	}) as Record<string, unknown>;
}

/** Effect Schema's JSON form of `Option<A>`: `{ _tag: "Some", value: A } | { _tag: "None" }`. */
function optionValueSchema(node: JsonSchema): unknown | undefined {
	const variants = node.anyOf;
	if (!Array.isArray(variants) || variants.length !== 2) return undefined;
	const [some, none] = variants as JsonSchema[];
	const tagOf = (variant: JsonSchema | undefined) =>
		((variant?.properties as Record<string, JsonSchema> | undefined)?._tag?.enum as unknown[] | undefined)?.[0];
	if (tagOf(some) !== "Some" || tagOf(none) !== "None") return undefined;
	return (some?.properties as Record<string, unknown>).value;
}

/** JSON Schema of a tool result, matching what {@link encodeHerdrToolResult} produces. */
export function herdrToolOutputJsonSchema(schema: Schema.Top): JsonSchema {
	const definitions = new HerdrJsonSchemaDefinitions();
	const rewriteOptions = (node: unknown): unknown =>
		mapJsonSchema(node, (candidate) => {
			const value = optionValueSchema(candidate);
			return value === undefined ? undefined : { anyOf: [rewriteOptions(value), { type: "null" }] };
		});
	const parts = toJsonSchemaParts(Schema.toType(schema));
	const root = definitions.adopt({
		schema: rewriteOptions(parts.schema) as JsonSchema,
		definitions: Object.fromEntries(
			Object.entries(parts.definitions).map(([name, definition]) => [name, rewriteOptions(definition) as JsonSchema]),
		),
	});
	return toResultShapeSchema(definitions.attachTo(root)) as JsonSchema;
}

/** Converts a decoded SDK value into the plain JSON a script receives. */
export function encodeHerdrToolResult(value: unknown): HerdrToolJson {
	if (value === undefined || value === null) return null;
	if (Option.isOption(value)) return Option.isSome(value) ? encodeHerdrToolResult(value.value) : null;
	if (Duration.isDuration(value)) return Duration.toMillis(value);
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(encodeHerdrToolResult);
	switch (typeof value) {
		case "boolean":
		case "string":
			return value;
		case "number":
			return Number.isFinite(value) ? value : null;
		case "bigint":
			return value.toString();
		case "object": {
			const output: { [key: string]: HerdrToolJson } = {};
			for (const [key, field] of Object.entries(value)) {
				if (field !== undefined) output[key] = encodeHerdrToolResult(field);
			}
			return output;
		}
		default:
			throw new Error(`Herdr tool result contains an unsupported ${typeof value} value`);
	}
}
