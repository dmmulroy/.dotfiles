---
name: sync-pocock-skills
description: Sync Matt Pocock's skills from upstream, applying pi-specific patches and handling dependencies and lifecycle migrations.
disable-model-invocation: true
---

# Sync Pocock Skills

Sync our copies of [mattpocock/skills](https://github.com/mattpocock/skills) against either the default branch or an exact release, apply pi-specific patches, and surface migration work.

## Quick start

Use absolute paths so current-directory confusion does not matter:

```bash
SKILL_ROOT="$HOME/.pi/agent/skills/sync-pocock-skills"
bash "$SKILL_ROOT/scripts/sync.sh" \
  "$HOME/.pi/agent/skills" \
  "$SKILL_ROOT/patches" \
  --keep-upstream
```

For a release, pin its exact tag instead of analysing a moving default branch:

```bash
bash "$SKILL_ROOT/scripts/sync.sh" \
  "$HOME/.pi/agent/skills" \
  "$SKILL_ROOT/patches" \
  --ref 'mattpocock-skills@1.0.0' \
  --keep-upstream
```

Options:

- `--ref <git-ref>` — clone an exact tag or branch.
- `--keep-upstream` — retain the temporary clone after the script exits.
- `--upstream-dir <dir>` — clone into a specific path and retain it.

## Workflow

### 1. Read release notes and analyse

When the user supplies a release URL, read the notes first and pass its tag to `--ref`. Treat explicit breaking changes as migration instructions, not ordinary file diffs.

Parse these report sections:

- **NEW_SKILLS** — upstream skills not installed locally. `required_by=` marks dependencies of installed skills.
- **LIFECYCLE_CHANGES** — installed skills renamed, replaced, removed, or unexpectedly missing upstream.
- **DEPENDENCY_GAPS** — model-invoked skills referenced by installed skills but not installed.
- **UPSTREAM_CHANGES** — file-level differences in skills that retain the same name.
- **UNPATCHED_PATTERNS** — Claude Code or sub-agent references without pi patches.
- **UPSTREAM_DIR** — retained upstream `skills/` root, requested ref, and resolved commit.

The upstream root contains category directories. Resolve a skill's actual directory before invoking another script:

```bash
upstream_root="<UPSTREAM_DIR from sync output>"
skill="<skill-name>"
upstream_skill_dir=$(find "$upstream_root" -mindepth 2 -maxdepth 2 -type d -name "$skill" -print -quit)
[[ -n "$upstream_skill_dir" ]] || { echo "missing upstream skill dir for $skill"; exit 1; }
```

### 2. Handle lifecycle changes

Lifecycle mappings live in `patches/upstream-migrations.tsv`.

- **RENAMED** — install the new skill, migrate only still-relevant pi patches or overrides, then remove the old directory and stale configuration.
- **REPLACED** — install the replacement as a new skill. Do not blindly port the old instructions or patches.
- **REMOVED** — show the release rationale and local diff, then remove the skill and stale patch/override/exclusion entries if the user accepts upstream's removal.
- **MISSING_UPSTREAM** — investigate before deleting. Add a migration entry only after confirming the upstream change.

Do not carry `disable-model-invocation` across a rename or replacement automatically. Upstream 1.0.0 distinguishes:

- **User-invoked** skills: `disable-model-invocation: true`; descriptions are human-facing.
- **Model-invoked** skills: no disable flag; descriptions retain auto-invocation triggers.

Respect upstream's classification unless a deliberate pi policy is recorded in `patches/local-overrides.json`.

### 3. Resolve dependencies and new skills

Install missing dependencies before updating the skills that invoke them. A user-invoked skill may orchestrate model-invoked skills, but must not invoke another user-invoked skill as an automatic dependency.

For each new optional skill, show its name, category, description, and dependants. Ask whether to:

- **Install** — run `scripts/install-new.sh`.
- **Exclude** — append its name to `patches/excluded.txt`.

```bash
bash "$SKILL_ROOT/scripts/install-new.sh" \
  "$skill" "$upstream_skill_dir" \
  "$HOME/.pi/agent/skills" "$SKILL_ROOT/patches"
```

If installing a router such as `ask-matt`, first confirm that every skill it routes to is installed. Rerun the analysis after installation to expose any dependency gap.

### 4. Apply same-name upstream changes

For each `CHANGED:` entry:

- **changed, no patch** — safe to replace from upstream.
- **upstream changed, has patch** — inspect the upstream diff, apply, and verify the patch still expresses a pi-specific difference.
- **patch conflict** — compare upstream, local, and patch intent; resolve manually and regenerate the patch.
- **new file upstream** — copy it.
- **removed upstream** — remove it unless it is an intentional local resource.

Apply a complete upstream skill atomically:

```bash
bash "$SKILL_ROOT/scripts/apply-upstream.sh" \
  "$skill" "$upstream_skill_dir" \
  "$HOME/.pi/agent/skills" "$SKILL_ROOT/patches"
```

Inspect the working-tree diff immediately. `rsync --delete` removes old bundled resources, and local frontmatter not configured in `local-overrides.json` may disappear.

### 5. Handle pi-specific patterns

For each `UNPATCHED:` entry:

1. Read the file and identify the Claude Code-specific behavior.
2. Replace it with direct pi instructions.
3. Regenerate its patch:

```bash
bash "$SKILL_ROOT/scripts/make-patch.sh" \
  "$skill" "$rel_path" "$upstream_file" "$our_file" "$SKILL_ROOT/patches"
```

`make-patch.sh` uses stable labels. For `SKILL.md`, it excludes configured local metadata from the text patch while preserving a field if upstream now supplies it natively.

## Patch conventions

| Claude Code pattern | Pi replacement |
|---|---|
| `Agent tool with subagent_type=Explore` | Walk the codebase using `read`, `grep`, `find`, and `bash`. |
| Spawn parallel sub-agents | Produce the alternatives independently from the original brief; do not let one alternative anchor the next. |
| Generic `sub-agent` / `subagent` | Remove it or replace it with direct-agent instructions. |
| Check `CLAUDE.md` first | Check `AGENTS.md` first and `CLAUDE.md` as fallback. |

### 6. Verify and report

1. Rerun `sync.sh` against the same `--ref`.
2. Confirm no unexpected lifecycle changes, dependency gaps, upstream changes, or unpatched patterns remain.
3. Run and read `git diff -- <changed skill paths>`.
4. Report skills added, migrated, removed, excluded, and updated; patches created or dropped; unresolved conflicts; and the resolved upstream tag/commit.
5. Separate metadata-only changes from instruction-body changes. Include short diffs directly; for long diffs include the stat and important hunks.

## Configuration

- `patches/excluded.txt` — upstream skills intentionally not installed.
- `patches/local-only.txt` — local skills that must not be mistaken for removed upstream skills.
- `patches/upstream-migrations.tsv` — confirmed rename, replacement, and removal mappings.
- `patches/local-overrides.json` — deliberate pi frontmatter policy applied after upstream and text patches.
- `patches/*.patch` — pi-specific content changes.

## File layout

```text
sync-pocock-skills/
├── SKILL.md
├── scripts/
│   ├── sync.sh
│   ├── apply-upstream.sh
│   ├── install-new.sh
│   ├── apply-frontmatter-overrides.py
│   └── make-patch.sh
└── patches/
    ├── excluded.txt
    ├── local-only.txt
    ├── upstream-migrations.tsv
    ├── local-overrides.json
    └── *.patch
```
