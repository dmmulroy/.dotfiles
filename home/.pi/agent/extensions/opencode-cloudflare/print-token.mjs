#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GATEWAY_ORIGIN = "https://opencode.cloudflare.dev";
const WELL_KNOWN_URL = `${GATEWAY_ORIGIN}/.well-known/opencode`;
const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";
const AUTH_FILE_ENV = "OPENCODE_CLOUDFLARE_AUTH_FILE";

function listCandidates() {
	const candidates = new Set();
	if (process.env[AUTH_FILE_ENV]) candidates.add(path.resolve(process.env[AUTH_FILE_ENV]));
	if (process.env.XDG_DATA_HOME) candidates.add(path.join(process.env.XDG_DATA_HOME, "opencode", "auth.json"));
	candidates.add(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
	return [...candidates];
}

function normalizeKeys() {
	return [GATEWAY_ORIGIN, `${GATEWAY_ORIGIN}/`, WELL_KNOWN_URL];
}

function getGatewayTokenExpiry(token) {
	const parts = token.split(".");
	if (parts.length < 2) return undefined;
	try {
		const payloadPart = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const payload = JSON.parse(Buffer.from(payloadPart.padEnd(payloadPart.length + ((4 - payloadPart.length % 4) % 4), "="), "base64").toString("utf8"));
		return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

function isUsableToken(token) {
	if (!token) return false;
	const expiresAt = getGatewayTokenExpiry(token);
	return !expiresAt || expiresAt > Date.now();
}

function readImportedToken() {
	for (const authPath of listCandidates()) {
		if (!fs.existsSync(authPath)) continue;
		try {
			const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
			for (const key of normalizeKeys()) {
				const record = auth?.[key];
				if (record && typeof record.token === "string" && isUsableToken(record.token.trim())) {
					return record.token.trim();
				}
			}
		} catch {
			// Ignore parse errors and try the next candidate.
		}
	}
	return undefined;
}

const envToken = process.env[TOKEN_ENV_OVERRIDE]?.trim();
if (isUsableToken(envToken)) {
	process.stdout.write(envToken);
	process.exit(0);
}

const imported = readImportedToken();
if (imported) {
	process.stdout.write(imported);
	process.exit(0);
}

// Let pi's OAuth provider path or custom stream surface the actionable login error.
process.exit(0);
