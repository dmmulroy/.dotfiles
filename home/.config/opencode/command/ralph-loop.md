---
description: Start Ralph Wiggum loop - iterative development until completion
---

# Ralph Loop

You are starting a **Ralph Wiggum loop** - a self-referential development loop where you work on the same task repeatedly until completion.

## How It Works

1. You work on the task
2. When you try to stop, the Stop hook feeds the SAME PROMPT back
3. You see your previous work in files and git history
4. Loop continues until you output the completion promise or hit max iterations

## Arguments

Parse these arguments: `$ARGUMENTS`

Format: `"<prompt>" [--max-iterations N] [--completion-promise "TEXT"]`

Defaults:
- `--max-iterations`: 0 (unlimited)
- `--completion-promise`: "DONE"

## Your Task

1. Parse the arguments above
2. Create the state file at `.opencode/ralph-loop.local.md` with this format:

```markdown
---
active: true
iteration: 1
max_iterations: <N or 0>
completion_promise: "<TEXT>"
started_at: "<ISO timestamp>"
---

<the prompt/task>
```

3. Confirm the loop is started
4. Begin working on the task immediately
5. When FULLY complete, output: `<promise>COMPLETION_TEXT</promise>`

## Critical Rules

- The promise text inside `<promise>` tags must be EXACTLY what was set
- Do NOT output a false promise to escape - only when the task is TRULY done
- Each iteration should make meaningful progress
- If stuck, try different approaches
- The loop is designed to continue until genuine completion

## Stopping

- Output `<promise>YOUR_PROMISE</promise>` when task is complete
- User runs `/cancel-ralph`
- Max iterations reached (if set)
