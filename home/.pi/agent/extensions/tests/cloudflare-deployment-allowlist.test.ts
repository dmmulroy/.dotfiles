import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	evaluateCloudflareDeploymentCommand,
	findsCloudflarePolicyMutation,
	parseCloudflareDeploymentPolicy,
	type CloudflareDeploymentPolicy,
} from "../cloudflare-deployment-allowlist.ts";

function makePolicy(workers: Readonly<Record<string, readonly string[]>>): CloudflareDeploymentPolicy {
	const parsed = parseCloudflareDeploymentPolicy({ version: 1, workers });
	assert.equal(parsed._tag, "ok");
	return parsed.value;
}

function makeJsonWorkerProject(): string {
	const cwd = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	writeFileSync(join(cwd, "package.json"), JSON.stringify({
		devDependencies: { wrangler: "4.108.0" },
		scripts: {
			"ship-worker": "wrangler deploy --env staging",
			test: "node --test",
		},
	}));
	writeFileSync(join(cwd, "wrangler.jsonc"), `{
		// The named environment deliberately has a different Worker target.
		"name": "example-api",
		"env": {
			"staging": { "name": "example-api-staging-target", },
			"production": {},
		},
	}`);
	return cwd;
}

function decide(command: string, cwd: string, policy: CloudflareDeploymentPolicy, environmentVariables?: Readonly<Record<string, string>>) {
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
	assert.equal(decide("bunx wrangler deploy --name example-api --env production", cwd, policy)._tag, "allow");
	assert.equal(decide("wrangler versions deploy --env production", cwd, policy)._tag, "allow");
	assert.equal(decide("npm exec wrangler -- triggers deploy --env production", cwd, policy)._tag, "allow");
	assert.equal(decide("wrangler --log-level debug deploy --env production", cwd, policy)._tag, "allow");
});

test("intercepts Vite+, pnpx, and package-manager wrappers", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api-staging-target": ["staging"] });
	for (const command of [
		"vpx wrangler@4.108.0 deploy --env staging",
		"pnpx wrangler deploy --env staging",
		"vp exec wrangler deploy --env staging",
		"vp dlx wrangler@4.108.0 deploy --env staging",
	]) assert.equal(decide(command, cwd, policy)._tag, "allow", command);
});

test("blocks indirect Vite+ and package-manager deployment tasks", () => {
	const cwd = makeJsonWorkerProject();
	const policy = makePolicy({ "example-api-staging-target": ["staging"] });
	for (const command of [
		"vp run deploy:staging",
		"vp run --filter apps/worker deploy:staging",
		"vp run -w deploy:staging",
		"vpr -F apps/worker deploy:staging",
		"npm run deploy:staging",
		"npm run --workspace apps/worker deploy:staging",
		"pnpm run deploy:staging",
		"pnpm deploy:staging",
		"yarn run deploy:staging",
		"bun run deploy:staging",
		"npm run ship-worker",
	]) {
		const decision = decide(command, cwd, policy);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.match(decision.reason, /run the underlying|invokes a Cloudflare deployment/);
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
	assert.equal(decide("CLOUDFLARE_ENV=staging yarn wrangler deploy", cwd, stagingOnly)._tag, "allow");
	assert.equal(decide("wrangler deploy", cwd, stagingOnly, { CLOUDFLARE_ENV: "staging" })._tag, "allow");
	assert.equal(decide("export CLOUDFLARE_ENV=staging && wrangler deploy", cwd, stagingOnly)._tag, "allow");
	assert.equal(decide("CLOUDFLARE_ENV=staging wrangler deploy -e production", cwd, makePolicy({ "example-api": ["production"] }))._tag, "allow");
});

test("resolves --cwd, --config, chained cd, TOML names, redirection, and global flags", () => {
	const root = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	const worker = join(root, "apps", "worker");
	mkdirSync(worker, { recursive: true });
	writeFileSync(join(worker, "custom.toml"), `name = "toml-api"
[env.staging]
name = "toml-stage-target"
`);
	const policy = makePolicy({ "toml-stage-target": ["staging"] });

	assert.equal(decide("wrangler --cwd apps/worker --config custom.toml deploy -e staging > /tmp/deploy.log", root, policy)._tag, "allow");
	assert.equal(decide("cd apps/worker && pnpm exec wrangler --config=custom.toml deploy --env=staging", root, policy)._tag, "allow");
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
		if (decision._tag === "block") assert.match(decision.reason, /^BLOCKED: Cloudflare deployment guard:/);
	}
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
	assert.equal(decide("cf deploy --prebuilt --mode production", cwd, makePolicy({ "example-api": ["production"] }))._tag, "block");
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
			assert.match(decision.reason, /cf workers deployments create changes Worker traffic directly/);
		}
	}

	for (const command of [
		"cf workers deployments list --worker example-api",
		"npx cf@0.6.0 workers deployments get deployment-id --worker example-api",
		"pnpm exec cf workers deployments list --worker example-api",
	]) assert.equal(decide(command, cwd, policy)._tag, "unrelated", command);
});

test("fails closed when cf project discovery cannot identify a Worker", () => {
	const cwd = mkdtempSync(join(tmpdir(), "cloudflare-deployment-guard-"));
	writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "vite-project" }));
	const decision = decide("cf deploy --mode production", cwd, makePolicy({ "vite-project": ["production"] }));
	assert.equal(decision._tag, "block");
	if (decision._tag === "block") assert.match(decision.reason, /project discovery/);
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
		if (parsed._tag === "err") assert.match(parsed.error.message, /cloudflare-deployment-allowlist\.json/);
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
	]) assert.equal(findsCloudflarePolicyMutation(command, cwd), true, command);

	assert.equal(findsCloudflarePolicyMutation(`cat ${policyPath}`, cwd), false);
	assert.equal(findsCloudflarePolicyMutation(`cp ${policyPath} /tmp/policy.backup.json`, cwd), false);
});
