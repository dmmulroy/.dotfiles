import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActiveWebIdentity } from "./types.ts";

const WEB_PROFILE_STATE_PATH = path.join(getAgentDir(), "extensions", "web-tools.json");

export function getWebProfileStatePath(): string {
	return WEB_PROFILE_STATE_PATH;
}

export async function loadActiveWebIdentity(statePath = WEB_PROFILE_STATE_PATH): Promise<ActiveWebIdentity> {
	try {
		const raw = await readFile(statePath, "utf8");
		return normalizeActiveWebIdentity(JSON.parse(raw));
	} catch {
		return { kind: "public" };
	}
}

export async function saveActiveWebIdentity(identity: ActiveWebIdentity, statePath = WEB_PROFILE_STATE_PATH): Promise<void> {
	await mkdir(path.dirname(statePath), { recursive: true });
	await writeFile(statePath, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
}

function normalizeActiveWebIdentity(value: unknown): ActiveWebIdentity {
	if (!value || typeof value !== "object") {
		return { kind: "public" };
	}

	const candidate = value as Partial<ActiveWebIdentity> & Record<string, unknown>;
	if (candidate.kind === "helium") {
		return {
			kind: "helium",
			profileId: typeof candidate.profileId === "string" ? candidate.profileId : "Default",
			displayName: typeof candidate.displayName === "string" && candidate.displayName.trim() ? candidate.displayName : "Default",
			userDataDir: typeof candidate.userDataDir === "string" ? candidate.userDataDir : "",
		};
	}

	return { kind: "public" };
}
