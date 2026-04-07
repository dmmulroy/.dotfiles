import { DynamicBorder, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import type { ActiveWebIdentity, WebProfile } from "./types.ts";

export function formatWebProfileStatus(identity: ActiveWebIdentity): string {
	if (identity.kind === "helium") {
		return `web: Helium/${identity.displayName}`;
	}
	return "web: public";
}

export function resolveSelectedProfile(identity: ActiveWebIdentity, profiles: WebProfile[]): WebProfile | undefined {
	if (identity.kind !== "helium") return undefined;
	return profiles.find((profile) => profile.profileId === identity.profileId && profile.userDataDir === identity.userDataDir);
}

export async function showWebProfilePicker(
	ctx: ExtensionContext,
	currentIdentity: ActiveWebIdentity,
	profiles: WebProfile[],
): Promise<ActiveWebIdentity | undefined> {
	const items = buildWebProfileItems(profiles);
	const currentLabel = currentIdentity.kind === "helium" ? `Helium / ${currentIdentity.displayName}` : "Public web";
	const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Web Profile"))));
		container.addChild(new Text(theme.fg("muted", "webfetch authentication source")));
		container.addChild(new Text(""));
		container.addChild(new Text(`Current: ${currentLabel}`));
		container.addChild(new Text(""));

		const selectList = new SelectList(items, Math.min(Math.max(items.length + 1, 4), 12), {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);
		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "Enter select • Esc cancel")));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	}, { overlay: true });

	if (!result) return undefined;
	if (result === "public") return { kind: "public" };

	const profile = profiles.find((candidate) => getProfileValue(candidate) === result);
	if (!profile) return undefined;
	return {
		kind: "helium",
		profileId: profile.profileId,
		displayName: profile.displayName,
		userDataDir: profile.userDataDir,
	};
}

function buildWebProfileItems(profiles: WebProfile[]): SelectItem[] {
	return [
		{
			value: "public",
			label: "Public web",
			description: "No authenticated cookies",
		},
		...profiles.map((profile) => ({
			value: getProfileValue(profile),
			label: `Helium / ${profile.displayName}`,
			description: [
				`Profile: ${profile.profileId}`,
				`Source: ${describeProfileSources(profile)}`,
			]
				.filter(Boolean)
				.join(" • "),
		})),
	];
}

function describeProfileSources(profile: WebProfile): string {
	const sources: string[] = [];
	if (profile.cdpReachable) sources.push("CDP available");
	if (profile.diskCookiesAvailable) sources.push("disk cookies available");
	return sources.join(", ") || "no auth sources detected";
}

function getProfileValue(profile: WebProfile): string {
	return `helium:${profile.userDataDir}:${profile.profileId}`;
}
