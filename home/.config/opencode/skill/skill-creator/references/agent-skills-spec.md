# Agent Skills Specification

Complete format spec for Agent Skills.

## Directory Structure

Minimum: `skill-name/SKILL.md`

Optional: `scripts/`, `references/`, `assets/`

## SKILL.md Format

YAML frontmatter + Markdown content.

### Frontmatter

Required:
```yaml
---
name: skill-name
description: What skill does and when to use it.
---
```

Optional fields:
```yaml
---
name: pdf-processing
description: Extract text/tables from PDFs, fill forms, merge docs.
license: Apache-2.0
compatibility: Requires git, docker, jq
metadata:
  author: example-org
  version: "1.0"
allowed-tools: Bash(git:*) Read
---
```

### Field Constraints

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | 1-64 chars, lowercase alphanumeric + hyphens, no start/end hyphen, no `--`, must match parent dir |
| `description` | Yes | 1-1024 chars, describe what + when |
| `license` | No | License name or ref to bundled file |
| `compatibility` | No | 1-500 chars, env requirements |
| `metadata` | No | Arbitrary key-value pairs |
| `allowed-tools` | No | Space-delimited pre-approved tools (experimental) |

### Name Validation

Valid: `pdf-processing`, `data-analysis`, `code-review`

Invalid: `PDF-Processing` (uppercase), `-pdf` (starts hyphen), `pdf--processing` (consecutive hyphens)

### Body Content

No format restrictions. Recommended sections:
- Step-by-step instructions
- Input/output examples
- Edge cases

## Optional Directories

### scripts/

Executable code. Should be:
- Self-contained or document dependencies
- Include helpful error messages
- Handle edge cases

### references/

Additional docs loaded on demand:
- `REFERENCE.md` - Technical reference
- Domain-specific files (`finance.md`, etc.)

Keep files focused for efficient context use.

### assets/

Static resources:
- Templates (docs, configs)
- Images (diagrams, examples)
- Data files (schemas, lookup tables)

## Progressive Disclosure

Token-efficient loading:

1. **Metadata** (~100 tokens): `name` + `description` loaded at startup for all skills
2. **Instructions** (<5000 tokens): Full `SKILL.md` body on activation
3. **Resources** (as needed): Files loaded only when required

Target: `SKILL.md` under 500 lines. Move detailed refs to separate files.

## File References

Use relative paths from skill root:

```markdown
See [reference guide](references/REFERENCE.md) for details.
Run: scripts/extract.py
```

Keep refs one level deep. Avoid nested reference chains.

## Validation

```bash
skills-ref validate ./my-skill
```

Checks frontmatter validity and naming conventions.
