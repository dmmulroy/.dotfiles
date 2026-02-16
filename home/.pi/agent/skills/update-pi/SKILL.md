---
name: update-pi
description: Update Pi to the latest release, only applying changes when versions drift (global CLI + ~/.dotfiles/home/.pi/agent deps).
---

# Update Pi Skill

Use this skill when the user asks to upgrade Pi itself.

## What this skill does

1. Finds the latest Pi version from npm.
2. Compares the global CLI version and updates it only if needed.
3. Syncs `@mariozechner/pi-*` deps in `~/.dotfiles/home/.pi/agent/package.json` only if needed.
4. Runs `bun install` only when `package.json` changed.
5. Verifies final versions and prints a small summary.

## Commands

```bash
set -euo pipefail

# 1) Resolve latest version once
LATEST="$(npm view @mariozechner/pi-coding-agent version)"
TARGET_RANGE="^${LATEST}"
echo "Latest Pi version: ${LATEST}"

# 2) Update global CLI only when needed
GLOBAL_CURRENT="$(npm list -g --depth=0 --json 2>/dev/null | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
let v = "";
try {
  const j = JSON.parse(input);
  v = j.dependencies?.["@mariozechner/pi-coding-agent"]?.version || "";
} catch {}
process.stdout.write(v);
')"

GLOBAL_UPDATED=no
if [ "${GLOBAL_CURRENT}" != "${LATEST}" ]; then
  echo "Updating global pi-coding-agent: ${GLOBAL_CURRENT:-<none>} -> ${LATEST}"
  npm install -g "@mariozechner/pi-coding-agent@${LATEST}"
  GLOBAL_UPDATED=yes
else
  echo "Global pi-coding-agent already at ${LATEST}; skipping npm install -g"
fi

# 3) Sync dotfiles Pi package versions only when drift exists
cd ~/.dotfiles/home/.pi/agent

PKG_JSON_UPDATED="$(LATEST="${LATEST}" TARGET_RANGE="${TARGET_RANGE}" node -e '
const fs = require("fs");
const path = "package.json";
const target = process.env.TARGET_RANGE;
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
const deps = pkg.dependencies || {};
const names = [
  "@mariozechner/pi-ai",
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-tui"
];
let changed = false;
for (const name of names) {
  if (deps[name] !== target) {
    deps[name] = target;
    changed = true;
  }
}
if (changed) {
  pkg.dependencies = deps;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}
process.stdout.write(changed ? "yes" : "no");
')"

# 4) Refresh local install + lockfile only when package.json changed
BUN_INSTALL_RAN=no
if [ "${PKG_JSON_UPDATED}" = "yes" ]; then
  echo "package.json updated; running bun install"
  bun install
  BUN_INSTALL_RAN=yes
else
  echo "package.json already aligned; skipping bun install"
fi

# 5) Verify + concise summary
echo "--- Verification ---"
npm list -g --depth=0 | rg '@mariozechner/pi-coding-agent'
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.dependencies, null, 2))'

echo "--- Summary ---"
echo "globalUpdated=${GLOBAL_UPDATED}"
echo "packageJsonUpdated=${PKG_JSON_UPDATED}"
echo "bunInstallRan=${BUN_INSTALL_RAN}"
```

## Notes

- Keep the three `@mariozechner/pi-*` dependency versions aligned.
- This skill is idempotent: if already up to date, it should do no-op work and report skips clearly.
- Always read/write `~/.dotfiles/home/.pi/agent/package.json` (dotfiles source of truth), not `~/.pi` directly.
