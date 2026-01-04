# Improvement Patterns

Maps observed problems to skill fixes.

## Navigation Problems

### Repeated file reads
**Causes:** Info buried, unclear headers, missing TOC
**Fixes:**
- Add TOC to files >100 lines
- Use descriptive headers matching common queries
- Extract frequently-needed info to Quick Reference

### Reading unreferenced files
**Causes:** Incomplete SKILL.md overview, poor file naming
**Fixes:**
- Audit bundled files; ensure SKILL.md references each
- Add explicit "See [file] for X" directives
- Rename files to reflect content

### Searching codebase for skill-domain info
**Causes:** Missing domain knowledge, incomplete references
**Fixes:**
- Add missing domain info to references/
- Expand description with trigger terms

## Script/Execution Problems

### Dependency errors
**Causes:** Missing requirements.txt, undocumented system deps
**Fixes:**
- Create/update requirements.txt
- Add compatibility field to frontmatter
- Document system deps in prerequisites

### Incorrect script invocation
**Causes:** Unclear usage docs, missing examples
**Fixes:**
- Add usage section with exact invocation
- Provide input/output examples
- Show common invocation patterns

### Agent rewrites existing script functionality
**Causes:** Script existence/capability unclear
**Fixes:**
- Add "Available Scripts" section mapping tasks→scripts
- Rename scripts to reflect action: `extract_text.py` not `util.py`
- In workflow, explicitly state "Run scripts/X.py"

## Workflow Problems

### Skipped steps
**Causes:** Steps seem optional, no validation catches skips
**Fixes:**
- Mark required steps explicitly
- Add checklist format
- Add validation that fails if steps skipped

### Wrong step order
**Causes:** Dependencies unclear, structure ambiguous
**Fixes:**
- Number steps explicitly
- Add "Requires: Step N complete" notes
- Group parallel-safe operations

### Ad-hoc workflow created
**Causes:** Skill workflow doesn't match task, too rigid
**Fixes:**
- Add workflow variants for common cases
- Use decision trees for branching
- Loosen constraints where appropriate

## Knowledge Gap Problems

### Agent asks user for domain info
**Causes:** Info missing or unfindable
**Fixes:**
- Add missing info to references/
- Improve discoverability (headers, TOC)

### Wrong terminology
**Causes:** Inconsistent terms, undefined domain terms
**Fixes:**
- Audit for terminology consistency
- Add glossary if domain-heavy
- Pick one term, use throughout

### Wrong domain assumptions
**Causes:** Implicit knowledge undocumented
**Fixes:**
- Document assumptions explicitly
- Add edge case section
- State "obvious" rules

## Trigger Problems

### Skill triggers when it shouldn't
**Causes:** Description too broad, name generic
**Fixes:**
- Narrow description to specific triggers
- Add "When NOT to use" section

### Skill doesn't trigger when it should
**Causes:** Description missing key terms
**Fixes:**
- Add trigger phrases to description
- Include common user phrasings

## Priority Matrix

| Problem | User Impact | Fix Complexity | Priority |
|---------|-------------|----------------|----------|
| Script dependency failure | High | Low | P0 |
| Missing domain knowledge | High | Medium | P0 |
| Workflow step skipping | High | Low | P1 |
| Navigation confusion | Medium | Medium | P1 |
| Terminology mismatch | Medium | Low | P2 |
| Trigger accuracy | Variable | Low | P2 |

## Report Template

```markdown
## Findings

**Skill:** [name]
**Signals observed:** [list]
**Primary category:** [Navigation/Execution/Workflow/Knowledge/Trigger]

## Recommendations

### P0 (Critical)
1. [Change]: [Rationale]

### P1 (High)
1. [Change]: [Rationale]

### P2 (Medium)
1. [Change]: [Rationale]
```
