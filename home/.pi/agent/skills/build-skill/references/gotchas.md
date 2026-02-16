# Common Mistakes

Issues, causes, and fixes for skill creation.

## Frontmatter Errors

| Error | Fix |
|-------|-----|
| No opening `---` | Must start at line 1 |
| Blank lines before `---` | Frontmatter must be first |
| No closing `---` | Add `---` after fields |
| XML tags `<description>` | Use YAML only |

## Name Field Errors

| Error | Bad | Good |
|-------|-----|------|
| Uppercase | `My-Skill` | `my-skill` |
| Underscores | `my_skill` | `my-skill` |
| Leading hyphen | `-my-skill` | `my-skill` |
| Trailing hyphen | `my-skill-` | `my-skill` |
| Double hyphens | `my--skill` | `my-skill` |
| Dir mismatch | Dir: `foo/`, name: `bar` | Match both |

**Valid pattern:** `^[a-z0-9]+(-[a-z0-9]+)*$`

## Description Errors

| Error | Bad | Good |
|-------|-----|------|
| Too vague | "Helps with files" | "Extract text from PDFs" |
| First person | "I help with PDFs" | "Extracts text from PDFs" |
| No trigger | "PDF tool" | "PDF tool. Use when working with PDFs." |

## Structure Errors

| Error | Fix |
|-------|-----|
| SKILL.md > 500 lines | Split to references/ |
| Duplicated content | Link, don't copy |
| Broken links | Verify paths exist |

## Script Errors

| Error | Fix |
|-------|-----|
| No shebang | Add `#!/usr/bin/env bash` |
| Silent failures | Add error handling |
| Hardcoded paths | Use relative paths |

## Validation Quick Reference

| Error Message | Fix |
|---------------|-----|
| "No frontmatter" | Add `---` at line 1 |
| "Missing name" | Add `name:` field |
| "Invalid name format" | Use lowercase-hyphens |
| "Name mismatch" | Match dir and name |
| "Missing description" | Add `description:` |
| "Description too short" | 50+ chars recommended |
| "File too large" | Split to references/ |
| "Broken link" | Fix path or create file |

## Context Rot Symptoms

| Symptom | Fix |
|---------|-----|
| Agent ignores instructions | Reduce SKILL.md size |
| Wrong file accessed | Add decision trees |
| Repeated questions | Improve cross-refs |
| Slow responses | Split to multi-file |

## See Also

- [frontmatter.md](./frontmatter.md) - YAML spec
- [anatomy.md](./anatomy.md) - Directory structures
