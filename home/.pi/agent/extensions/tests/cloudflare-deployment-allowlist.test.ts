import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	evaluateCloudflareDeploymentCommand,
	findsCloudflarePolicyMutation,
	parseCloudflareDeploymentPolicy,
	type CloudflareDeploymentPolicy,
} from "../cloudflare-deployment-allowlist.ts";

function makePolicy(
	workers: Readonly<Record<string, readonly string[]>>,
): CloudflareDeploymentPolicy {
	const parsed = parseCloudflareDeploymentPolicy({ version: 1, workers });
	assert.equal(parsed._tag, "ok");
	return parsed.value;
}

function makeAlchemyPolicy(
	projects: readonly {
		readonly project: string;
		readonly stages: readonly string[];
		readonly stack?: string;
	}[],
	workers: Readonly<Record<string, readonly string[]>> = {},
): CloudflareDeploymentPolicy {
	const parsed = parseCloudflareDeploymentPolicy({ version: 2, workers, alchemy: projects });
	assert.equal(parsed._tag, "ok");
	return parsed.value;
}

function makeAlchemyWorkspace(): {
	readonly root: string;
	readonly designSystem: string;
	readonly introKit: string;
} {
	const root = mkdtempSync(join(tmpdir(), "cloudflare-alchemy-guard-"));
	const designSystem = join(root, "apps", "design-system");
	const introKit = join(root, "apps", "intro-kit");
	mkdirSync(designSystem, { recursive: true });
	mkdirSync(introKit, { recursive: true });
	writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			name: "example-monorepo",
			scripts: {
				"deploy:design-system": "pnpm --filter @example/design-system run deploy",
				"deploy:intro-kit": "pnpm --filter @example/intro-kit run deploy",
			},
		}),
	);
	writeFileSync(
		join(designSystem, "package.json"),
		JSON.stringify({
			name: "@example/design-system",
			scripts: {
				deploy: "alchemy deploy --stage prod --profile work",
				plan: "alchemy plan --stage prod",
			},
		}),
	);
	writeFileSync(
		join(introKit, "package.json"),
		JSON.stringify({
			name: "@example/intro-kit",
			scripts: { deploy: "alchemy deploy --stage prod --profile work" },
		}),
	);
	writeFileSync(
		join(designSystem, "alchemy.run.ts"),
		'const resource = Alchemy.Stack.useSync(() => ({}));\nexport default Alchemy.Stack("DesignSystem", {}, Effect.void);\n',
	);
	writeFileSync(
		join(introKit, "alchemy.run.ts"),
		'export default Alchemy.Stack("IntroKit", {}, Effect.void);\n',
	);
	return { root, designSystem, introKit };
}

function makeRepositoryExemptionWorkspace(): {
	readonly root: string;
	readonly api: string;
	readonly policy: CloudflareDeploymentPolicy;
} {
	const root = mkdtempSync(join(tmpdir(), "cloudflare-repository-exemption-"));
	const api = join(root, "apps", "api");
	mkdirSync(join(root, ".git"));
	mkdirSync(join(api, "scripts"), { recursive: true });
	writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			name: "overseer-fixture",
			scripts: {
				"test:e2e:deployed": "vp run --no-cache @overseer/api#test:e2e:deployed",
				"deploy:malformed": 42,
				"deploy:unsupported": "vp run --unknown @overseer/api#test:e2e:deployed",
			},
		}),
	);
	writeFileSync(
		join(api, "package.json"),
		JSON.stringify({
			name: "@overseer/api",
			scripts: { "test:e2e:deployed": "node scripts/run-e2e.ts deployed" },
		}),
	);
	writeFileSync(
		join(api, "scripts", "run-e2e.ts"),
		'ChildProcess.make("alchemy", ["destroy", "--stage", "test-stage"]);\n',
	);
	writeFileSync(join(api, "alchemy.run.ts"), 'export default Alchemy.Stack("Overseer");\n');
	return {
		root,
		api,
		policy: makeAlchemyPolicy([
			{ project: join(api, "alchemy.run.ts"), stages: ["production"], stack: "Overseer" },
		]),
	};
}

function makeJsonWorkerProject(): string {
	const cwd = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	writeFileSync(
		join(cwd, "package.json"),
		JSON.stringify({
			devDependencies: { wrangler: "4.108.0" },
			scripts: {
				"ship-worker": "wrangler deploy --env staging",
				test: "node --test",
			},
		}),
	);
	writeFileSync(
		join(cwd, "wrangler.jsonc"),
		`{
		// The named environment deliberately has a different Worker target.
		"name": "example-api",
		"env": {
			"staging": { "name": "example-api-staging-target", },
			"production": {},
		},
	}`,
	);
	return cwd;
}

function decide(
	command: string,
	cwd: string,
	policy: CloudflareDeploymentPolicy,
	environmentVariables?: Readonly<Record<string, string>>,
) {
	return evaluateCloudflareDeploymentCommand(command, { cwd, policy, environmentVariables });
}

test("allows only exact Wrangler Worker application/environment pairs", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({
		"example-api": ["default", "production"],
		"example-api-staging-target": ["staging"],
	});

	assert.equal(decide("wrangler deploy", cwd, policy)._tag, "allow");
	assert.equal(decide("npx wrangler@4.108.0 deploy --env production", cwd, policy)._tag, "allow");
	assert.equal(decide("pnpm exec wrangler deploy -e staging", cwd, policy)._tag, "allow");
	assert.equal(
		decide("bunx wrangler deploy --name example-api --env production", cwd, policy)._tag,
		"allow",
	);
	assert.equal(decide("wrangler versions deploy --env production", cwd, policy)._tag, "allow");
	assert.equal(
		decide("npm exec wrangler -- triggers deploy --env production", cwd, policy)._tag,
		"allow",
	);
	assert.equal(
		decide("wrangler --log-level debug deploy --env production", cwd, policy)._tag,
		"allow",
	);
});

test("intercepts Vite+, pnpx, and package-manager wrappers", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api-staging-target": ["staging"] });
	for (const command of [
		"vpx wrangler@4.108.0 deploy --env staging",
		"pnpx wrangler deploy --env staging",
		"vp exec wrangler deploy --env staging",
		"vp dlx wrangler@4.108.0 deploy --env staging",
	])
		assert.equal(decide(command, cwd, policy)._tag, "allow", command);
});

test("resolves static package scripts and blocks unresolved deployment tasks", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api-staging-target": ["staging"] });
	assert.equal(decide("npm run ship-worker", cwd, policy)._tag, "allow");

	for (const command of [
		"vp run deploy:staging",
		"vp run --filter apps/worker deploy:staging",
		"vpr -F apps/worker deploy:staging",
		"npm run deploy:staging",
		"pnpm deploy:staging",
		"yarn run deploy:staging",
		"bun run deploy:staging",
	]) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.match(decision.reason, /script resolution/);
	}

	for (const command of ["vp run test", "npm run test", "pnpm run check", "yarn test"]) {
		assert.equal(decide(command, cwd, policy)._tag, "unrelated", command);
	}
});

test("defaults Wrangler to the explicit default environment and honors CLOUDFLARE_ENV", () => {
	const cwd = makeJsonWorkerProject();
	const defaultOnly = makePolicy({ "example-api": ["default"] });
	const stagingOnly = makePolicy({ "example-api-staging-target": ["staging"] });

	assert.equal(decide("wrangler deploy", cwd, defaultOnly)._tag, "allow");
	assert.equal(decide("wrangler deploy", cwd, stagingOnly)._tag, "block");
	assert.equal(
		decide("CLOUDFLARE_ENV=staging yarn wrangler deploy", cwd, stagingOnly)._tag,
		"allow",
	);
	assert.equal(
		decide("wrangler deploy", cwd, stagingOnly, { CLOUDFLARE_ENV: "staging" })._tag,
		"allow",
	);
	assert.equal(
		decide("export CLOUDFLARE_ENV=staging && wrangler deploy", cwd, stagingOnly)._tag,
		"allow",
	);
	assert.equal(
		decide(
			"CLOUDFLARE_ENV=staging wrangler deploy -e production",
			cwd,
			makePolicy({ "example-api": ["production"] }),
		)._tag,
		"allow",
	);
});

test("resolves --cwd, --config, chained cd, TOML names, redirection, and global flags", () => {
	const root = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	const worker = join(root, "apps", "worker");
	mkdirSync(worker, { recursive: true });
	writeFileSync(
		join(worker, "custom.toml"),
		`name = "toml-api"
[env.staging]
name = "toml-stage-target"
`,
	);
	const policy = makePolicy({ "toml-stage-target": ["staging"] });

	assert.equal(
		decide(
			"wrangler --cwd apps/worker --config custom.toml deploy -e staging > /tmp/deploy.log",
			root,
			policy,
		)._tag,
		"allow",
	);
	assert.equal(
		decide(
			"cd apps/worker && pnpm exec wrangler --config=custom.toml deploy --env=staging",
			root,
			policy,
		)._tag,
		"allow",
	);
});

test("fails closed for unknown and ambiguous Wrangler targets", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api": ["default"] });
	const cases = [
		"wrangler deploy --env missing",
		"wrangler deploy --env production --env staging",
		"wrangler deploy --config missing.json",
		"wrangler deploy --name unknown-api",
		"sh -c 'wrangler deploy'",
		"cd missing; wrangler deploy",
		"cd missing || wrangler deploy",
	];
	for (const command of cases) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block")
			assert.match(decision.reason, /^BLOCKED: Cloudflare deployment guard:/);
	}
});

test("always blocks destructive Wrangler Worker deletion", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "exa-mcp-proxy-poc": ["default"] });
	for (const command of [
		"npx wrangler delete exa-mcp-proxy-poc",
		"npx wrangler delete exa-mcp-proxy-poc --force",
		"npx wrangler delete --force exa-mcp-proxy-poc",
		"pnpm exec wrangler delete exa-mcp-proxy-poc --force",
	]) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block")
			assert.match(decision.reason, /Worker deletion.*never authorized/);
	}
	assert.equal(decide("npx wrangler delete --help", cwd, policy)._tag, "unrelated");
});

test("allows genuine dry runs and unrelated read-only CLI commands", () => {
	const cwd = makeJsonWorkerProject();
	const emptyPolicy = makePolicy({});
	const commands = [
		"wrangler deploy --dry-run",
		"npx cf deploy --mode production --dry-run",
		"wrangler whoami",
		"wrangler types",
		"wrangler deploy --help",
		"cf --help",
		"cf auth login",
		"cf versions upload",
	];
	for (const command of commands) {
		assert.notEqual(decide(command, cwd, emptyPolicy)._tag, "block", command);
	}
	assert.equal(decide("wrangler deploy --dry-run=false", cwd, emptyPolicy)._tag, "block");
});

test("maps explicit cf deployment mode to the logical environment", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api-staging-target": ["staging"] });

	assert.equal(decide("cf deploy --mode staging", cwd, policy)._tag, "allow");
	assert.equal(decide("npx cf@0.6.0 --profile work deploy -m staging", cwd, policy)._tag, "allow");
	assert.equal(decide("cf deploy", cwd, policy)._tag, "block");
	assert.equal(decide("cf versions deploy", cwd, policy)._tag, "block");
});

test("resolves cf --prebuilt from Build Output instead of repository configuration", () => {
	const cwd = makeJsonWorkerProject();
	const output = join(cwd, ".cloudflare", "output", "v0", "workers", "default");
	mkdirSync(output, { recursive: true });
	writeFileSync(join(output, "config.json"), JSON.stringify({ name: "built-api" }));
	const policy = makePolicy({ "built-api": ["production"] });

	assert.equal(decide("cf deploy --prebuilt --mode production", cwd, policy)._tag, "allow");
	assert.equal(
		decide(
			"cf deploy --prebuilt --mode production",
			cwd,
			makePolicy({ "example-api": ["production"] }),
		)._tag,
		"block",
	);
});

test("blocks direct cf Worker traffic deployment without blocking read-only deployment queries", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api": ["production"] });
	const creates = [
		"cf workers deployments create --worker example-api --strategy percentage",
		"npx cf@0.6.0 workers deployments create --worker example-api --strategy percentage",
		"pnpm exec cf workers deployments create --worker example-api --strategy percentage",
	];
	for (const command of creates) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") {
			assert.match(
				decision.reason,
				/cf workers deployments create changes Worker traffic directly/,
			);
		}
	}

	for (const command of [
		"cf workers deployments list --worker example-api",
		"npx cf@0.6.0 workers deployments get deployment-id --worker example-api",
		"pnpm exec cf workers deployments list --worker example-api",
	])
		assert.equal(decide(command, cwd, policy)._tag, "unrelated", command);
});

test("fails closed when cf project discovery cannot identify a Worker", () => {
	const cwd = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "vite-project" }));
	const decision = decide(
		"cf deploy --mode production",
		cwd,
		makePolicy({ "vite-project": ["production"] }),
	);
	assert.equal(decision._tag, "block");
	if (decision._tag === "block") assert.match(decision.reason, /project discovery/);
});

test("authorizes direct Alchemy deployments by canonical project and exact stage", () => {
	const workspace = makeAlchemyWorkspace();
	const policy = makeAlchemyPolicy([
		{
			project: join(workspace.designSystem, "alchemy.run.ts"),
			stages: ["prod"],
			stack: "DesignSystem",
		},
	]);

	assert.equal(
		decide("alchemy deploy --stage prod --profile work", workspace.designSystem, policy)._tag,
		"allow",
	);
	assert.equal(
		decide("pnpm exec alchemy deploy --stage prod", workspace.designSystem, policy)._tag,
		"allow",
	);
	assert.equal(
		decide("npx alchemy@2.0.0-beta.72 deploy --stage prod", workspace.designSystem, policy)._tag,
		"allow",
	);
	assert.equal(
		decide("cd apps/design-system && alchemy deploy --stage prod", workspace.root, policy)._tag,
		"allow",
	);
});

test("fails closed for unknown Alchemy projects, stages, and stage ambiguity", () => {
	const workspace = makeAlchemyWorkspace();
	const policy = makeAlchemyPolicy([
		{
			project: join(workspace.designSystem, "alchemy.run.ts"),
			stages: ["prod"],
		},
	]);
	const cases = [
		["alchemy deploy --stage prod", workspace.introKit, /unknown Alchemy project/],
		["alchemy deploy --stage staging", workspace.designSystem, /stage.*staging/],
		["alchemy deploy", workspace.designSystem, /requires explicit Alchemy --stage or STAGE/],
		[
			"STAGE=staging alchemy deploy --stage prod",
			workspace.designSystem,
			/conflicting Alchemy --stage and STAGE/,
		],
		[
			"alchemy deploy --stage prod --stage staging",
			workspace.designSystem,
			/conflicting Alchemy --stage/,
		],
	] as const;
	for (const [command, cwd, reason] of cases) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.match(decision.reason, reason);
	}
	assert.equal(decide("STAGE=prod alchemy deploy", workspace.designSystem, policy)._tag, "allow");
});

test("resolves static Vite task selectors to allowlisted typed Alchemy Stacks", () => {
	const workspace = makeAlchemyWorkspace();
	writeFileSync(
		join(workspace.designSystem, "vite.config.ts"),
		`import { defineConfig } from "vite-plus";
export default defineConfig({
  run: {
    tasks: {
      "deploy:prod": {
        cache: false,
        command: "alchemy deploy --stage prod --profile work",
      },
    },
  },
});
`,
	);
	mkdirSync(join(workspace.designSystem, "src"), { recursive: true });
	writeFileSync(
		join(workspace.designSystem, "alchemy.run.ts"),
		`import { DesignSystemStack } from "./src/design-system-stack.ts";
export default DesignSystemStack.make({}, Effect.void);
`,
	);
	writeFileSync(
		join(workspace.designSystem, "src", "design-system-stack.ts"),
		`import * as Alchemy from "alchemy";
import { DESIGN_SYSTEM_STACK_NAME } from "./design-system-identifiers.ts";
export class DesignSystemStack extends Alchemy.Stack<DesignSystemStack, {}>()(DESIGN_SYSTEM_STACK_NAME) {}
`,
	);
	writeFileSync(
		join(workspace.designSystem, "src", "design-system-identifiers.ts"),
		'export const DESIGN_SYSTEM_STACK_NAME = "DesignSystem";\n',
	);
	const policy = makeAlchemyPolicy([
		{
			project: join(workspace.designSystem, "alchemy.run.ts"),
			stages: ["prod"],
			stack: "DesignSystem",
		},
	]);

	assert.equal(
		decide("alchemy deploy --stage prod --profile work", workspace.designSystem, policy)._tag,
		"allow",
	);
	assert.equal(
		decide("vp run @example/design-system#deploy:prod", workspace.root, policy)._tag,
		"allow",
	);
});

test("resolves complete pnpm workspace deployment script chains", () => {
	const workspace = makeAlchemyWorkspace();
	const policy = makeAlchemyPolicy([
		{
			project: join(workspace.designSystem, "alchemy.run.ts"),
			stages: ["prod"],
			stack: "DesignSystem",
		},
		{ project: join(workspace.introKit, "alchemy.run.ts"), stages: ["prod"], stack: "IntroKit" },
	]);
	assert.equal(decide("pnpm deploy:design-system", workspace.root, policy)._tag, "allow");
	assert.equal(decide("pnpm deploy:intro-kit", workspace.root, policy)._tag, "allow");

	for (const command of [
		"pnpm --filter @example/missing run deploy",
		"pnpm --filter apps/missing run deploy",
	]) {
		const decision = decide(command, workspace.root, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block")
			assert.match(decision.reason, /script resolution.*workspace package/);
	}
});

test("exempts every canonical working directory in an allowlisted repository before script resolution", () => {
	const workspace = makeRepositoryExemptionWorkspace();
	const repositoryAlias = join(tmpdir(), `cloudflare-repository-alias-${Date.now()}`);
	symlinkSync(workspace.root, repositoryAlias);

	for (const [command, cwd] of [
		["pnpm test:e2e:deployed", workspace.root],
		["pnpm --filter @overseer/api test:e2e:deployed", workspace.root],
		["node scripts/run-e2e.ts deployed", workspace.api],
		["pnpm test:e2e:deployed", repositoryAlias],
		["node scripts/run-e2e.ts deployed", join(repositoryAlias, "apps", "api")],
	] as const) {
		assert.equal(decide(command, cwd, workspace.policy)._tag, "allow", `${cwd}: ${command}`);
	}
});

test("keeps deployment script resolution fail-closed outside allowlisted repositories", () => {
	const allowlisted = makeRepositoryExemptionWorkspace();
	const unlisted = makeRepositoryExemptionWorkspace();

	for (const [command, cwd] of [
		["pnpm test:e2e:deployed", unlisted.root],
		["pnpm --filter @overseer/api test:e2e:deployed", unlisted.root],
		["node scripts/run-e2e.ts deployed", unlisted.api],
		["pnpm deploy:malformed", unlisted.root],
		["pnpm deploy:unsupported", unlisted.root],
	] as const) {
		const decision = decide(command, cwd, allowlisted.policy);
		assert.equal(decision._tag, "block", `${cwd}: ${command}`);
		if (decision._tag === "block") assert.match(decision.reason, /script resolution/);
	}
});

test("bounds recursive scripts and blocks cycles, dynamic intent, and hidden shells", () => {
	const workspace = makeAlchemyWorkspace();
	writeFileSync(
		join(workspace.root, "package.json"),
		JSON.stringify({
			scripts: {
				"deploy:cycle": "pnpm a",
				a: "pnpm b",
				b: "pnpm a",
				"deploy:dynamic": "alchemy deploy --stage $STAGE",
				"deploy:hidden": "sh -c 'alchemy deploy --stage prod'",
				"deploy:ambiguous": "alchemy deploy --stage prod || echo failed",
				"deploy:malformed": 42,
			},
		}),
	);
	const policy = makeAlchemyPolicy([
		{ project: join(workspace.designSystem, "alchemy.run.ts"), stages: ["prod"] },
	]);
	for (const [command, reason] of [
		["pnpm deploy:cycle", /cycle/],
		["pnpm deploy:dynamic", /dynamic|unresolved shell variables/],
		["pnpm deploy:hidden", /shell -c/],
		["pnpm deploy:ambiguous", /pipelines or \|\|/],
		["pnpm deploy:malformed", /static non-empty string/],
		["pnpm --filter one --filter two run deploy", /conflicting workspace filters/],
	] as const) {
		const decision = decide(command, workspace.root, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.match(decision.reason, reason);
	}
});

test("allows Alchemy inspection but always blocks destroy", () => {
	const workspace = makeAlchemyWorkspace();
	const policy = makeAlchemyPolicy([
		{ project: join(workspace.designSystem, "alchemy.run.ts"), stages: ["prod"] },
	]);
	for (const command of [
		"alchemy plan",
		"alchemy plan --stage prod",
		"alchemy --help",
		"alchemy --version",
	]) {
		assert.notEqual(decide(command, workspace.designSystem, policy)._tag, "block", command);
	}
	for (const command of [
		"alchemy destroy --stage prod",
		"alchemy destroy --dry-run --stage prod",
		"pnpm exec alchemy destroy --stage prod",
	]) {
		const decision = decide(command, workspace.designSystem, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block")
			assert.match(decision.reason, /Alchemy destroy.*never authorized/);
	}
});

test("requires every deployment segment to be independently authorized", () => {
	const workspace = makeAlchemyWorkspace();
	const policy = makeAlchemyPolicy([
		{ project: join(workspace.designSystem, "alchemy.run.ts"), stages: ["prod"] },
	]);
	const decision = decide(
		"cd apps/design-system && alchemy deploy --stage prod; cd ../../apps/intro-kit && alchemy deploy --stage prod",
		workspace.root,
		policy,
	);
	assert.equal(decision._tag, "block");
	if (decision._tag === "block") assert.match(decision.reason, /unknown Alchemy project/);
});

test("canonicalizes Alchemy policy and command paths through symlinks", () => {
	const workspace = makeAlchemyWorkspace();
	const alias = join(workspace.root, "design-system-alias");
	symlinkSync(workspace.designSystem, alias);
	const parsed = parseCloudflareDeploymentPolicy({
		version: 2,
		workers: {},
		alchemy: [{ project: join(alias, "alchemy.run.ts"), stages: ["prod"], stack: "DesignSystem" }],
	});
	assert.equal(parsed._tag, "ok");
	if (parsed._tag === "ok") {
		assert.equal(parsed.value.version, 2);
		if (parsed.value.version === 2)
			assert.equal(
				parsed.value.alchemy[0]?.project,
				realpathSync(join(workspace.designSystem, "alchemy.run.ts")),
			);
		assert.equal(decide("alchemy deploy --stage prod", alias, parsed.value)._tag, "allow");
	}
});

test("rejects malformed policy shapes with actionable errors", () => {
	for (const input of [
		{},
		{ version: 2, workers: {} },
		{ version: 1, workers: { api: [] } },
		{ version: 1, workers: { api: [" default"] } },
	]) {
		const parsed = parseCloudflareDeploymentPolicy(input);
		assert.equal(parsed._tag, "err");
		if (parsed._tag === "err")
			assert.match(parsed.error.message, /cloudflare-deployment-allowlist\.json/);
	}
});

test("detects high-confidence bash mutations of the global policy", () => {
	const cwd = process.cwd();
	const policyPath = join(cwd, "agent/cloudflare-deployment-allowlist.json");
	for (const command of [
		`printf '{}' > ${policyPath}`,
		`rm -f ${policyPath}`,
		`sed -i '' s/foo/bar/ ${policyPath}`,
		`cp /tmp/policy.json ${policyPath}`,
		`dd if=/tmp/policy.json of=${policyPath}`,
		`sh -c 'printf {} > ${policyPath}'`,
		"cp /tmp/policy.json $HOME/.pi/agent/cloudflare-deployment-allowlist.json",
		`python -c 'open("${policyPath}", "w").write("{}")'`,
	])
		assert.equal(findsCloudflarePolicyMutation(command, cwd), true, command);

	assert.equal(findsCloudflarePolicyMutation(`cat ${policyPath}`, cwd), false);
	assert.equal(
		findsCloudflarePolicyMutation(`cp ${policyPath} /tmp/policy.backup.json`, cwd),
		false,
	);
});
