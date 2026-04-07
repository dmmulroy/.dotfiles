import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { WebProfile } from "./types.ts";

const HELIUM_USER_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "net.imput.helium");

export async function discoverHeliumProfiles(): Promise<WebProfile[]> {
	return discoverHeliumProfilesFromUserDataDir(HELIUM_USER_DATA_DIR);
}

export async function discoverHeliumProfilesFromUserDataDir(userDataDir: string): Promise<WebProfile[]> {
	const localState = await readLocalState(userDataDir);
	const profileState = localState?.profile;
	const infoCache = profileState?.info_cache;
	if (!infoCache || typeof infoCache !== "object") {
		return [];
	}

	const cdpReachable = await fileExists(path.join(userDataDir, "DevToolsActivePort"));
	const lastUsed = typeof profileState.last_used === "string" ? profileState.last_used : undefined;
	const profiles: WebProfile[] = [];

	for (const [profileId, metadata] of Object.entries(infoCache)) {
		const profileDir = path.join(userDataDir, profileId);
		const cookieDbPath = path.join(profileDir, "Cookies");
		const diskCookiesAvailable = await fileExists(cookieDbPath);
		const displayName = getProfileDisplayName(profileId, metadata);
		profiles.push({
			browser: "helium",
			profileId,
			displayName,
			userDataDir,
			profileDir,
			cookieDbPath,
			isLastActive: profileId === lastUsed,
			cdpReachable,
			diskCookiesAvailable,
		});
	}

	return profiles.sort((a, b) => {
		if (a.isLastActive && !b.isLastActive) return -1;
		if (!a.isLastActive && b.isLastActive) return 1;
		return a.displayName.localeCompare(b.displayName);
	});
}

async function readLocalState(userDataDir: string): Promise<any | null> {
	try {
		const raw = await readFile(path.join(userDataDir, "Local State"), "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function getProfileDisplayName(profileId: string, metadata: unknown): string {
	if (!metadata || typeof metadata !== "object") {
		return profileId;
	}
	const name = (metadata as { name?: unknown }).name;
	return typeof name === "string" && name.trim() ? name.trim() : profileId;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}
