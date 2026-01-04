# /init-deep Reference

> Original command from oh-my-opencode for hierarchical AGENTS.md generation

## Contents

- [Usage](#usage)
- [Workflow Phases](#workflow-phases)
- [Scoring Matrix](#scoring-matrix)
- [Decision Rules](#decision-rules)
- [Root AGENTS.md Template](#root-agentsmd-template)
- [Subdirectory AGENTS.md](#subdirectory-agentsmd)
- [Anti-Patterns](#anti-patterns)

---

## Usage

```
/init-deep                      # Update mode: modify existing + create new
/init-deep --create-new         # Read existing → remove all → regenerate
/init-deep --max-depth=2        # Limit directory depth (default: 5)
```

---

## Workflow Phases

1. **Discovery + Analysis** - Concurrent exploration + structural analysis
2. **Score & Decide** - Determine AGENTS.md locations
3. **Generate** - Root first, then subdirs in parallel
4. **Review** - Deduplicate, trim, validate

---

## Scoring Matrix

| Factor | Weight | High Threshold | Source |
|--------|--------|----------------|--------|
| File count | 3x | >20 | bash |
| Subdir count | 2x | >5 | bash |
| Code ratio | 2x | >70% | bash |
| Unique patterns | 1x | Has own config | explore |
| Module boundary | 2x | Has index.ts/__init__.py | bash |
| Symbol density | 2x | >30 symbols | LSP |
| Export count | 2x | >10 exports | LSP |
| Reference centrality | 3x | >20 refs | LSP |

---

## Decision Rules

| Score | Action |
|-------|--------|
| **Root (.)** | ALWAYS create |
| **>15** | Create AGENTS.md |
| **8-15** | Create if distinct domain |
| **<8** | Skip (parent covers) |

---

## Root AGENTS.md Template

```markdown
# PROJECT KNOWLEDGE BASE

**Generated:** {TIMESTAMP}
**Commit:** {SHORT_SHA}

## OVERVIEW
{1-2 sentences: what + core stack}

## STRUCTURE
{root}/
├── {dir}/    # {non-obvious purpose only}
└── {entry}

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|

## CONVENTIONS
{ONLY deviations from standard}

## ANTI-PATTERNS (THIS PROJECT)
{Explicitly forbidden here}

## COMMANDS
{dev/test/build}

## NOTES
{Gotchas}
```

**Quality gates:** 50-150 lines, no generic advice, no obvious info.

---

## Subdirectory AGENTS.md

- 30-80 lines max
- NEVER repeat parent content
- Sections: OVERVIEW (1 line), STRUCTURE (if >5 subdirs), WHERE TO LOOK, CONVENTIONS (if different), ANTI-PATTERNS

---

## Anti-Patterns

- **Static agent count** - MUST vary based on project size/depth
- **Sequential execution** - MUST parallel where possible
- **Ignoring existing** - ALWAYS read existing first
- **Over-documenting** - Not every dir needs AGENTS.md
- **Redundancy** - Child never repeats parent
- **Generic content** - Remove anything applying to ALL projects
- **Verbose style** - Telegraphic or die
