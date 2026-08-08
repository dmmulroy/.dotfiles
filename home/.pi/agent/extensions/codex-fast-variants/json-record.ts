/** A parsed JSON object with unknown property values. */
export type JsonRecord = Readonly<Record<string, unknown>>;

/** Determine whether an unknown JSON value is a non-array object. */
export function isJsonRecord(input: unknown): input is JsonRecord {
	return input !== null && typeof input === "object" && !Array.isArray(input);
}
