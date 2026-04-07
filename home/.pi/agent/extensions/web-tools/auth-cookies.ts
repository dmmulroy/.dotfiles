import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AuthSourceError, toAuthSourceError } from "./auth-errors.ts";
import type { AuthCookie, WebProfile } from "./types.ts";

const execFile = promisify(execFileCallback);
const SAFE_STORAGE_LOOKUPS = [
	["-s", "Helium Storage Key"],
	["-a", "Helium"],
	["-s", "Helium Safe Storage"],
	["-s", "Chromium Safe Storage"],
	["-s", "Chrome Safe Storage"],
	["-s", "Electron Safe Storage"],
] as const;

type SqliteCookieRow = {
	host_key: string;
	name: string;
	value: string;
	encrypted_value_hex: string;
	path: string;
	is_secure: number;
	is_httponly: number;
	has_expires: number;
	expires_utc: number;
	top_frame_site_key?: string | null;
};

interface CookieDbSnapshot {
	rows: SqliteCookieRow[];
	metaVersion: number;
}

type SqliteTableInfoRow = {
	name?: string;
};

export interface ChromiumCookieDecryptContext {
	hostKey: string;
	metaVersion: number;
}

export interface GetCookiesFromProfileDbDependencies {
	querySnapshot?: (profile: WebProfile, signal?: AbortSignal) => Promise<CookieDbSnapshot>;
	decryptValue?: (encryptedValueHex: string, context: ChromiumCookieDecryptContext) => Promise<string>;
}

export async function getCookiesFromProfileDb(
	profile: WebProfile,
	deps: GetCookiesFromProfileDbDependencies = {},
	signal?: AbortSignal,
): Promise<AuthCookie[]> {
	const querySnapshot = deps.querySnapshot ?? queryCookieSnapshot;
	const decryptValue = deps.decryptValue ?? (await createCookieDecryptor(signal));
	throwIfAborted(signal);

	const { rows, metaVersion } = await querySnapshot(profile, signal);
	const cookies: AuthCookie[] = [];

	for (const row of rows) {
		throwIfAborted(signal);
		if (isPartitionedCookieRow(row)) continue;
		const value = await resolveCookieValue(row, { hostKey: row.host_key, metaVersion }, decryptValue);
		const expiresAt = row.has_expires ? chromiumTimestampToUnixMs(row.expires_utc) : undefined;
		cookies.push({
			name: row.name,
			value,
			domain: row.host_key,
			path: row.path || "/",
			secure: Boolean(row.is_secure),
			httpOnly: Boolean(row.is_httponly),
			hostOnly: !row.host_key.startsWith("."),
			...(expiresAt !== undefined ? { expiresAt } : {}),
		});
	}

	return cookies;
}

export function tryDecryptChromiumCookieValue(
	encryptedValueHex: string,
	password: string,
	context: ChromiumCookieDecryptContext,
): string | undefined {
	const encryptedValue = Buffer.from(encryptedValueHex, "hex");
	if (encryptedValue.length === 0) return "";
	return tryDecryptChromiumCookie(encryptedValue, password, context);
}

async function resolveCookieValue(
	row: SqliteCookieRow,
	context: ChromiumCookieDecryptContext,
	decryptValue: (encryptedValueHex: string, context: ChromiumCookieDecryptContext) => Promise<string>,
): Promise<string> {
	if (row.value) return row.value;
	if (!row.encrypted_value_hex) return "";
	try {
		return await decryptValue(row.encrypted_value_hex, context);
	} catch (error) {
		throw new AuthSourceError("disk-cookies", "failed", "Unable to decrypt one or more Helium cookies", error);
	}
}

async function queryCookieSnapshot(profile: WebProfile, signal?: AbortSignal): Promise<CookieDbSnapshot> {
	throwIfAborted(signal);
	if (!(await fileExists(profile.cookieDbPath))) {
		throw new AuthSourceError(
			"disk-cookies",
			"unavailable",
			`Helium cookie DB is unavailable for profile ${profile.displayName}`,
		);
	}

	const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-tools-cookies-"));
	const tempDbPath = path.join(tempDir, "Cookies.sqlite");
	try {
		await copyFile(profile.cookieDbPath, tempDbPath);
		await copyIfExists(`${profile.cookieDbPath}-wal`, `${tempDbPath}-wal`);
		await copyIfExists(`${profile.cookieDbPath}-shm`, `${tempDbPath}-shm`);
		const rows = await queryCookieRowsFromSnapshot(tempDbPath, signal);
		const metaVersion = await readCookieDbMetaVersion(tempDbPath, signal);
		return { rows, metaVersion };
	} catch (error) {
		throw toAuthSourceError(
			"disk-cookies",
			error,
			`Unable to read Helium cookie DB for profile ${profile.displayName}`,
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function queryCookieRowsFromSnapshot(cookieDbPath: string, signal?: AbortSignal): Promise<SqliteCookieRow[]> {
	const columns = await getCookieTableColumns(cookieDbPath, signal);
	const query = [
		"select",
		"host_key,",
		"name,",
		"value,",
		"hex(encrypted_value) as encrypted_value_hex,",
		"path,",
		"is_secure,",
		"is_httponly,",
		"has_expires,",
		"expires_utc,",
		columns.has("top_frame_site_key") ? "top_frame_site_key" : "'' as top_frame_site_key",
		"from cookies",
	].join(" ");
	const parsed = await execSqliteJson(cookieDbPath, query, signal);
	return Array.isArray(parsed) ? (parsed as SqliteCookieRow[]) : [];
}

async function getCookieTableColumns(cookieDbPath: string, signal?: AbortSignal): Promise<Set<string>> {
	const parsed = await execSqliteJson(cookieDbPath, "pragma table_info(cookies)", signal);
	if (!Array.isArray(parsed)) return new Set();
	return new Set(
		parsed
			.map((row) => (typeof (row as SqliteTableInfoRow).name === "string" ? (row as SqliteTableInfoRow).name : undefined))
			.filter((name): name is string => Boolean(name)),
	);
}

async function readCookieDbMetaVersion(cookieDbPath: string, signal?: AbortSignal): Promise<number> {
	const query = "select cast(value as integer) as version from meta where key = 'version' limit 1";
	const parsed = await execSqliteJson(cookieDbPath, query, signal);
	if (!Array.isArray(parsed) || parsed.length === 0) return 0;
	const version = (parsed[0] as { version?: unknown })?.version;
	return typeof version === "number" && Number.isFinite(version) ? version : 0;
}

async function execSqliteJson(cookieDbPath: string, query: string, signal?: AbortSignal): Promise<unknown> {
	throwIfAborted(signal);
	const { stdout } = await execFile("sqlite3", ["-json", cookieDbPath, query], {
		encoding: "utf8",
		timeout: 1_500,
		...(signal ? { signal } : {}),
	});
	return JSON.parse(stdout || "[]");
}

async function createCookieDecryptor(
	signal?: AbortSignal,
): Promise<(encryptedValueHex: string, context: ChromiumCookieDecryptContext) => Promise<string>> {
	const candidatePasswords = await getSafeStoragePasswords(signal);
	return async (encryptedValueHex: string, context: ChromiumCookieDecryptContext) => {
		for (const password of candidatePasswords) {
			throwIfAborted(signal);
			const decrypted = tryDecryptChromiumCookieValue(encryptedValueHex, password, context);
			if (decrypted !== undefined) {
				return decrypted;
			}
		}
		throw new Error("Unable to decrypt Helium cookie value");
	};
}

async function getSafeStoragePasswords(signal?: AbortSignal): Promise<string[]> {
	const passwords = new Set<string>();
	for (const [flag, value] of SAFE_STORAGE_LOOKUPS) {
		throwIfAborted(signal);
		try {
			const { stdout } = await execFile("security", ["find-generic-password", "-w", flag, value], {
				encoding: "utf8",
				timeout: 1_500,
				...(signal ? { signal } : {}),
			});
			const password = stdout.trim();
			if (password) passwords.add(password);
		} catch {
			// Ignore missing keychain items.
		}
	}
	return [...passwords];
}

function isPartitionedCookieRow(row: SqliteCookieRow): boolean {
	// Chromium stores CHIPS/top-frame partition metadata in top_frame_site_key.
	// We intentionally exclude partitioned cookies until request-side partition matching is supported.
	return typeof row.top_frame_site_key === "string" && row.top_frame_site_key.trim().length > 0;
}

function tryDecryptChromiumCookie(
	encryptedValue: Buffer,
	password: string,
	context: ChromiumCookieDecryptContext,
): string | undefined {
	const payload = encryptedValue.subarray(0, 3).toString() === "v10" ? encryptedValue.subarray(3) : encryptedValue;
	if (payload.length === 0 || payload.length % 16 !== 0) return undefined;

	try {
		const key = crypto.pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from("saltysalt"), 1003, 16, "sha1");
		const iv = Buffer.alloc(16, 0x20);
		const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
		decipher.setAutoPadding(false);
		const decrypted = removePkcsPadding(Buffer.concat([decipher.update(payload), decipher.final()]));
		if (!decrypted) return undefined;
		const cookieValueBytes = stripChromiumHostDigest(decrypted, context);
		if (!cookieValueBytes) return undefined;
		const text = new TextDecoder("utf-8", { fatal: true }).decode(cookieValueBytes);
		if (!looksLikeCookieValue(text)) return undefined;
		return text;
	} catch {
		return undefined;
	}
}

function stripChromiumHostDigest(
	decryptedValue: Buffer,
	context: ChromiumCookieDecryptContext,
): Buffer | undefined {
	if (context.metaVersion < 24) return decryptedValue;
	if (decryptedValue.length < 32) return undefined;
	const expectedDigest = crypto.createHash("sha256").update(context.hostKey, "utf8").digest();
	if (!decryptedValue.subarray(0, 32).equals(expectedDigest)) return undefined;
	return decryptedValue.subarray(32);
}

function removePkcsPadding(decryptedValue: Buffer): Buffer | undefined {
	if (decryptedValue.length === 0) return undefined;
	const paddingLength = decryptedValue[decryptedValue.length - 1];
	if (paddingLength < 1 || paddingLength > 16 || paddingLength > decryptedValue.length) return undefined;
	for (let index = decryptedValue.length - paddingLength; index < decryptedValue.length; index += 1) {
		if (decryptedValue[index] !== paddingLength) return undefined;
	}
	return decryptedValue.subarray(0, decryptedValue.length - paddingLength);
}

function looksLikeCookieValue(value: string): boolean {
	return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}

function chromiumTimestampToUnixMs(chromiumMicros: number): number | undefined {
	if (!Number.isFinite(chromiumMicros) || chromiumMicros <= 0) return undefined;
	return Math.round(chromiumMicros / 1000 - 11644473600000);
}

async function copyIfExists(sourcePath: string, targetPath: string): Promise<void> {
	if (!(await fileExists(sourcePath))) return;
	await copyFile(sourcePath, targetPath);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error("Operation cancelled");
}
