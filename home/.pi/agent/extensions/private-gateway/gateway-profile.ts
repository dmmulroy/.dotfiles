import { Type, type Static } from "typebox";
import { Compile } from "typebox/compile";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

declare const profileBrand: unique symbol;
declare const authOriginBrand: unique symbol;
declare const inferenceOriginBrand: unique symbol;
/** Stable Pi provider identity, constructed by the settings parser. */
export type GatewayProfileId = string & { readonly [profileBrand]: true };
/** Trusted HTTPS origin for Access login and well-known configuration. */
export type GatewayAuthOrigin = string & { readonly [authOriginBrand]: true };
/** Trusted HTTPS origin for inference and backend model-list requests. */
export type GatewayInferenceOrigin = string & { readonly [inferenceOriginBrand]: true };

const ModelIdSchema = Type.String({ minLength: 1, pattern: "^[^\\s\\x00-\\x1f\\x7f]+$" });
const ModelFilterSchema = Type.Object({
	include: Type.Optional(Type.Array(ModelIdSchema, { uniqueItems: true })),
	exclude: Type.Optional(Type.Array(ModelIdSchema, { uniqueItems: true })),
}, { additionalProperties: false });
const SettingsSchema = Type.Object({
	profiles: Type.Array(Type.Object({
		id: Type.String({ pattern: "^[a-z0-9][a-z0-9._-]*$" }),
		name: Type.String({ minLength: 1, pattern: "^[^\\x00-\\x1f\\x7f]+$" }),
		authOrigin: Type.String(),
		inferenceOrigin: Type.String(),
		tokenEnvironmentVariable: Type.Optional(Type.String({ pattern: "^[A-Z_][A-Z0-9_]*$" })),
		models: Type.Optional(ModelFilterSchema),
	}, { additionalProperties: false })),
}, { additionalProperties: false });
const settingsValidator = Compile(SettingsSchema);

/** Exact request-ID filters. An absent include means all; an empty include means none; exclude wins. */
export type GatewayModelFilter = {
	readonly [Key in keyof Static<typeof ModelFilterSchema>]: Readonly<Static<typeof ModelFilterSchema>[Key]>;
};
/** Parsed profile, independent of every other configured gateway. */
export interface GatewayProfile {
	readonly id: GatewayProfileId;
	readonly name: string;
	readonly authOrigin: GatewayAuthOrigin;
	readonly inferenceOrigin: GatewayInferenceOrigin;
	readonly tokenEnvironmentVariable?: string;
	readonly models: GatewayModelFilter;
}
/** Parsed private settings. Credentials are never stored in this document. */
export interface GatewaySettings { readonly profiles: readonly GatewayProfile[] }

/** Configuration failures deliberately omit rejected values, which can contain private model IDs. */
export class GatewaySettingsError extends Error {
	readonly _tag = "GatewaySettingsError" as const;
	/** Safe classification and fixed recovery guidance, never schema values. */
	constructor(readonly reason: "schema" | "origin" | "duplicate-profile" | "io" | "conflict" | "locked" | "cancelled") {
		super(`Private gateway settings: ${reason}. Check the private JSON file; reload before retrying a conflicting save.`);
	}
}

function parseOrigin(input: string): string | undefined {
	try {
		const url = new URL(input);
		if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return undefined;
		return url.origin;
	} catch { return undefined; }
}

/** Parse current JSON settings, rejecting unknown fields and duplicate profile identities. */
export function parseGatewaySettings(input: unknown): GatewayResult<GatewaySettings, GatewaySettingsError> {
	if (!settingsValidator.Check(input)) return gatewayFailure(new GatewaySettingsError("schema"));
	const profiles: GatewayProfile[] = [];
	const ids = new Set<string>();
	for (const value of input.profiles) {
		if (ids.has(value.id)) return gatewayFailure(new GatewaySettingsError("duplicate-profile"));
		ids.add(value.id);
		const authOrigin = parseOrigin(value.authOrigin);
		const inferenceOrigin = parseOrigin(value.inferenceOrigin);
		if (!authOrigin || !inferenceOrigin) return gatewayFailure(new GatewaySettingsError("origin"));
		profiles.push({
			// SAFETY: the schema established the ID pattern; parseOrigin established both HTTPS origin invariants.
			id: value.id as GatewayProfileId,
			name: value.name,
			authOrigin: authOrigin as GatewayAuthOrigin,
			inferenceOrigin: inferenceOrigin as GatewayInferenceOrigin,
			...(value.tokenEnvironmentVariable ? { tokenEnvironmentVariable: value.tokenEnvironmentVariable } : {}),
			models: structuredClone(value.models ?? {}),
		});
	}
	return gatewaySuccess({ profiles });
}

/** Apply a profile's explicit visibility policy to final request model IDs. */
export function gatewayModelIncluded(id: string, filter: GatewayModelFilter): boolean {
	return (filter.include === undefined || filter.include.includes(id)) && !filter.exclude?.includes(id);
}
