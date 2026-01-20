---
name: librarian
description: Multi-repository codebase exploration. Research library internals, find code patterns, understand architecture, compare implementations across GitHub/npm/PyPI/crates. Use when needing deep understanding of how libraries work, finding implementations across open source, or exploring remote repository structure.
references:
  - references/tool-routing.md
  - references/opensrc-api.md
  - references/opensrc-examples.md
  - references/linking.md
  - references/diagrams.md
---

# Librarian Skill

Deep codebase exploration across remote repositories.

## How to Use This Skill

### Reference Structure

| File | Purpose | When to Read |
|------|---------|--------------|
| `tool-routing.md` | Tool selection decision trees | **Always read first** |
| `opensrc-api.md` | API reference, types | Writing opensrc code |
| `opensrc-examples.md` | JavaScript patterns, workflows | Implementation examples |
| `linking.md` | GitHub URL patterns | Formatting responses |
| `diagrams.md` | Mermaid patterns | Visualizing architecture |

### Reading Order

1. **Start** with `tool-routing.md` → choose tool strategy
2. **If using opensrc:**
   - Read `opensrc-api.md` for API details
   - Read `opensrc-examples.md` for patterns
3. **Before responding:** `linking.md` + `diagrams.md` for output formatting

## Tool Arsenal

| Tool | Best For | Limitations |
|------|----------|-------------|
| **grep_app** | Find patterns across ALL public GitHub | Literal search only |
| **context7** | Library docs, API examples, usage | Known libraries only |
| **opensrc** | Fetch full source for deep exploration | Must fetch before read |

## Quick Decision Trees

### "How does X work?"

```
Known library?
├─ Yes → context7.resolve-library-id → context7.query-docs
│        └─ Need internals? → opensrc.fetch → read source
└─ No  → grep_app search → opensrc.fetch top result
```

### "Find pattern X"

```
Specific repo?
├─ Yes → opensrc.fetch → opensrc.grep → read matches
└─ No  → grep_app (broad) → opensrc.fetch interesting repos
```

### "Explore repo structure"

```
1. opensrc.fetch(target)
2. opensrc.tree(source.name) → quick overview
3. opensrc.files(source.name, "**/*.ts") → detailed listing
4. Read: README, package.json, src/index.*
5. Create architecture diagram (see diagrams.md)
```

### "Compare X vs Y"

```
1. opensrc.fetch(["X", "Y"])
2. Use source.name from results for subsequent calls
3. opensrc.grep(pattern, { sources: [nameX, nameY] })
4. Read comparable files, synthesize differences
```

## Critical: Source Naming Convention

**After fetching, always use `source.name` for subsequent calls:**

```javascript
const [{ source }] = await opensrc.fetch("vercel/ai");
const files = await opensrc.files(source.name, "**/*.ts");
```

| Type | Fetch Spec | Source Name |
|------|------------|-------------|
| npm | `"zod"` | `"zod"` |
| npm scoped | `"@tanstack/react-query"` | `"@tanstack/react-query"` |
| pypi | `"pypi:requests"` | `"requests"` |
| crates | `"crates:serde"` | `"serde"` |
| GitHub | `"vercel/ai"` | `"github.com/vercel/ai"` |
| GitLab | `"gitlab:org/repo"` | `"gitlab.com/org/repo"` |

## When NOT to Use opensrc

| Scenario | Use Instead |
|----------|-------------|
| Simple library API questions | context7 |
| Finding examples across many repos | grep_app |
| Very large monorepos (>10GB) | Clone locally |
| Private repositories | Direct access |

## Output Guidelines

1. **Comprehensive final message** - only last message returns to main agent
2. **Parallel tool calls** - maximize efficiency
3. **Link every file reference** - see `linking.md`
4. **Diagram complex relationships** - see `diagrams.md`
5. **Never mention tool names** - say "I'll search" not "I'll use opensrc"

## References

- [Tool Routing Decision Trees](references/tool-routing.md)
- [opensrc API Reference](references/opensrc-api.md)
- [opensrc Code Examples](references/opensrc-examples.md)
- [GitHub Linking Patterns](references/linking.md)
- [Mermaid Diagram Patterns](references/diagrams.md)
