---
description: Start Ralph coding loop
---

Start Ralph to complete user stories from a PRD file.

Ralph runs in the current session, continuing until all stories pass or max iterations.

Workflow per iteration:
1. Pick highest-priority incomplete story
2. Implement it
3. Run typecheck + tests
4. Commit (git/jj auto-detected)
5. Mark story done in prd.json
6. Log to progress.txt
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
