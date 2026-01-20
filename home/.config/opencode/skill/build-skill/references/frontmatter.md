# YAML Frontmatter Specification

Every SKILL.md must begin with YAML frontmatter.

## Required Format

```yaml
---
name: skill-name
description: What this skill does and when to use it.
---
```

**Critical:** Frontmatter must start at line 1. No blank lines before `---`.

## Required Fields

### name

| Constraint | Value |
|------------|-------|
| Required | Yes |
| Max length | 64 characters |
| Pattern | `^[a-z0-9]+(-[a-z0-9]+)*$` |
| Must match | Directory name |

**Rules:**
- Lowercase letters, numbers, hyphens only
- Cannot start or end with hyphen
- No consecutive hyphens (`--`)
- Must match parent directory name

**Naming conventions:**

| Style | Example | When to Use |
|-------|---------|-------------|
| Gerund (recommended) | `processing-pdfs` | Actions/capabilities |
| Noun phrase | `pdf-processor` | Tool/utility |
| Domain-specific | `cloudflare` | Platform skills |

**Good names:**
- `analyzing-data`
- `managing-releases`
- `code-review`
- `bigquery-analytics`

**Bad names:**
- `helper` (too vague)
- `utils` (meaningless)
- `MySkill` (uppercase)
- `pdf_processor` (underscores)

### description

| Constraint | Value |
|------------|-------|
| Required | Yes |
| Max length | 1024 characters |
| Min recommended | 50 characters |

**Rules:**
- Write in third person ("Processes files" not "I process files")
- Include WHAT the skill does
- Include WHEN to use it (activation triggers)
- Be specific with key terms

**Good descriptions:**

```yaml
# PDF skill
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or asked to read/edit PDFs.

# BigQuery skill  
description: Query BigQuery datasets using SQL. Use for data analytics, reports, or Google Cloud data warehouse tasks.

# Code review skill
description: Review pull requests for quality, security, and test coverage. Use when asked to review a PR or diff.
```

**Bad descriptions:**

```yaml
description: Helps with files          # Too vague
description: I can help you with data  # Wrong POV
description: PDF tool                  # No trigger context
description: Useful utility            # Meaningless
```

## Optional Fields

### license

```yaml
license: Apache-2.0
# or
license: See LICENSE.txt
```

### compatibility

```yaml
compatibility: Requires git, docker, and jq installed. macOS/Linux only.
```

Max 500 characters. Document environment requirements.

### metadata

```yaml
metadata:
  author: dmmulroy
  version: "1.0"
  team: platform
```

String-to-string map. Arbitrary key-value pairs.

### references (OpenCode-specific)

```yaml
references:
  - references/api.md
  - references/schemas.md
```

Hints for pre-loading. Agent may use these to proactively load files.

## Complete Example

```yaml
---
name: release-manager
description: Create releases with changelogs, version bumps, and git tags. Use when preparing a release, generating changelog, or bumping version numbers.
license: MIT
compatibility: Requires git and gh CLI
metadata:
  author: dmmulroy
  version: "2.0"
references:
  - references/changelog-format.md
  - references/versioning.md
---

# Release Manager

Instructions here...
```

## Validation Checklist

| Check | Requirement |
|-------|-------------|
| Starts with `---` | Line 1, no preceding blank lines |
| Has `name:` | Required |
| Name format | Lowercase, hyphens, no `--`, no leading/trailing `-` |
| Name matches dir | `my-skill/SKILL.md` has `name: my-skill` |
| Has `description:` | Required |
| Description quality | 50+ chars, third person, includes triggers |
| Closes with `---` | Required |
| No XML tags | `<purpose>`, `<refs>` invalid |

## See Also

- [anatomy.md](./anatomy.md) - Directory structures
- [gotchas.md](./gotchas.md) - Common frontmatter errors
