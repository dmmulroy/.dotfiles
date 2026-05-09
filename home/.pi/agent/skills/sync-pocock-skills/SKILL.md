---
name: sync-pocock-skills
description: Sync Matt Pocock's skills from upstream (github.com/mattpocock/skills), apply pi-specific patches that replace Claude Code sub-agent references, and flag new skills or unpatched patterns. Use when user says "sync skills", "update pocock skills", or "check for skill updates".
disable-model-invocation: true
---

# Sync Pocock Skills

Sync our copies of [mattpocock/skills](https://github.com/mattpocock/skills) against upstream, apply pi-specific patches, and flag anything new.

## Quick start

Run the sync analysis script, then follow its output:

```bash
bash scripts/sync.sh ~/.pi/agent/skills scripts/../patches
```

## Workflow

### 1. Analyse

Run `scripts/sync.sh` with args `<skills_dir>` `<patches_dir>`:

```bash
bash "$(dirname "$0")/scripts/sync.sh" "$HOME/.pi/agent/skills" "$(dirname "$0")/patches"
```

Parse the output sections:

- **NEW_SKILLS** — skills upstream we don't have. Ask the user which to add.
- **UPSTREAM_CHANGES** — files that changed upstream in skills we track. Shows whether changes conflict with our patches.
- **UNPATCHED_PATTERNS** — Claude Code / sub-agent references in our skills that lack patches.
- **UPSTREAM_DIR** — temp path to the cloned upstream (for reading files).

### 2. Handle new skills

For each `NEW:` entry, show the name, category, and description. Ask the user whether to:

- **Install** — copy from upstream, then scan for patterns needing patches.
- **Exclude** — append to `patches/excluded.txt` so future syncs skip it.

### 3. Apply upstream changes

For each `CHANGED:` entry:

- **"upstream changed, no patch"** — safe to overwrite with upstream. Run `scripts/apply-upstream.sh`.
- **"upstream changed, has patch"** — read the upstream diff, update our copy from upstream, re-apply the patch. If the patch conflicts, read both versions, resolve manually, then regenerate the patch with `scripts/make-patch.sh`.
- **"patch conflict"** — the patch no longer applies. Read both the upstream file and our current file, resolve, regenerate patch.
- **"new file"** — copy from upstream.
- **"removed upstream"** — flag to user, suggest removing.

Apply with:

```bash
bash scripts/apply-upstream.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>
```

### 4. Handle unpatched patterns

For each `UNPATCHED:` entry, read the flagged file and create a patch:

1. Read the file and identify the Claude Code-specific patterns.
2. Edit the file to replace them with pi-equivalent instructions (see [Patch conventions](#patch-conventions)).
3. Regenerate the patch:

```bash
bash scripts/make-patch.sh <skill_name> <rel_path> <upstream_file> <our_file> <patches_dir>
```

4. This skill is now self-updated — the new patch is stored for future syncs.

### 5. Summary

Report to the user:
- Skills added / excluded
- Skills updated (with/without patch re-application)
- New patches created
- Any conflicts that need manual attention

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
│   ├── apply-upstream.sh                       # Copy upstream + re-apply patches
│   └── make-patch.sh                           # Generate a patch file
└── patches/
    ├── excluded.txt                            # Skills we don't sync
    ├── improve-codebase-architecture__SKILL.md.patch
    ├── improve-codebase-architecture__INTERFACE-DESIGN.md.patch
    └── setup-matt-pocock-skills__SKILL.md.patch
```
