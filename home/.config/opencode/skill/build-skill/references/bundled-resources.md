# Bundled Resources

Guide to scripts/, references/, and assets/ directories.

## Resource Type Decision

```
What kind of content?
├─ Executable code → scripts/
├─ Documentation for agent → references/
└─ Files for output → assets/
```

## scripts/

Executable code the agent runs directly.

**When to include:**
- Same code rewritten repeatedly
- Deterministic operations needed
- Complex validation logic

**Best practices:**
```bash
#!/usr/bin/env bash
set -euo pipefail

# Handle errors
if [[ ! -f "$1" ]]; then
    echo "Error: File not found: $1" >&2
    exit 1
fi
```

**Execution vs reading:**
- "Run `scripts/validate.sh`" → execute
- "See `scripts/validate.sh` for logic" → read

## references/

Documentation loaded into agent context.

**When to include:**
- Domain knowledge model lacks
- API documentation
- Database schemas
- Detailed workflow guides

**Structure each file:**
```markdown
# Title

Brief overview.

## Contents
- Section 1
- Section 2

## Section 1
...
```

**Size limit:** Target 100-150 lines, max 200.

## assets/

Files used in output, not loaded into context.

**When to include:**
- Templates (`.yaml`, `.json`)
- Images (logos, diagrams)
- Boilerplate code

**Organization:**
```
assets/
├── templates/config.yaml
├── images/logo.png
└── boilerplate/project/
```

Agent copies/uses files without loading into context.

## Comparison

| Directory | Purpose | Token Cost | Agent Action |
|-----------|---------|------------|--------------|
| scripts/ | Automation | Zero | Execute |
| references/ | Documentation | When read | Read |
| assets/ | Output files | Zero | Copy/use |

## Not Supported in OpenCode

| Feature | Status |
|---------|--------|
| `toolbox/` protocol | Not supported |
| `mcp.json` bundling | Not supported |
| Per-skill MCP | Use global opencode.json |

## See Also

- [anatomy.md](./anatomy.md) - Directory structures
- [patterns.md](./patterns.md) - Real skill patterns
