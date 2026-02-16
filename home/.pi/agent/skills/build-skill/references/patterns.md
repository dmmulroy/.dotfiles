# Real-World Skill Patterns

Concrete patterns with examples.

## Pattern 1: Workflow-Based

For sequential, multi-step processes.

```
release-manager/
├── SKILL.md
└── references/changelog-format.md
```

**Example frontmatter:**
```yaml
name: release-manager
description: Create releases with changelogs. Use when preparing release or bumping versions.
```

**Key sections:** Numbered steps, decision tables, checklists.

**When to use:** Clear step order, steps depend on previous steps.

## Pattern 2: Task-Based

For tool collections with independent operations.

```
pdf-processor/
├── SKILL.md
└── scripts/
    ├── extract_text.sh
    └── merge_pdfs.sh
```

**Example frontmatter:**
```yaml
name: pdf-processor
description: Extract, merge, split PDF files. Use when working with PDFs.
```

**Key sections:** Operation catalog, command reference, script index.

**When to use:** Independent operations, no required order.

## Pattern 3: Reference/Guidelines

For standards, specs, policies.

```
code-standards/
├── SKILL.md
└── references/
    ├── naming.md
    └── testing.md
```

**Example frontmatter:**
```yaml
name: code-standards
description: Team coding standards. Use when writing code or reviewing PRs.
```

**Key sections:** Quick reference tables, links to detailed docs.

**When to use:** Established standards, consistency enforcement.

## Pattern 4: Platform 

For large platforms with many products.

```
cloud-platform/
├── SKILL.md
└── references/
    ├── compute/
    │   ├── README.md
    │   └── api.md
    └── storage/
        └── README.md
```

**Example frontmatter:**
```yaml
name: cloud-platform
description: Cloud platform APIs. Use for deployments or infrastructure.
```

**Key sections:** Decision trees, product index, reading order tables.

**When to use:** 5+ products, different products for different tasks.

## Pattern 5: Integration

For API wrappers and external services.

```
github-automation/
├── SKILL.md
└── references/api.md
```

**Example frontmatter:**
```yaml
name: github-automation
description: GitHub operations via gh CLI. Use for PRs, issues, releases.
```

**Key sections:** Common operations, API reference link, MCP tool notes.

**When to use:** External service integration, CLI wrapper docs.

## Combining Patterns

Most skills combine patterns:

```
deployment-pipeline/            # Workflow + Integration
├── SKILL.md                    # Workflow steps
├── references/github-api.md    # Integration reference
└── scripts/deploy.sh           # Task automation
```

## Pattern Selection

| Need | Pattern |
|------|---------|
| Step-by-step process | Workflow |
| Multiple operations | Task-based |
| Standards/rules | Reference |
| Many products | Platform |
| External service | Integration |

## See Also

- [anatomy.md](./anatomy.md) - Directory structures
- [progressive-disclosure.md](./progressive-disclosure.md) - Token management
