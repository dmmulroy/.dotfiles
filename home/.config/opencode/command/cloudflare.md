---
description: Load Cloudflare skill and get contextual guidance for your task
---

Load the Cloudflare platform skill and help with any Cloudflare development task.

## Workflow

### Step 1: Check for --update-skill flag

If $ARGUMENTS contains `--update-skill`:

1. Determine install location by checking which exists:
   - Local: `.opencode/skill/cloudflare/`
   - Global: `~/.config/opencode/skill/cloudflare/`

2. Run the appropriate install command:
   ```bash
   # For local installation
   curl -fsSL https://raw.githubusercontent.com/dmmulroy/cloudflare-skill/main/install.sh | bash

   # For global installation
   curl -fsSL https://raw.githubusercontent.com/dmmulroy/cloudflare-skill/main/install.sh | bash -s -- --global
   ```

3. Output success message and stop (do not continue to other steps).

### Step 2: Load cloudflare skill

```
skill({ name: 'cloudflare' })
```

### Step 3: Identify task type from user request

Analyze $ARGUMENTS to determine:
- **Product(s) needed** (Workers, D1, R2, Durable Objects, etc.)
- **Task type** (new project setup, feature implementation, debugging, config)

Use decision trees in SKILL.md to select correct product.

### Step 4: Read relevant reference files

Based on task type, read from `references/<product>/`:

| Task | Files to Read |
|------|---------------|
| New project | `README.md` + `configuration.md` |
| Implement feature | `README.md` + `api.md` + `patterns.md` |
| Debug/troubleshoot | `gotchas.md` |
| All-in-one (monolithic) | `SKILL.md` |

### Step 5: Execute task

Apply Cloudflare-specific patterns and APIs from references to complete the user's request.

### Step 6: Summarize

```
=== Cloudflare Task Complete ===

Product(s): <products used>
Files referenced: <reference files consulted>

<brief summary of what was done>
```

<user-request>
$ARGUMENTS
</user-request>
