# Analysis Signals

Signals indicating skill deficiencies. Categorized by severity and source.

## Agent Struggle Signals

### Navigation Confusion
- Repeated reads of same skill files
- Reading files not referenced in SKILL.md
- Searching codebase for info skill should provide
- Backtracking: "Let me re-read..." / "Actually, I should check..."
- Wrong tool selection for task

### Execution Failures
- Script errors (missing deps, wrong args, bad paths)
- Retry loops on same operation
- Falling back to manual implementation when script exists
- Generating code that duplicates bundled scripts

### Knowledge Gaps
- Agent asks user for info skill should provide
- Wrong assumptions about domain specifics
- Missing edge case handling
- Incorrect terminology
- Hallucinating APIs/methods not in references

### Workflow Deviation
- Skipping documented steps
- Executing steps out of order
- Missing validation/verification steps
- Creating ad-hoc workflows instead of following skill's

## User Frustration Signals

### Correction Patterns
- "No, I meant..." / "That's not what I asked"
- "You already tried that"
- "Read the file again"
- Providing same info repeatedly
- Explicit redirection: "Stop and do X instead"

### Clarification Requests
- "What do you mean by...?"
- "Which file?" / "Can you be more specific?"
- User providing context skill should contain

### Abandonment Indicators
- "Nevermind, I'll do it manually"
- "Let's try a different approach"
- "Forget the skill, just..."
- Task left incomplete

### Tone Shifts
- Terse responses after detailed ones
- Increased imperatives: "Just do X"
- Explicit frustration: "This isn't working"
- Repeated emphasis/capitalization

## Pattern Severity

### Healthy (no action)
- Linear workflow progress
- Single read per skill file
- User confirms at checkpoints
- Successful script executions

### Warning (consider review)
- 2-3 re-reads of same file
- Minor user corrections
- One script retry
- Questions about ambiguous instructions

### Critical (review required)
- 4+ re-reads / circular navigation
- User takes control
- Multiple script failures
- Complete workflow deviation
- Explicit user frustration

## Signal Weights

| Signal | Weight |
|--------|--------|
| User abandonment | Critical |
| Explicit frustration | High |
| Workflow deviation | High |
| Script failures | Medium-High |
| Navigation confusion | Medium |
| Minor corrections | Low |

## Data Collection

Extract from conversation:
1. Skill files accessed (which, how many times, order)
2. Script invocations (success/failure, errors)
3. User interventions (count, type, tone)
4. Workflow adherence (followed/skipped/added steps)
5. Final outcome (success/partial/abandoned)
