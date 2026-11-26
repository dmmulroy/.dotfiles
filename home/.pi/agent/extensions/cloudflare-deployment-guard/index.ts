/**
 * Pi extension: the global Cloudflare deployment guard. Blocks agent bash commands that deploy Workers or
 * Alchemy stacks outside `agent/cloudflare-deployment-allowlist.json`, and agent writes to that policy.
 *
 * Definite denials (an unlisted target, a destroy, a policy write) always block. When the guard cannot
 * resolve a command (a dynamic argument, an unreadable script), it asks the user in interactive sessions
 * and blocks in headless ones.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { CloudflareDeploymentBlocked } from "./decision.ts";
import { createDeploymentEvaluationCache, evaluateCloudflareDeploymentCommand } from "./evaluate.ts";
import {
	DENY_ALL_DEPLOYMENT_POLICY,
	type LoadedCloudflarePolicy,
	POLICY_FILE_NAME,
	POLICY_FILE_PATH,
	findsCloudflarePolicyMutation,
	loadCloudflarePolicy,
	normalizedToolPath,
	policyContentHash,
} from "./policy.ts";

export { evaluateCloudflareDeploymentCommand } from "./evaluate.ts";
export { findsCloudflarePolicyMutation, parseCloudflareDeploymentPolicy } from "./policy.ts";

/**
 * Cheap pre-check: commands with none of these words cannot reach a deployment CLI, a package task, a
 * nested shell, or the policy file, so they skip parsing.
 */
const MAY_NEED_GUARD_PATTERN =
	/\b(?:wrangler|cf|alchemy|npx|pnpx|bunx|vpx|npm|pnpm|yarn|bun|vp|vpr|node|tsx|deno|bash|sh|zsh|dash|ksh|fish|eval|xargs|find|doppler|op|infisical|dotenvx?|varlock|envchain)\b/;

const BLOCKED_PREFIX = "BLOCKED: Cloudflare deployment guard: ";

function mayNeedCloudflareDeploymentGuard(command: string): boolean {
	return command.includes(POLICY_FILE_NAME) || MAY_NEED_GUARD_PATTERN.test(command);
}

/** Installs the global Pi tool_call guard for Cloudflare deployments and policy mutation. */
export default function cloudflareDeploymentGuardExtension(pi: ExtensionAPI): void {
	let cachedPolicy: LoadedCloudflarePolicy | undefined;
	/** Content hash of the policy when the session started; a mid-session change needs the user's approval. */
	let trustedPolicyHash: string | undefined;
	let reportedIgnoredEntries = "";
	const evaluationCache = createDeploymentEvaluationCache();
	const canonicalPolicyPath = normalizedToolPath(POLICY_FILE_PATH, process.cwd());
	const ambientEnvironment: Readonly<Record<string, string>> = {
		...(process.env.CLOUDFLARE_ENV === undefined ? {} : { CLOUDFLARE_ENV: process.env.CLOUDFLARE_ENV }),
		...(process.env.STAGE === undefined ? {} : { STAGE: process.env.STAGE }),
	};

	pi.on("session_start", () => {
		trustedPolicyHash = policyContentHash();
	});

	pi.on("tool_call", async (event, ctx) => {
		if (
			(event.toolName === "write" || event.toolName === "edit") &&
			(isToolCallEventType("write", event) || isToolCallEventType("edit", event))
		) {
			if (
				!event.input.path.includes(POLICY_FILE_NAME) ||
				normalizedToolPath(event.input.path, ctx.cwd) !== canonicalPolicyPath
			)
				return;
			return {
				block: true,
				reason: new CloudflareDeploymentBlocked(
					`the agent cannot modify global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`,
					false,
				).message,
			};
		}
		if (event.toolName !== "bash" || !isToolCallEventType("bash", event)) return;
		const command = event.input.command;
		if (!mayNeedCloudflareDeploymentGuard(command)) return;
		if (command.includes(POLICY_FILE_NAME) && findsCloudflarePolicyMutation(command, ctx.cwd))
			return {
				block: true,
				reason: new CloudflareDeploymentBlocked(
					`the agent cannot mutate global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`,
					false,
				).message,
			};

		// Evaluating against a deny-all policy first avoids reading the policy for unrelated commands.
		const preflight = evaluateCloudflareDeploymentCommand(
			command,
			{ cwd: ctx.cwd, policy: DENY_ALL_DEPLOYMENT_POLICY, environmentVariables: ambientEnvironment },
			evaluationCache,
		);
		if (preflight._tag !== "block") return;

		cachedPolicy = loadCloudflarePolicy(cachedPolicy);
		if (cachedPolicy.result._tag === "err") return { block: true, reason: cachedPolicy.result.error.message };
		const policy = cachedPolicy.result.value;

		const ignored = (policy.ignoredEntries ?? []).join("\n");
		if (ignored.length > 0 && ignored !== reportedIgnoredEntries && ctx.hasUI) {
			reportedIgnoredEntries = ignored;
			ctx.ui.notify(
				`Cloudflare deployment guard ignored stale entries in ${POLICY_FILE_NAME}; their projects stay denied:\n${ignored}`,
				"warning",
			);
		}

		trustedPolicyHash ??= cachedPolicy.contentHash;
		if (cachedPolicy.contentHash !== trustedPolicyHash) {
			const trusted =
				ctx.hasUI &&
				(await ctx.ui.confirm(
					"Cloudflare deployment policy changed",
					`${POLICY_FILE_PATH} changed during this session. Trust the new policy for deployment decisions?`,
				));
			if (!trusted)
				return {
					block: true,
					reason: new CloudflareDeploymentBlocked(
						`global policy ${POLICY_FILE_PATH} changed during this session and the user has not confirmed it.`,
						false,
					).message,
				};
			trustedPolicyHash = cachedPolicy.contentHash;
		}

		const decision = evaluateCloudflareDeploymentCommand(
			command,
			{ cwd: ctx.cwd, policy, environmentVariables: ambientEnvironment },
			evaluationCache,
		);
		if (decision._tag !== "block") return;
		if (!decision.confirmable) return { block: true, reason: decision.reason };
		if (!ctx.hasUI)
			return {
				block: true,
				reason: `${decision.reason} Run the deployment command directly, or ask the user to approve it in an interactive session.`,
			};
		const approved = await ctx.ui.confirm(
			"Cloudflare deployment guard",
			`${decision.reason.replace(BLOCKED_PREFIX, "")}\n\n$ ${command.length > 1_200 ? `${command.slice(0, 1_200)}…` : command}\n\nAllow this command once?`,
		);
		if (approved) return;
		return { block: true, reason: `${decision.reason} The user declined it.` };
	});
}
