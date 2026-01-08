---
description: Stop Ralph loop
---

Stop the active Ralph loop for a branch after the current iteration completes.

Usage: /ralph-stop <branch>

Arguments:
- branch (required) - branch name to stop

The loop will not inject continuation prompts after stopping.
State file is preserved at `.opencode/state/ralph/<branch>/state.json` for inspection.

$ARGUMENTS
