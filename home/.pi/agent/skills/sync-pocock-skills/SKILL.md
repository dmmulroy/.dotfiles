---
name: sync-pocock-skills
description: Sync Matt Pocock's skills from upstream (github.com/mattpocock/skills), apply pi-specific patches that replace Claude Code sub-agent references, and flag new skills or unpatched patterns. Use when user says "sync skills", "update pocock skills", or "check for skill updates".
disable-model-invocation: true
---

# Sync Pocock Skills

Sync our copies of [mattpocock/skills](https://github.com/mattpocock/skills) against upstream, apply pi-specific patches, and flag anything new.

## Quick start

Run the sync analysis script, then follow its output. Use absolute paths from this skill directory so `$0`/current-directory confusion does not matter:

```bash
SKILL_ROOT="$HOME/.pi/agent/skills/sync-pocock-skills"
bash "$SKILL_ROOT/scripts/sync.sh" "$HOME/.pi/agent/skills" "$SKILL_ROOT/patches" --keep-upstream
```

## Workflow

### 1. Analyse

Run `scripts/sync.sh` with args `<skills_dir>` `<patches_dir>`, usually with `--keep-upstream` so the printed upstream clone remains available for inspection:

```bash
SKILL_ROOT="$HOME/.pi/agent/skills/sync-pocock-skills"
bash "$SKILL_ROOT/scripts/sync.sh" "$HOME/.pi/agent/skills" "$SKILL_ROOT/patches" --keep-upstream
```

Options:

- `--keep-upstream` — retain the temp upstream clone after the script exits.
- `--upstream-dir <dir>` — clone upstream into a specific path and retain it.

Parse the output sections:

- **NEW_SKILLS** — skills upstream we don't have. Ask the user which to add.
- **UPSTREAM_CHANGES** — files that changed upstream in skills we track. Shows whether changes conflict with our patches.
- **UNPATCHED_PATTERNS** — Claude Code / sub-agent references in our skills that lack patches.
- **UPSTREAM_DIR** — path to the cloned upstream `skills/` root. It is retained only when you passed `--keep-upstream` or `--upstream-dir`.

Important: `UPSTREAM_DIR` is the upstream skills root, not a directly usable skill directory. Upstream skills are grouped by category (for example `engineering/diagnose`), so do **not** call `apply-upstream.sh` with `$UPSTREAM_DIR/$skill`. Resolve the exact upstream skill directory first:

```bash
upstream_root="<UPSTREAM_DIR from sync output>"
skill="diagnose"
upstream_skill_dir=$(find "$upstream_root" -mindepth 2 -maxdepth 2 -type d -name "$skill" -print -quit)
```

### 2. Handle new skills

For each `NEW:` entry, show the name, category, and description. Ask the user whether to:

- **Install** — run `scripts/install-new.sh`, then scan its output for patterns needing patches.
- **Exclude** — append to `patches/excluded.txt` so future syncs skip it.

Install with:

```bash
bash scripts/install-new.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>
```

### 3. Apply upstream changes

For each `CHANGED:` entry:

- **"upstream changed, no patch"** — safe to overwrite with upstream. Run `scripts/apply-upstream.sh`.
- **"upstream changed, has patch"** — read the upstream diff, update our copy from upstream, re-apply the patch and configured local overrides. If the patch conflicts, read both versions, resolve manually, then regenerate the patch with `scripts/make-patch.sh`.
- **"patch conflict"** — the patch no longer applies. Read both the upstream file and our current file, resolve, regenerate patch.
- **"new file"** — copy from upstream.
- **"removed upstream"** — flag to user, suggest removing.

Apply with:

```bash
SKILL_ROOT="$HOME/.pi/agent/skills/sync-pocock-skills"
upstream_root="<UPSTREAM_DIR from sync output>"
skill="<skill_name>"
upstream_skill_dir=$(find "$upstream_root" -mindepth 2 -maxdepth 2 -type d -name "$skill" -print -quit)
[[ -n "$upstream_skill_dir" ]] || { echo "missing upstream skill dir for $skill"; exit 1; }
bash "$SKILL_ROOT/scripts/apply-upstream.sh" "$skill" "$upstream_skill_dir" "$HOME/.pi/agent/skills" "$SKILL_ROOT/patches"
```

After each apply, inspect the actual working-tree diff for that skill before summarising. Local overrides can add frontmatter, but any existing local frontmatter that is not configured in `patches/local-overrides.json` may be removed when upstream is copied. Call out metadata-only changes explicitly, and if a removed frontmatter field should be preserved, add it to `local-overrides.json` rather than relying on manual edits.

### 4. Handle unpatched patterns

For each `UNPATCHED:` entry, read the flagged file and create a patch:

1. Read the file and identify the Claude Code-specific patterns.
2. Edit the file to replace them with pi-equivalent instructions (see [Patch conventions](#patch-conventions)).
3. Regenerate the patch:

```bash
bash scripts/make-patch.sh <skill_name> <rel_path> <upstream_file> <our_file> <patches_dir>
```

4. This skill is now self-updated — the new patch is stored for future syncs.

`make-patch.sh` writes stable patch headers (`upstream/<skill>/<path>` and `ours/<skill>/<path>`) so patches do not churn when temp clone paths change. For `SKILL.md`, it strips configured `local-overrides.json` frontmatter from the comparison copy so metadata policy does not become a one-line text patch.

### 5. Verify and summarise

After applying changes:

1. Rerun `sync.sh` with `--keep-upstream` and confirm there are no unexpected `UPSTREAM_CHANGES` or `UNPATCHED_PATTERNS`.
2. Run `git diff -- <changed skill paths>` and read it before reporting. Do not assume a `CHANGED:` entry means the skill body changed; the net diff may be metadata-only after patches and local overrides.
3. Include the skill diffs in the final response. For short diffs, paste the full fenced `diff`. For very long diffs, include `git diff --stat`, the important hunks, and say that the full diff is available.

Report to the user:
- Skills added / excluded
- Skills updated (with/without patch re-application)
- New patches created
- Any conflicts that need manual attention
- Net skill changes, separating frontmatter/metadata changes from instruction-body changes
- The actual diff for changed skill files

## Local overrides

`patches/local-overrides.json` stores pi-specific metadata that should be applied after upstream files and text patches, without requiring one-line patch files. Currently it preserves selected skill frontmatter such as:

```yaml
disable-model-invocation: true
```

`scripts/apply-upstream.sh`, `scripts/install-new.sh`, and `scripts/sync.sh` all account for these overrides.

## Patch conventions

When replacing Claude Code-specific patterns, use these pi equivalents:

| Claude Code pattern | Pi replacement |
|---|---|
| `Agent tool with subagent_type=Explore` | `walk the codebase using your tools (read, grep, find, bash)` |
| `Spawn N sub-agents in parallel` | `Produce N radically different [X] sequentially, working from the original brief independently` |
| `sub-agent` / `subagent` (generic) | Remove or replace with direct agent instructions |
| `CLAUDE.md` checked first | `AGENTS.md` checked first, `CLAUDE.md` as fallback |

## File layout

```
sync-pocock-skills/
├── SKILL.md                                    # This file
├── scripts/
│   ├── sync.sh                                 # Analyse upstream vs ours
│   ├── apply-upstream.sh                       # Copy upstream + re-apply patches/overrides
│   ├── install-new.sh                          # Install a new upstream skill + scan patterns
│   ├── apply-frontmatter-overrides.py          # Apply local-overrides.json frontmatter
│   └── make-patch.sh                           # Generate a patch file with stable labels
└── patches/
    ├── excluded.txt                            # Skills we don't sync
    ├── local-overrides.json                    # Pi-specific metadata overrides
    ├── improve-codebase-architecture__SKILL.md.patch
    ├── improve-codebase-architecture__INTERFACE-DESIGN.md.patch
    └── setup-matt-pocock-skills__SKILL.md.patch
```
