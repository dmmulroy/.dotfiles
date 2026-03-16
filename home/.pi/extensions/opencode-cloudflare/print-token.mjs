#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GATEWAY_ORIGIN = "https://opencode.cloudflare.dev";
const WELL_KNOWN_URL = `${GATEWAY_ORIGIN}/.well-known/opencode`;
const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";
const AUTH_FILE_ENV = "OPENCODE_CLOUDFLARE_AUTH_FILE";
const EXTENSION_SETTINGS_FILE = "settings-extensions.json";
const EXTENSION_SETTINGS_KEY = "opencode-cloudflare";
const EXTENSION_SETTINGS_AUTH_FILE_KEY = "authFilePath";

function getAgentDir() {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		if (envDir === "~") return os.homedir();
		if (envDir.startsWith("~/")) return path.join(os.homedir(), envDir.slice(2));
		return envDir;
	}
	return path.join(os.homedir(), ".pi", "agent");
}

function readConfiguredAuthFilePath() {
	const settingsPath = path.join(getAgentDir(), EXTENSION_SETTINGS_FILE);
	if (!fs.existsSync(settingsPath)) return undefined;
	try {
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		const value = settings?.[EXTENSION_SETTINGS_KEY]?.[EXTENSION_SETTINGS_AUTH_FILE_KEY];
		return typeof value === "string" && value.trim() ? value.trim() : undefined;
	} catch {
		return undefined;
	}
}

function listCandidates() {
	const candidates = new Set();
	if (process.env[AUTH_FILE_ENV]) candidates.add(path.resolve(process.env[AUTH_FILE_ENV]));
	const configured = readConfiguredAuthFilePath();
	if (configured) candidates.add(path.resolve(configured));
	if (process.env.XDG_DATA_HOME) candidates.add(path.join(process.env.XDG_DATA_HOME, "opencode", "auth.json"));
	candidates.add(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
	return [...candidates];
}

function normalizeKeys() {
	return [GATEWAY_ORIGIN, `${GATEWAY_ORIGIN}/`, WELL_KNOWN_URL];
}

function readImportedToken() {
	for (const authPath of listCandidates()) {
		if (!fs.existsSync(authPath)) continue;
		try {
			const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
			for (const key of normalizeKeys()) {
				const record = auth?.[key];
				if (record && typeof record.token === "string" && record.token.trim()) {
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
if (envToken) {
	process.stdout.write(envToken);
	process.exit(0);
}

const imported = readImportedToken();
if (imported) {
	process.stdout.write(imported);
}
