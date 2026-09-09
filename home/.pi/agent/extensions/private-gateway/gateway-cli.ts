import { parseArgs } from "node:util";
import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import { createGatewayAccessAuth, gatewayCredentialToken, GatewayAccessToken } from "./gateway-auth.ts";
import { GATEWAY_BACKENDS } from "./gateway-discovery.ts";
import { HttpGatewayDiscovery } from "./gateway-discovery.ts";
import { GatewayInspector, summarizeGatewayInspection } from "./gateway-diagnostics.ts";
import { FetchGatewayHttp } from "./gateway-http.ts";
import { diffGatewayInventories, gatewayDeclaredInventory, HttpGatewayInventory, type GatewayBackendInventory, type GatewayInventoryModel, type GatewayModelDelta } from "./gateway-inventory.ts";
import { gatewaySettingsPath, readGatewaySettings } from "./gateway-settings.ts";
import type { GatewayProfile } from "./gateway-profile.ts";

const HELP = `Usage: npm run models -- <list PROFILE | diff FROM TO> [options]
  --config PATH    Private JSON settings (default: Pi agent directory/private-gateway.json)
  --backend NAME   Limit live inventory to one backend
  --json           Machine-readable inventory and delta
  --show-shared    Print shared model IDs in text mode
  --help           No config, credential, or network access

Read-only: Pi credentials or explicitly configured environment tokens; no OpenCode import,
login, inference calls, filter changes, or cache writes. Private model IDs appear in output.
Failed coverage is unknown, not empty. Listing does not establish inference access or gateway policy.
Exit status: 0 complete; 1 setup/discovery failure; 2 partial inventory.
`;

async function main(): Promise<void> {
	const args = parseArgs({ allowPositionals: true, options: {
		config: { type: "string" }, backend: { type: "string" }, json: { type: "boolean" },
		"show-shared": { type: "boolean" }, help: { type: "boolean" },
	} });
	if (args.values.help) { process.stdout.write(HELP); return; }
	const [command, fromId, toId] = args.positionals;
	if ((command !== "list" && command !== "diff") || !fromId || (command === "diff" ? !toId || args.positionals.length !== 3 : args.positionals.length !== 2)) {
		process.stderr.write(HELP); process.exitCode = 1; return;
	}
	const backend = GATEWAY_BACKENDS.find((backend) => backend === args.values.backend);
	if (args.values.backend && !backend) { process.stderr.write("Private gateway CLI: unknown backend\n"); process.exitCode = 1; return; }
	const settings = await readGatewaySettings(args.values.config ?? gatewaySettingsPath());
	if (!settings.ok || !settings.value) { process.stderr.write(`${settings.ok ? "Private gateway CLI: settings file is missing" : settings.error.message}\n`); process.exitCode = 1; return; }
	const from = settings.value.settings.profiles.find((profile) => profile.id === fromId);
	const to = command === "diff" ? settings.value.settings.profiles.find((profile) => profile.id === toId) : undefined;
	if (!from || (command === "diff" && (!to || from.id === to.id))) { process.stderr.write("Private gateway CLI: choose configured, distinct profile IDs\n"); process.exitCode = 1; return; }
	const controller = new AbortController();
	const abort = () => controller.abort();
	process.once("SIGINT", abort); process.once("SIGTERM", abort);
	const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
	const http = new FetchGatewayHttp();
	const inspector = new GatewayInspector(new HttpGatewayDiscovery(http), new HttpGatewayInventory(http));
	const inspect = async (profile: GatewayProfile) => {
		const credential = readStoredCredential(profile.id);
		let token = gatewayCredentialToken(credential, Date.now());
		if (!token.ok && credential?.type !== "oauth") {
			const auth = createGatewayAccessAuth(profile, { now: () => Date.now(), remember: () => {} });
			const resolved = await auth.apiKey?.resolve({
				...(credential?.type === "api_key" ? { credential } : {}), signal,
				ctx: { env: async (name) => process.env[name], fileExists: async () => false },
			});
			token = GatewayAccessToken.parse(resolved?.auth.apiKey, Date.now());
		}
		if (!token.ok) return token;
		return inspector.inspect(profile, token.value, signal, backend);
	};
	try {
		const [left, right] = await Promise.all([inspect(from), to ? inspect(to) : undefined]);
		if (!left.ok || (right && !right.ok)) {
			process.stderr.write(`${!left.ok ? left.error.message : right && !right.ok ? right.error.message : "Private gateway CLI: inspection failed"}\n`);
			process.exitCode = 1; return;
		}
		const delta = right?.ok ? diffGatewayInventories(left.value.inventory, right.value.inventory) : undefined;
		const declarations = (inspection: typeof left.value) => gatewayDeclaredInventory(inspection.discovery).filter((entry) => !backend || entry.backend === backend);
		const declarationDelta = right ? diffGatewayInventories(declarations(left.value), declarations(right.value)) : undefined;
		const complete = [left.value, right?.value].every((inspection) => !inspection || inspection.inventory.every((entry) => entry.status !== "unavailable"));
		if (args.values.json) {
			const publicModel = ({ backend, id, name }: GatewayInventoryModel) => ({ backend, id, name });
			const publicInventory = (entries: readonly GatewayBackendInventory[]) => entries.map((entry) => entry.status === "listed"
				? { backend: entry.backend, status: entry.status, models: entry.models.map(publicModel) } : entry);
			const publicDelta = (value: GatewayModelDelta | undefined) => value && ({
				unknownBackends: value.unknownBackends,
				onlyFrom: value.onlyFrom.map(publicModel),
				onlyTo: value.onlyTo.map(publicModel),
				shared: value.shared.map(publicModel),
			});
			const report = (inspection: typeof left.value) => ({ profile: { id: inspection.profile.id, name: inspection.profile.name }, inventory: publicInventory(inspection.inventory), declarations: publicInventory(declarations(inspection)) });
			process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), complete, from: report(left.value), ...(right ? { to: report(right.value), delta: publicDelta(delta), declarationDelta: publicDelta(declarationDelta) } : {}) }, null, 2)}\n`);
		} else {
			const lines = [summarizeGatewayInspection(left.value)];
			if (right && delta) {
				lines.push("", summarizeGatewayInspection(right.value), `Unknown comparison backends: ${delta.unknownBackends.join(", ") || "none"}`);
				for (const [label, models] of [["Only from", delta.onlyFrom], ["Only to", delta.onlyTo], ["Shared", delta.shared]] as const) {
					lines.push(`${label}: ${models.length}`);
					if (label !== "Shared" || args.values["show-shared"]) lines.push(...models.map((model) => `  ${model.backend}\t${JSON.stringify(model.id)}`));
				}
				if (declarationDelta) {
					lines.push("Well-known declarations (separate from live model-list coverage):");
					for (const [label, models] of [["Declared only from", declarationDelta.onlyFrom], ["Declared only to", declarationDelta.onlyTo]] as const) {
						lines.push(`${label}: ${models.length}`, ...models.map((model) => `  ${model.backend}\t${JSON.stringify(model.id)}`));
					}
				}
			} else {
				lines.push(...left.value.inventory.flatMap((entry) => entry.status === "listed" ? entry.models.map((model) => `  ${model.backend}\t${JSON.stringify(model.id)}`) : []));
				lines.push("Well-known declarations (may include aliases absent from live lists):", ...declarations(left.value).flatMap((entry) => entry.status === "listed" ? entry.models.map((model) => `  ${model.backend}\t${JSON.stringify(model.id)}`) : []));
			}
			if (!complete) lines.push("INCOMPLETE: unknown coverage is not evidence that a model is absent.");
			process.stdout.write(`${lines.join("\n")}\n`);
		}
		process.exitCode = complete ? 0 : 2;
	} finally {
		controller.abort(); process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort);
	}
}

main().catch(() => { process.stderr.write("Private gateway CLI: invalid arguments or operation failure; use --help. No configuration was changed.\n"); process.exitCode = 1; });
