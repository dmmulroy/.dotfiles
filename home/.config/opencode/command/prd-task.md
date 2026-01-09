---
description: Convert an existing PRD to executable JSON format for task completion
---

Convert a markdown PRD to JSON format for autonomous task execution.

**Requires:** An existing PRD name (e.g., `favorites` for `prd-favorites.md`)

First, invoke the skill tool to load the prd-task skill:

```
skill({ name: 'prd-task' })
```

Then follow the skill instructions to convert the specified PRD.

<user-request>
$ARGUMENTS
</user-request>
