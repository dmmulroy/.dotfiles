import { failure, type Result, success } from "./result.ts";

/** JSON primitive admitted by `JSON.parse`. */
export type JsonPrimitive = null | boolean | number | string;

/** JSON object produced by {@link parseJsonValue}. */
export type JsonObject = { readonly [key: string]: JsonValue };

/** Parsed JSON value. Untrusted input becomes this only through {@link parseJsonValue}. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

/** Parse failure for a value that is not JSON. */
export class JsonValueParseError extends Error {
	readonly _tag = "JsonValueParseError" as const;

	/**
	 * Create a JSON value parse failure.
	 *
	 * @param path - JSON path containing the invalid value.
	 * @param expected - Safe description of the expected JSON value.
	 */
	constructor(
		readonly path: string,
		readonly expected: string,
	) {
		super(`Invalid JSON value at ${path}; expected ${expected}`);
		this.name = "JsonValueParseError";
	}
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isPlainObject(value: unknown): value is { readonly [key: string]: unknown } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decode untrusted input into a JSON value.
 *
 * This is the JSON parse boundary. Callers pass the result into named domain
 * parsers instead of repeating `typeof` checks on untrusted input.
 *
 * @param input - Untrusted value, typically from `JSON.parse` or `Response.json`.
 */
export function parseJsonValue(input: unknown, path = "$"): Result<JsonValue, JsonValueParseError> {
	if (input === null) return success(null);
	if (isBoolean(input) || isString(input)) return success(input);
	if (isFiniteNumber(input)) return success(input);
	if (Array.isArray(input)) {
		const values: JsonValue[] = [];
		for (let index = 0; index < input.length; index += 1) {
			const parsed = parseJsonValue(input[index], `${path}[${index}]`);
			if (!parsed.ok) return parsed;
			values.push(parsed.value);
		}
		return success(values);
	}
	if (isPlainObject(input)) {
		const entries: Array<readonly [string, JsonValue]> = [];
		for (const [key, value] of Object.entries(input)) {
			const parsed = parseJsonValue(value, `${path}.${key}`);
			if (!parsed.ok) return parsed;
			entries.push([key, parsed.value]);
		}
		return success(Object.fromEntries(entries));
	}
	return failure(new JsonValueParseError(path, "a JSON value"));
}

/**
 * Decode untrusted input into a JSON object.
 *
 * @param input - Untrusted value expected to be a JSON object.
 */
export function parseJsonObject(input: unknown, path = "$"): Result<JsonObject, JsonValueParseError> {
	const parsed = parseJsonValue(input, path);
	if (!parsed.ok) return parsed;
	if (!isJsonObject(parsed.value)) return failure(new JsonValueParseError(path, "an object"));
	return success(parsed.value);
}

/**
 * Return whether a parsed JSON value is an object.
 *
 * @param value - Already-decoded JSON value.
 */
export function isJsonObject(value: JsonValue): value is JsonObject {
	return value !== null && !Array.isArray(value) && !isJsonBoolean(value) && !isJsonNumber(value) && !isJsonString(value);
}

/**
 * Return whether a parsed JSON value is a string.
 *
 * @param value - Already-decoded JSON value.
 */
export function isJsonString(value: JsonValue): value is string {
	return isString(value);
}

/**
 * Return whether a parsed JSON value is a finite number.
 *
 * @param value - Already-decoded JSON value.
 */
export function isJsonNumber(value: JsonValue): value is number {
	return isFiniteNumber(value);
}

/**
 * Return whether a parsed JSON value is a boolean.
 *
 * @param value - Already-decoded JSON value.
 */
export function isJsonBoolean(value: JsonValue): value is boolean {
	return isBoolean(value);
}
