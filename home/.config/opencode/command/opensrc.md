---
description: Clone a repo and enhance with AGENTS.md knowledge base
---

Clone a repository using opensrc and generate hierarchical AGENTS.md documentation.

## Workflow

### Step 1: Load opensrc skill

```
skill({ name: 'opensrc' })
```

### Step 2: Clone the repository

```bash
npx opensrc <repo>
```

Where `<repo>` is extracted from the user request (supports `owner/repo`, `github:owner/repo`, full URL, etc.)

### Step 3: Navigate to cloned repo

After clone completes, cd into the repo:

```bash
cd opensrc/repos/github.com/<owner>/<repo>/
```

Parse owner/repo from the input or from `opensrc/sources.json` after clone.

### Step 4: Load index-knowledge skill

```
skill({ name: 'index-knowledge' })
```

Execute in **update mode** (default) - modify existing AGENTS.md + create new where warranted.

### Step 5: Report completion

```
=== opensrc Complete ===

Repository: <owner>/<repo>
Location: opensrc/repos/github.com/<owner>/<repo>/

AGENTS.md files generated:
  ✓ ./AGENTS.md (root)
  ✓ ./src/... (if applicable)

The repository is now enhanced with agent context.
```

<user-request>
$ARGUMENTS
</user-request>
