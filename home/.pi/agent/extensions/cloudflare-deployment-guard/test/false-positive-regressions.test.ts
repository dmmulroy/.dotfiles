/**
 * Regression corpus from an audit of Pi sessions in which the guard blocked commands that never deployed.
 * Each case is a minimized reproduction of a real block; the last tests pin the blocks that must survive.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateCloudflareDeploymentCommand } from "../evaluate.ts";
import {
	POLICY_FILE_NAME,
	POLICY_FILE_PATH,
	findsCloudflarePolicyMutation,
	parseCloudflareDeploymentPolicy,
	type CloudflareDeploymentPolicy,
} from "../policy.ts";

function policy(input: unknown): CloudflareDeploymentPolicy {
	const parsed = parseCloudflareDeploymentPolicy(input);
	if (parsed._tag === "err") throw parsed.error;
	return parsed.value;
}

const EMPTY_POLICY = policy({ version: 2, workers: {}, alchemy: [] });

/** A repository named like the audited ones (`cf-*`) with a Wrangler Worker and a `deploy-*.sh` script. */
function makeProject(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "cf-twitch-")));
	mkdirSync(join(root, "scripts"));
	mkdirSync(join(root, "tools", "trace-cli"), { recursive: true });
	writeFileSync(join(root, "scripts", "deploy-production.sh"), "echo checking\n");
	writeFileSync(join(root, "wrangler.jsonc"), '{ "name": "example-api" }');
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			name: "example",
			devDependencies: { wrangler: "4.0.0" },
			scripts: {
				test: "vp test run",
				check: "vp check && pnpm build && pnpm test",
				build: "tsc",
				format: "vp fmt",
				deploy: "wrangler deploy",
			},
		}),
	);
	writeFileSync(
		join(root, "tools", "trace-cli", "package.json"),
		JSON.stringify({ name: "@example/trace-cli", scripts: { test: "vp test run" } }),
	);
	return root;
}

function decide(command: string, cwd: string, deploymentPolicy = EMPTY_POLICY) {
	return evaluateCloudflareDeploymentCommand(command, { cwd, policy: deploymentPolicy });
}

function assertNotBlocked(commands: readonly string[], cwd: string, deploymentPolicy = EMPTY_POLICY): void {
	for (const command of commands) {
		const decision = decide(command, cwd, deploymentPolicy);
		assert.notEqual(decision._tag, "block", `${command}\n=> ${"reason" in decision ? decision.reason : ""}`);
	}
}

test("data that mentions deployments is not a deployment: heredocs, strings, paths, and patterns", () => {
	const cwd = makeProject();
	assertNotBlocked(
		[
			`cd ${cwd} && python3 - <<'EOF'\nprint("alchemy deploy --stage prod $HOME")\nEOF`,
			`cd ${cwd} && cat > /tmp/notes.md <<'EOF'\nRun wrangler deploy after review; cf deploy too.\nEOF`,
			'rg -n "build|alchemy dev|alchemy deploy|alchemy plan" node_modules/alchemy/README.md | head -250',
			"D=node_modules/alchemy/src/Cli/commands/deploy.ts; sed -n 150,200p $D; grep -n -i 'lock' $D | head",
			'git commit -q -m "feat(infra): enable the production stage as deployed" && git log --oneline -2; echo verify_exit=$?',
			`cd ${cwd}; sed -i '' 's|res.destroy());|res.end());|' tests/proxy.test.ts; npx vitest run 2>&1 | grep -E "proxy:" | head`,
			"report=$(cat <<'EOF'\nThe alchemy deploy finished; wrangler deploy is gone.\nEOF\n)\nherdr agent prompt w2A:p1 \"$report\"",
			"gh pr create --title t --body-file - <<'EOF'\n- replace Wrangler deploy with alchemy deploy\nEOF",
			`cd ${cwd} && ls scripts/deploy-production.sh && cat -n scripts/deploy-production.sh | head -60`,
			"printf '[x] INFO: [CfTwitchApi/Foo] replace\\n' | grep -Eq '\\] (create|replace|delete)( |$)' && echo detects-replace",
			'for d in ~ ~/Code/personal/iac; do [ -d "$d" ] && echo "ok $d" || echo "MISSING $d"; done; which pi',
			"env | cut -d= -f1 | rg -i 'cloudflare|deploy|alchemy' | sort",
			"git grep -n -E 'Alchemy\\.Stack|alchemy deploy' 'v2.0.0' -- apps/hosted | head -250",
			`node -e 'const p=require("./package.json");p.scripts.deploy="cf deploy --prebuilt --mode production";' && cat package.json | head -12`,
		],
		cwd,
	);
});

test("vp and pnpm built-ins are not package scripts, so a same-named script is no cycle", () => {
	const cwd = makeProject();
	assertNotBlocked(
		[
			"vp check --fix 2>&1 | grep -E 'error|pass' | head; cd tools/trace-cli && vp test run 2>&1 | tail -30",
			"vp run @example/trace-cli#test 2>&1 | tail -30",
			"pnpm format >/dev/null 2>&1; pnpm check 2>&1 | grep -v '^\\s*at ' | tail -40",
			"pnpm test",
			"vp test",
			"pnpm install --lockfile-only && pnpm --filter @example/trace-cli test",
			// pnpm's own `deploy` command copies a workspace package; it does not run the deploy script.
			"pnpm deploy",
		],
		cwd,
	);
	assert.equal(decide("pnpm run deploy", cwd)._tag, "block");
});

test("tasks without a deployment name do not block when their package cannot be resolved", () => {
	const cwd = makeProject();
	const singlePackage = realpathSync(mkdtempSync(join(tmpdir(), "single-package-workspace-")));
	writeFileSync(join(singlePackage, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: false\ncatalog:\n  vite: 1.0.0\n");
	writeFileSync(join(singlePackage, "package.json"), JSON.stringify({ name: "single", scripts: { check: "tsc" } }));
	assertNotBlocked(
		[
			"npm run typecheck --workspace pi-skill-toggle",
			"npm run check --workspace=pi-astra-context",
			"npm run check:types --workspace @example/missing-gateway",
			"npm --prefix packages/missing run build",
			"pnpm --filter @example/events check && pnpm --filter @example/events test:unit",
			"vp run --no-cache @example/missing#test",
		],
		cwd,
	);
	assertNotBlocked(["pnpm check", "npm run check --workspace=single"], singlePackage);
});

test("cd expands ~ and $HOME, and cd ...; is tracked like cd ... &&", () => {
	const home = realpathSync(mkdtempSync(join(tmpdir(), "guard-home-")));
	const project = join(home, "Code", "app");
	mkdirSync(project, { recursive: true });
	writeFileSync(join(project, "package.json"), JSON.stringify({ name: "app", scripts: { check: "tsc", deploy: "wrangler deploy" } }));
	writeFileSync(join(project, "wrangler.json"), '{ "name": "home-app" }');
	const previousHome = process.env.HOME;
	process.env.HOME = home;
	try {
		assertNotBlocked(["cd ~/Code/app; npm run check 2>&1 | tail -15", "cd $HOME/Code/app && npm run check"], "/");
		const allowed = policy({ version: 2, workers: { "home-app": ["default"] }, alchemy: [] });
		assert.equal(decide("cd ~/Code/app; npm run deploy", "/", allowed)._tag, "allow");
		assert.equal(decide("cd ~/Code/app; npm run deploy", "/")._tag, "block");
	} finally {
		process.env.HOME = previousHome;
	}
});

test("help, version, and dry runs never block, whatever pipes and redirections surround them", () => {
	const cwd = makeProject();
	assertNotBlocked(
		[
			"vpx cf deploy --help",
			"npx alchemy deploy --help 2>&1 | sed 's/\\x1b\\[[0-9;]*m//g' | head -50",
			"npx alchemy deploy --help > /tmp/help.log 2>&1",
			"npx alchemy deploy --stage prod --dry-run --detailed > /tmp/plan.log 2>&1 < /dev/null; echo exit=$?",
			"sed -i '' '/\"\\$schema\"/d' wrangler.jsonc && wrangler deploy --dry-run 2>&1 | tail -15",
			"vp run '@example/infra#deploy:prod' --help 2>&1 | head -80",
			"pnpm exec alchemy --version; pnpm exec alchemy --help 2>&1 | head -50; pnpm exec alchemy destroy --help 2>&1 | head -50",
			"pnpm exec alchemy state read --no-input \"Stack/production/$resource\"",
		],
		cwd,
	);
});

test("allowlisted deployments pass with pipes, redirections, || and later status checks", () => {
	const cwd = makeProject();
	const allowed = policy({ version: 2, workers: { "example-api": ["default"] }, alchemy: [] });
	for (const command of [
		"wrangler deploy 2>&1 | tee /tmp/deploy.log",
		"npm run deploy > /tmp/deploy.log 2>&1; echo \"EXIT: $?\"; tail -40 /tmp/deploy.log",
		"set -euo pipefail\nopenssl rand -base64 48 | npx wrangler secret put ADMIN_TOKEN\nnpm run deploy",
		"wrangler deploy || echo failed",
	])
		assert.equal(decide(command, cwd, allowed)._tag, "allow", command);
});

test("reading the global policy is not a mutation", () => {
	const cwd = process.cwd();
	for (const command of [
		`cat ${POLICY_FILE_PATH}`,
		`jq -r '.alchemy[] | .stack' ~/.pi/agent/${POLICY_FILE_NAME}`,
		`find .. "$HOME" -maxdepth 3 -name ${POLICY_FILE_NAME} -print 2>/dev/null | head -20`,
		`git log --oneline --all -- agent/${POLICY_FILE_NAME} | head -20`,
		`git -C ~/.dotfiles status --short -- home/.pi/agent/${POLICY_FILE_NAME}`,
		`git ls-files agent/${POLICY_FILE_NAME}`,
		`sed -n 1,20p ${POLICY_FILE_PATH}`,
		`python3 -c "import json;d=json.load(open('${POLICY_FILE_PATH}'));print(list(d))"`,
		`node --input-type=module <<'EOF'\nimport { readFileSync } from 'node:fs';\nconsole.log(JSON.parse(readFileSync('${POLICY_FILE_PATH}', 'utf8')));\nEOF`,
		`readlink -f ~/.pi/agent/${POLICY_FILE_NAME}`,
		`f=${POLICY_FILE_PATH}; sed -n 1,5p $f`,
	])
		assert.equal(findsCloudflarePolicyMutation(command, cwd), false, command);

	for (const command of [
		`echo '{}' | tee ${POLICY_FILE_PATH}`,
		`python3 - <<'EOF'\nopen('${POLICY_FILE_PATH}', 'w').write('{}')\nEOF`,
		`bash <<'EOF'\nrm ${POLICY_FILE_PATH}\nEOF`,
		`mv ${POLICY_FILE_PATH} /tmp/policy.json`,
		"cp /tmp/policy.json ~/.pi/agent/cloudflare-deployment-*.json",
		`jq '.workers.x=["default"]' ${POLICY_FILE_PATH} > /tmp/p && cat /tmp/p > ${POLICY_FILE_PATH}`,
	])
		assert.equal(findsCloudflarePolicyMutation(command, cwd), true, command);
});

test("a stale Alchemy entry is skipped instead of invalidating the whole policy", () => {
	const project = realpathSync(mkdtempSync(join(tmpdir(), "alchemy-project-")));
	writeFileSync(join(project, "alchemy.run.ts"), 'export default Alchemy.Stack("Live", {}, Effect.void);\n');
	const parsed = parseCloudflareDeploymentPolicy({
		version: 2,
		workers: {},
		alchemy: [
			{ project: "/nonexistent/removed/alchemy.run.ts", stages: ["prod"] },
			{ project: join(project, "alchemy.run.ts"), stages: ["prod"], stack: "Live" },
		],
	});
	assert.equal(parsed._tag, "ok");
	if (parsed._tag !== "ok") return;
	assert.equal(parsed.value.ignoredEntries?.length, 1);
	assert.equal(decide("alchemy deploy --stage prod", project, parsed.value)._tag, "allow");
});

test("Alchemy projects match their policy entry from any worktree of the same repository", () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "alchemy-worktrees-")));
	const main = join(root, "main");
	const worktree = join(root, "feature");
	const git = (...args: string[]) => {
		const result = spawnSync("git", args, { cwd: main, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
	};
	mkdirSync(join(main, "infra"), { recursive: true });
	writeFileSync(join(main, "infra", "alchemy.run.ts"), 'export default Alchemy.Stack("Infra", {}, Effect.void);\n');
	git("init", "-q");
	git("add", ".");
	git("-c", "user.email=guard@example.com", "-c", "user.name=guard", "commit", "-qm", "init");
	git("worktree", "add", "-q", worktree);
	const allowed = policy({
		version: 2,
		workers: {},
		alchemy: [{ project: join(main, "infra", "alchemy.run.ts"), stages: ["production"], stack: "Infra" }],
	});
	const strict = (command: string, cwd: string) =>
		evaluateCloudflareDeploymentCommand(command, { cwd, policy: allowed, repositoryExemption: false });
	assert.equal(strict("alchemy deploy --stage production", join(worktree, "infra"))._tag, "allow");
	assert.equal(strict("alchemy deploy --stage staging", join(worktree, "infra"))._tag, "block");
	// The worktree is exempt like its repository, but destroy is never exempt.
	assert.equal(decide("pnpm test:e2e", join(worktree, "infra"), allowed)._tag, "allow");
	const destroy = decide("pnpm exec alchemy destroy --stage production --dry-run", join(worktree, "infra"), allowed);
	assert.equal(destroy._tag, "block");
	if (destroy._tag === "block") assert.equal(destroy.confirmable, false);
});

test("definite denials are final; unresolved commands are confirmable", () => {
	const cwd = makeProject();
	const finalBlocks = ["wrangler deploy", "alchemy destroy --stage prod", "npx wrangler delete example-api"];
	for (const command of finalBlocks) {
		const decision = decide(command, cwd);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.equal(decision.confirmable, false, command);
	}
	const confirmable = [
		"wrangler deploy $FLAGS",
		"export CLOUDFLARE_ENV=$(cat .env-name) && wrangler deploy",
		"source .env && wrangler deploy",
		"doppler run -- wrangler deploy",
		"echo 'wrangler deploy' | bash",
		"cf deploy --prebuilt --mode production",
		'"$WRANGLER" deploy --name example-api',
		"cd missing-directory; wrangler deploy",
		"ls | xargs wrangler deploy",
	];
	for (const command of confirmable) {
		const decision = decide(command, cwd);
		assert.equal(decision._tag, "block", command);
		if (decision._tag === "block") assert.equal(decision.confirmable, true, `${command}: ${decision.reason}`);
	}
});

test("variables assigned in the command resolve, and nested shells are evaluated, not refused", () => {
	const cwd = makeProject();
	const allowed = policy({ version: 2, workers: { "example-api": ["default", "staging"] }, alchemy: [] });
	writeFileSync(join(cwd, "wrangler.jsonc"), '{ "name": "example-api", "env": { "staging": {} } }');
	for (const command of [
		"ENVIRONMENT=staging; wrangler deploy --env $ENVIRONMENT",
		"bash -c 'cd . && wrangler deploy'",
		"sh <<'EOF'\nwrangler deploy --env staging\nEOF",
		"export CLOUDFLARE_ENV=staging; wrangler deploy",
	])
		assert.equal(decide(command, cwd, allowed)._tag, "allow", command);
	const denied = decide("CMD='wrangler deploy --name other-api'; bash -c \"$CMD\"", cwd, allowed);
	assert.equal(denied._tag, "block");
	if (denied._tag === "block") assert.match(denied.reason, /unknown Worker application "other-api"/);
});
