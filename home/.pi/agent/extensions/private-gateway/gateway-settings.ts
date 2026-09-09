import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { GatewaySettingsError, parseGatewaySettings, type GatewayModelFilter, type GatewayProfileId, type GatewaySettings } from "./gateway-profile.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Resolve private configuration through Pi's agent directory, never relative to a project cwd. */
export function gatewaySettingsPath(): string { return join(getAgentDir(), "private-gateway.json"); }

/** A validated settings snapshot and optimistic revision, with symlinks resolved to their canonical file. */
export interface GatewaySettingsSnapshot {
	readonly path: string;
	readonly revision: string;
	readonly settings: GatewaySettings;
}

function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
function revision(text: string): string { return createHash("sha256").update(text).digest("hex"); }

/** Missing configuration disables the extension; malformed or unreadable configuration is an explicit failure. */
export async function readGatewaySettings(path: string): Promise<GatewayResult<GatewaySettingsSnapshot | undefined, GatewaySettingsError>> {
	try {
		const target = await realpath(path);
		const handle = await open(target, "r");
		let text: string;
		try {
			const buffer = Buffer.alloc(1_048_577);
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
			if (bytesRead > 1_048_576) return gatewayFailure(new GatewaySettingsError("schema"));
			text = buffer.toString("utf8", 0, bytesRead);
		} finally { await handle.close(); }
		let input: unknown;
		try { input = JSON.parse(text); } catch { return gatewayFailure(new GatewaySettingsError("schema")); }
		const parsed = parseGatewaySettings(input);
		return parsed.ok ? gatewaySuccess({ path: target, revision: revision(text), settings: parsed.value }) : parsed;
	} catch (error) {
		if (errorCode(error) !== "ENOENT") return gatewayFailure(new GatewaySettingsError("io"));
		try {
			await lstat(path);
			return gatewayFailure(new GatewaySettingsError("io")); // A dangling stow link is not an absent configuration.
		} catch (missing) {
			return errorCode(missing) === "ENOENT" ? gatewaySuccess(undefined) : gatewayFailure(new GatewaySettingsError("io"));
		}
	}
}

/**
 * Persist only the selected profile's filter after revision checking under an exclusive writer lock.
 * Atomic rename preserves stow symlinks, unrelated profiles, and the previous file on pre-commit failure.
 * A competing save returns conflict/locked instead of overwriting another agent's edits.
 */
export async function saveGatewayModelFilter(
	snapshot: GatewaySettingsSnapshot,
	profileId: GatewayProfileId,
	filter: GatewayModelFilter,
	signal: AbortSignal,
): Promise<GatewayResult<GatewaySettingsSnapshot, GatewaySettingsError>> {
	if (signal.aborted) return gatewayFailure(new GatewaySettingsError("cancelled"));
	if (!snapshot.settings.profiles.some((profile) => profile.id === profileId)) return gatewayFailure(new GatewaySettingsError("conflict"));
	const parsed = parseGatewaySettings({ profiles: snapshot.settings.profiles.map((profile) =>
		profile.id === profileId ? { ...profile, models: filter } : profile,
	) });
	if (!parsed.ok) return parsed;
	const lockPath = `${snapshot.path}.lock`;
	let lock;
	try { lock = await open(lockPath, "wx", 0o600); }
	catch (error) { return gatewayFailure(new GatewaySettingsError(errorCode(error) === "EEXIST" ? "locked" : "io")); }
	const temporary = `${snapshot.path}.${randomUUID()}.tmp`;
	try {
		await lock.writeFile(`${process.pid}\n`);
		const current = await readGatewaySettings(snapshot.path);
		if (!current.ok) return current;
		if (!current.value || current.value.revision !== snapshot.revision) return gatewayFailure(new GatewaySettingsError("conflict"));
		const text = `${JSON.stringify(parsed.value, null, 2)}\n`;
		const file = await open(temporary, "wx", 0o600);
		try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
		if (signal.aborted) return gatewayFailure(new GatewaySettingsError("cancelled"));
		// Recheck after writing the temp file to also detect ordinary editor saves during preparation.
		if (revision(await readFile(snapshot.path, "utf8")) !== snapshot.revision) return gatewayFailure(new GatewaySettingsError("conflict"));
		await rename(temporary, snapshot.path);
		return gatewaySuccess({ path: snapshot.path, revision: revision(text), settings: parsed.value });
	} catch { return gatewayFailure(new GatewaySettingsError("io")); }
	finally {
		await unlink(temporary).catch(() => undefined);
		await lock.close().catch(() => undefined);
		await unlink(lockPath).catch(() => undefined);
	}
}
