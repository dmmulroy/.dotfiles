import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSetting, type SettingDefinition } from "@juanibiapina/pi-extension-settings";

const OPENCODE_CF_EXTENSION_NAME = "opencode-cloudflare";
const AUTH_FILE_PATH_SETTING_ID = "authFilePath";

export const OPENCODE_CF_SETTING_DEFINITIONS = [
	{
		id: AUTH_FILE_PATH_SETTING_ID,
		label: "OpenCode Auth File Path",
		description:
			"Optional path to the OpenCode auth.json file used for token import/fallback. Environment variable OPENCODE_CLOUDFLARE_AUTH_FILE still takes precedence.",
		defaultValue: "",
	},
] satisfies SettingDefinition[];

export function registerOpencodeCloudflareSettings(pi: ExtensionAPI): void {
	pi.events.emit("pi-extension-settings:register", {
		name: OPENCODE_CF_EXTENSION_NAME,
		settings: OPENCODE_CF_SETTING_DEFINITIONS,
	});
}

export function getConfiguredAuthFilePath(): string | undefined {
	const value = getSetting(OPENCODE_CF_EXTENSION_NAME, AUTH_FILE_PATH_SETTING_ID, "")?.trim();
	return value ? value : undefined;
}
