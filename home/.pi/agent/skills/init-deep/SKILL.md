---
name: init-deep
description: Generate hierarchical AGENTS.md files for a codebase. Root + complexity-scored subdirectories. Use when user says "init deep", "generate AGENTS.md", "document this repo", wants to create or regenerate project knowledge files, or mentions "knowledge base".
disable-model-invocation: true
---

# init-deep

Generate hierarchical AGENTS.md files. Root + complexity-scored subdirectories.

## Usage

```
init-deep                       # Update mode: modify existing + create new where warranted
init-deep --create-new          # Read existing → remove all → regenerate from scratch
init-deep --max-depth=2         # Limit directory depth (default: 3)
```

## Workflow

1. **Discovery** — Structural analysis via bash + grep + read existing AGENTS.md
2. **Score & Decide** — Determine which directories warrant their own AGENTS.md
3. **Generate** — Root first, then subdirectories
4. **Review** — Deduplicate, trim, validate

Create todos for each phase. Mark in_progress → completed in real-time.

## Phase 1: Discovery

**Create todos, mark "discovery" in_progress.**

### Structural analysis (bash)

Run these sequentially — they're fast:

```bash
# Directory depth + file counts
find . -type d -not -path '*/\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# Files per directory (top 30)
find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# Code concentration by extension
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.go" -o -name "*.rs" -o -name "*.lua" -o -name "*.fish" \) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Existing AGENTS.md
find . -type f \( -name "AGENTS.md" -o -name "CLAUDE.md" \) -not -path '*/node_modules/*' 2>/dev/null
```

### Grep-based symbol analysis (replaces LSP)

```bash
# Entry points
rg -l "^(export default|module\.exports|func main|fn main|if __name__)" --type-add 'code:*.{ts,tsx,js,py,go,rs}' -t code 2>/dev/null | head -20

# Key symbols: exported classes, interfaces, functions
rg "^export (class|interface|type|function|const|enum) \w+" --type-add 'code:*.{ts,tsx,js}' -t code -o 2>/dev/null | head -40

# Config files (conventions source)
find . -maxdepth 3 \( -name ".eslintrc*" -o -name "pyproject.toml" -o -name ".editorconfig" -o -name "tsconfig*" -o -name "Makefile" -o -name "Cargo.toml" -o -name "go.mod" \) -not -path '*/node_modules/*' 2>/dev/null

# Anti-pattern markers in comments
rg -i "(DO NOT|NEVER|ALWAYS|DEPRECATED|HACK|FIXME|XXX)" --type-add 'code:*.{ts,tsx,js,py,go,rs,lua,fish}' -t code -c 2>/dev/null | sort -t: -k2 -rn | head -10

# Build/CI
find . -maxdepth 3 \( -path "*/.github/workflows/*" -o -name "Makefile" -o -name "Dockerfile*" -o -name "docker-compose*" \) -not -path '*/node_modules/*' 2>/dev/null
```

### Read existing AGENTS.md

For each existing file found: `read` it, extract key insights, conventions, anti-patterns. Store mentally for deduplication in Phase 3.

If `--create-new`: Read all existing first (preserve context) → then delete all → regenerate.

**Mark "discovery" completed.**

## Phase 2: Score & Decide

**Mark "scoring" in_progress.**

See [SCORING.md](SCORING.md) for the full matrix and decision rules.

Quick version:

| Score | Action |
|-------|--------|
| Root (.) | ALWAYS create |
| >15 | Create AGENTS.md |
| 8–15 | Create if distinct domain |
| <8 | Skip (parent covers) |

**Present the scored list to the user via `interview`** — let them confirm/override locations before generating.

**Mark "scoring" completed.**

## Phase 3: Generate

**Mark "generate" in_progress.**

See [TEMPLATES.md](TEMPLATES.md) for the root and subdirectory templates.

Key rules:
- **If AGENTS.md exists** → use `edit` tool
- **If it does NOT exist** → use `write` tool
- Root: 50–150 lines, full treatment
- Subdirectories: 30–80 lines, never repeat parent content
- Telegraphic style — no prose, no generic advice, no obvious info

**Mark "generate" completed.**

## Phase 4: Review

**Mark "review" in_progress.**

For each generated file:
- Remove generic advice (applies to ALL projects)
- Remove parent duplicates (child never repeats parent)
- Trim to size limits
- Verify telegraphic style

**Mark "review" completed.**

## Final Report

```
=== init-deep Complete ===

Mode: {update | create-new}

Files:
  [OK] ./AGENTS.md (root, {N} lines)
  [OK] ./src/hooks/AGENTS.md ({N} lines)

Dirs Analyzed: {N}
AGENTS.md Created: {N}
AGENTS.md Updated: {N}

Hierarchy:
  ./AGENTS.md
  └── src/hooks/AGENTS.md
```

## Anti-Patterns

- **Over-documenting**: Not every dir needs AGENTS.md — use the scoring matrix
- **Redundancy**: Child NEVER repeats parent
- **Generic content**: Remove anything that applies to ALL projects
- **Verbose style**: Telegraphic or die
- **Ignoring existing**: ALWAYS read existing first, even with --create-new
- **Skipping user confirmation**: Present scored locations before generating
