---
name: reviewing-skills
description: Analyze conversation history after skill usage to identify deficiencies and recommend improvements. This skill should be used when a user asks to review how a skill performed, when the agent struggled or got lost during skill execution, when the user expresses frustration with a skill, or to audit skill effectiveness after completing a task.
---

# Reviewing Skills

Analyze agent-skill interactions to identify deficiencies and recommend targeted improvements.

## When to Use

- After completing a task using another skill
- When user asks "review that skill" or "what went wrong"
- When noticeable struggle occurred during skill execution
- For periodic skill quality audits

## Review Workflow

### Step 1: Identify Target Skill

Determine which skill to review:
- Explicit: User names the skill
- Implicit: Most recently loaded skill in conversation
- Ask if ambiguous

### Step 2: Read Skill Materials

Load the target skill's files:
1. Read `SKILL.md` - understand intended workflow
2. Read files in `references/` - understand available knowledge
3. Note `scripts/` contents - understand available tooling

### Step 3: Analyze Conversation

Scan conversation for signals. See [analysis-signals.md](references/analysis-signals.md) for complete catalogue.

Key questions:
- Did agent follow the skill's workflow?
- How many times were skill files re-read?
- Did user provide corrections or show frustration?
- Did scripts execute successfully?
- Was task completed successfully?

### Step 4: Categorize Problems

Map signals to problem categories:

| Category | Typical Signals |
|----------|-----------------|
| Navigation | Repeated file reads, searching outside skill |
| Execution | Script failures, wrong invocations |
| Workflow | Skipped steps, wrong order, ad-hoc approach |
| Knowledge | Asked user for info, wrong assumptions |
| Trigger | Skill activated inappropriately |

### Step 5: Generate Recommendations

See [improvement-patterns.md](references/improvement-patterns.md) for problem→fix mappings.

Prioritize by:
- P0: Blocking issues (script failures, missing critical info)
- P1: Major friction (workflow confusion, navigation issues)
- P2: Polish (terminology, trigger refinement)

### Step 6: Report Findings

Output structured report:

```markdown
## Skill Review: [name]

### Signals Observed
- [Signal 1]
- [Signal 2]

### Root Causes
- [Category]: [Explanation]

### Recommendations

#### P0 (Critical)
1. [Specific change to specific file]

#### P1 (High)  
1. [Specific change]

#### P2 (Medium)
1. [Specific change]

### Suggested Validation
- [How to test the fix worked]
```

## Quick Review Checklist

For fast assessment without full analysis:

- [ ] Skill files read only once each?
- [ ] Workflow followed in order?
- [ ] No user corrections needed?
- [ ] Scripts executed successfully?
- [ ] Task completed without abandonment?

All checked = skill performed well. Any unchecked = investigate further.

## References

- [Analysis Signals](references/analysis-signals.md) - Signal catalogue and severity
- [Improvement Patterns](references/improvement-patterns.md) - Problem→fix mappings
