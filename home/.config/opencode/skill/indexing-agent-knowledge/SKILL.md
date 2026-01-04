---
name: indexing-agent-knowledge
description: Generate hierarchical AGENTS.md files for codebases. Use when setting up agent context, onboarding agents to a repo, creating AGENTS.md, reindexing after major changes, or improving agent performance. Key insight - context is the constraint on AI capability.
---

# Indexing Agent Knowledge

Generate hierarchical AGENTS.md files. Root + complexity-scored subdirectories.

## Usage

```
/index-knowledge                   # Generate/update AGENTS.md files
/index-knowledge --max-depth=3     # Limit directory depth (default: 5)
```

Auto-detects mode: fresh init if no AGENTS.md exists, incremental update if found with commit metadata.

---

## Task Tracking

**TodoWrite ALL phases. Mark in_progress -> completed in real-time.**

```
TodoWrite([
  { id: "discovery", content: "Structural analysis + explore agents", status: "pending", priority: "high" },
  { id: "scoring", content: "Score directories, determine locations", status: "pending", priority: "high" },
  { id: "capture", content: "Generate AGENTS.md files", status: "pending", priority: "high" },
  { id: "review", content: "Deduplicate, validate, trim", status: "pending", priority: "medium" }
])
```

---

## Phase 1: Discovery

**Mark "discovery" as in_progress.**

### Structural Analysis (Bash)

```bash
# Directory depth + file counts
find . -type d -not -path '*/\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# Files per directory (top 30)
find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# Code concentration by extension
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Existing AGENTS.md / CLAUDE.md
find . -type f \( -name "AGENTS.md" -o -name "CLAUDE.md" \) -not -path '*/node_modules/*' 2>/dev/null
```

### Explore Agents (Parallel)

Fire immediately - these run async:

```
Task(agent="explore", prompt="Project structure: PREDICT standard patterns for detected language -> REPORT deviations only")
Task(agent="explore", prompt="Entry points: FIND main files -> REPORT non-standard organization")
Task(agent="explore", prompt="Conventions: FIND config files (.eslintrc, pyproject.toml, .editorconfig) -> REPORT project-specific rules")
Task(agent="explore", prompt="Anti-patterns: FIND 'DO NOT', 'NEVER', 'ALWAYS', 'DEPRECATED' comments -> LIST forbidden patterns")
Task(agent="explore", prompt="Build/CI: FIND .github/workflows, Makefile -> REPORT non-standard patterns")
Task(agent="explore", prompt="Test patterns: FIND test configs, test structure -> REPORT unique conventions")
```

### Dynamic Agent Scaling

After bash analysis, spawn additional agents based on project scale:

| Factor | Threshold | Additional Agents |
|--------|-----------|-------------------|
| Total files | >100 | +1 per 100 files |
| Total lines | >10k | +1 per 10k lines |
| Directory depth | >=4 | +2 for deep exploration |
| Large files (>500 lines) | >10 | +1 for complexity hotspots |
| Monorepo | detected | +1 per package/workspace |
| Multiple languages | >1 | +1 per language |

### Read Existing AGENTS.md

For each existing file found: read, extract key insights, store for reference during generation.

**Mark "discovery" as completed.**

---

## Phase 2: Scoring

**Mark "scoring" as in_progress.**

### Scoring Factors

| Factor | Weight | Scoring |
|--------|--------|---------|
| File count | 3x | >20: 9pts, >10: 6pts, >5: 3pts |
| Subdir count | 2x | >5: 6pts, >3: 4pts, >1: 2pts |
| Code ratio | 2x | >70%: 6pts, >50%: 4pts |
| Module boundary | 2x | Has index.ts/__init__.py: 6pts |
| Has config | 1x | package.json/tsconfig: 3pts |
| Deep code | 1x | >50 files recursive: 3pts |

### Decision Rules

| Score | Action |
|-------|--------|
| Root (.) | ALWAYS create |
| >15 | Create AGENTS.md |
| 8-15 | Create if distinct domain |
| <8 | Skip (parent covers) |

**"Distinct domain" criteria** (create if ANY true):
- Has own package.json/pyproject.toml/Cargo.toml
- Different language than parent
- Public API boundary (exports used by multiple dirs)
- Contains domain-specific anti-patterns
- Would require >3 paragraphs in parent's AGENTS.md

**Mark "scoring" as completed.**

---

## Phase 3: Capture

**Mark "capture" as in_progress.**

### Root AGENTS.md Template

**Strictness: HIGH** - Use exact structure. Omit empty sections.

```markdown
# {PROJECT_NAME}

**Generated:** {ISO_TIMESTAMP}
**Commit:** {GIT_SHORT_SHA}
**Branch:** {GIT_BRANCH}

{1-2 sentences: what this is + core stack}

## Structure

\`\`\`
{root}/
├── {dir}/        # {non-obvious purpose only}
└── {entry_file}
\`\`\`

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| {common task} | {path} | {gotcha if any} |

## Conventions

{ONLY deviations from language/framework standard}

## Code Map

{Skip if <10 files OR LSP unavailable}

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|

## Anti-Patterns

{Explicitly forbidden in THIS project}

## Commands

\`\`\`bash
{dev/test/build commands}
\`\`\`

## Notes

{Gotchas, surprises, tribal knowledge}
```

**Root quality gates:** 50-150 lines, no generic advice, telegraphic style.

### Subdirectory AGENTS.md Template

**Strictness: MEDIUM** - Adapt sections to what's relevant.

```markdown
# {Directory Name}

**Generated:** {ISO_TIMESTAMP}
**Commit:** {GIT_SHORT_SHA}
**Branch:** {GIT_BRANCH}

{One line: what this module does}

## Structure

{Only if >5 subdirs}

## Where to Look

| Task | Location |
|------|----------|

## Conventions

{Only if different from parent}

## Anti-Patterns

{Specific to this module}
```

**Subdir quality gates:** 30-80 lines, NEVER repeat parent content.

### Generation Order

1. Root first
2. All subdirs in parallel (each receives root as context for deduplication)

**Mark "capture" as completed.**

---

## Phase 4: Review

**Mark "review" as in_progress.**

For each generated file:
- Remove generic advice (applies to ALL projects)
- Remove parent duplicates (child adds unique signal only)
- Trim to size limits
- Verify telegraphic style
- Ensure metadata present

### Deduplication Rules

1. Fact in both parent and child -> remove from child
2. Convention applies to whole project -> move to root
3. Anti-pattern is language-standard -> remove entirely
4. Section empty after filtering -> remove section

**Mark "review" as completed.**

---

## Update Mode (Auto-Detected)

When existing AGENTS.md files found with `**Commit:**` metadata:

1. Find existing AGENTS.md files
2. Extract **Commit:** from each
3. Run `git log {commit}..HEAD -- {covered_paths}`
4. Update sections covering changed directories

| Change Type | Action |
|-------------|--------|
| New files in scored dir | Add to "Where to Look" if significant |
| Files deleted | Remove stale references |
| New anti-pattern comments | Add to Anti-Patterns |
| Many changes in one dir | Re-read, update its AGENTS.md |

If no existing files or missing commit metadata → full generation.

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Document every directory | Only score >8 or distinct domains |
| Repeat parent in child | Each node adds unique signal only |
| Include generic advice | Only project-specific knowledge |
| Write verbose prose | Telegraphic: tables, bullets, terse |
| Run agents sequentially | Parallel: bash + explore concurrent |
| Ignore existing docs | Always read existing first |

---

## Scripts (Optional)

Utility scripts for structured data. Use bash/explore agents as primary; scripts accelerate large codebases.

### find-agent-md-files.ts

Find all AGENTS.md/CLAUDE.md with extracted metadata.

```bash
bun run scripts/find-agent-md-files.ts <path>
```

Output: `{ root, files: [{ path, type, commit?, generated?, branch? }] }`

### diff-changes-since-sync.ts

Get structured diff since last sync commit.

```bash
bun run scripts/diff-changes-since-sync.ts <path> <commit>
```

Output: `{ root, baseCommit, headCommit, summary: { filesChanged, insertions, deletions, commitCount }, byDirectory: [{ path, files }] }`

### map-directory-tree.ts

Map directory tree structure respecting .gitignore.

```bash
bun run scripts/map-directory-tree.ts <path> [maxDepth]
```

Output: `{ root, tree: { name, type, path, children?, size? } }`

---

## References

- [Intent Layer System](references/intent-layer-system.md) - Theory: hierarchical context
- [Context Is Your Constraint](references/context-is-your-constraint.md) - Why context matters
- [Init Deep Reference](references/init-deep-reference.md) - Original methodology
