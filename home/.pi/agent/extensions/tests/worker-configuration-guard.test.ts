import assert from "node:assert/strict";
import test from "node:test";

import { findWorkerConfigurationMutation } from "../worker-configuration-guard.ts";

const PROTECTED_FILE = "apps/worker/worker-configuration.d.ts";

test("allows historical read-only commands that mention worker configuration", () => {
	const commands = [
		`rg -n "interface ExecutionContext" ${PROTECTED_FILE} 2>/dev/null | head -20`,
		`git diff --exit-code -- ${PROTECTED_FILE} >/dev/null && echo unchanged`,
		`python3 - <<'PY'\nfrom pathlib import Path\nprint(Path('${PROTECTED_FILE}').read_text())\nPY`,
		`rg -n "release-manager" --glob '!${PROTECTED_FILE}' . 2>/dev/null`,
		`cd apps/worker && pnpm exec wrangler types worker-configuration.d.ts >/tmp/wrangler-types.log && pnpm exec vitest run`,
		`git restore ${PROTECTED_FILE} && git status --short`,
		`cp ${PROTECTED_FILE} /tmp/worker-configuration.backup.d.ts`,
	];

	for (const command of commands) {
		assert.equal(findWorkerConfigurationMutation(command), undefined, command);
	}
});

test("blocks shell commands that definitely mutate worker configuration", () => {
	const commands = [
		`cat /tmp/generated.d.ts > ${PROTECTED_FILE}`,
		`printf generated >> "${PROTECTED_FILE}"`,
		`rm -f ${PROTECTED_FILE}`,
		`tee ${PROTECTED_FILE} < /tmp/generated.d.ts`,
		`sed -i '' generated ${PROTECTED_FILE}`,
		`cp /tmp/generated.d.ts ${PROTECTED_FILE}`,
		`dd if=/tmp/generated.d.ts of=${PROTECTED_FILE}`,
	];

	for (const command of commands) {
		assert.notEqual(findWorkerConfigurationMutation(command), undefined, command);
	}
});
