---
description: Start Ralph coding loop
---

Start Ralph to complete features from a PRD file.

Ralph runs in the current session, continuing until all features pass or max iterations.

ONLY WORK ON A SINGLE FEATURE PER ITERATION.

Workflow per iteration:
1. Find highest-priority incomplete feature (YOU decide priority, not necessarily first in list)
2. Implement it
3. Run format, lint, typecheck + tests
4. Update PRD with work done
5. APPEND progress to progress.txt (leave note for next person working in codebase - do NOT overwrite)
6. Make a commit (git/jj auto-detected)
7. Continue or output `<promise>COMPLETE</promise>`

Usage: /ralph @path/to/prd.json [max-iterations]

Arguments:
- prd.json path (required) - use @ to reference file
- max-iterations (optional, default: 25)

Control:
- /ralph-status - check progress
- /ralph-stop - stop after current iteration

State persisted to `.opencode/state/ralph.json`.
Retries up to 3 errors per loop before stopping.

PRD Schema:
```json
{
  "branchName": "ralph/my-feature",
  "userStories": [
    {
      "category": "ui",
      "description": "Add login form component",
      "steps": ["Create component", "Add validation", "typecheck passes"],
      "passes": false
    }
  ]
}
```

$ARGUMENTS
