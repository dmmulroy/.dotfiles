---
description: Convert an existing PRD to Ralph-executable JSON format
---

Convert a markdown PRD to Ralph's JSON format for autonomous execution.

**Requires:** An existing PRD name (e.g., `favorites` for `tasks/prd-favorites.md`)

First, invoke the skill tool to load the ralph-prd skill:

```
skill({ name: 'ralph-prd' })
```

Then follow the skill instructions to convert the specified PRD.

<user-request>
$ARGUMENTS
</user-request>
