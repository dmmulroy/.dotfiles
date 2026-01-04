---
name: rfc-spec
description: Generate RFC specification documents for staff/principal engineer review based on local VCS changes. Analyzes staged/unstaged changes in jj or git, proposes architectural decisions, and produces structured RFCs with motivation, design, trade-offs, and migration sections.
---

# RFC Specification Generator

Generate RFC documents for technical review based on local version control changes. Supports both Jujutsu (jj) and Git workflows.

## When to Use

- Before submitting significant changes for code review
- When changes touch multiple modules or introduce new abstractions
- For architectural decisions that need documented rationale
- When proposing API changes that affect downstream consumers

## Process

### 1. Detect VCS and Gather Changes

First, detect which VCS is in use and collect the diff:

```bash
# Try jj first (preferred)
if jj root 2>/dev/null; then
  # Get working copy changes
  jj diff
  # Get commit message if any
  jj log -r @ --no-graph -T 'description'
else
  # Fall back to git
  git diff HEAD
  git diff --cached
  git log -1 --format='%B' 2>/dev/null || true
fi
```

### 2. Analyze Change Scope

Categorize the changes:

| Change Type | RFC Section Focus |
|-------------|-------------------|
| New module/crate | Architecture, API surface, integration points |
| Refactor | Motivation (what was wrong), migration path |
| Bug fix with architectural implications | Root cause, why fix is correct, alternatives |
| Performance optimization | Benchmarks, trade-offs, complexity cost |
| Dependency changes | Security, licensing, maintenance burden |

### 3. Generate RFC Structure

Use this template, adapting sections based on change scope:

```markdown
# RFC: [Title derived from change intent]

**Status:** Proposed
**Author:** [From git/jj config]
**Date:** [Today]
**Scope:** [Affected paths/modules]

---

## Summary

[1-2 sentences: what this RFC proposes]

---

## Motivation

### Problem Statement

[What's wrong with the current state? Be specific.]

### Goals

- [Bulleted list of what this achieves]

### Non-Goals

- [What this explicitly does NOT address]

---

## Design

### [Core Abstraction Name]

[Describe the central concept. Include type definitions if applicable.]

```rust
// Key types or interfaces
```

### [Implementation Approach]

[How does it work? Diagrams welcome.]

### [Integration Points]

[How does this connect to existing code?]

---

## Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file` | +N / ~M / -D | Brief description |

**Total:** ~X lines changed

---

## Trade-offs and Alternatives

### Alternative: [Name]

[Description]

**Rejected:** [Why]

### Trade-off: [Name]

[What we're giving up and why it's acceptable]

---

## Testing Strategy

| Test Type | Location | Validates |
|-----------|----------|-----------|
| Unit | `tests/unit_*.rs` | [What] |
| Integration | `tests/integration_*.rs` | [What] |

---

## Migration & Compatibility

### API Changes

| Before | After |
|--------|-------|
| `old_api()` | `new_api()` |

### Breaking Changes

[None / List with migration guidance]

---

## Security Considerations

[None if purely internal. Otherwise: new inputs, auth changes, etc.]

---

## Open Questions

1. [Question needing reviewer input]
2. [Decision that could go either way]

---

## Conclusion

[2-3 sentences summarizing value proposition]
```

## Section Guidelines

### Summary
- One paragraph max
- State the "what" not the "why"
- Include scope indicator (files/modules affected)

### Motivation
- Lead with pain point, not solution
- Include concrete examples of current behavior
- Quantify if possible (error rates, lines of code, etc.)

### Design
- Show types/interfaces before prose
- Use tables for mappings and state transitions
- Diagrams for data flow or architecture
- Code blocks for non-obvious syntax

### Trade-offs
- Name each alternative explicitly
- State rejection reason in one sentence
- Acknowledge what you're giving up

### Testing
- Map test types to what they validate
- Include commands to run tests
- Note any manual verification needed

### Open Questions
- Frame as decisions, not uncertainties
- Suggest default if you have a preference
- Keep to 3-5 max; more indicates design isn't ready

## Style Conventions

**Be concise:**
- Sacrifice grammar for brevity
- Use tables over prose for structured data
- One idea per sentence

**Be precise:**
- Reference specific files with line numbers
- Use exact type names and function signatures  
- Quantify changes (lines added/removed/modified)

**Be honest:**
- Acknowledge complexity costs
- State what you're NOT solving
- Flag genuine uncertainties as open questions

## Output Location

Write RFC to: `docs/rfcs/YYYYMMDD-rfc-[slug].md`

Where `[slug]` is a lowercase-hyphenated summary (3-5 words max).

## Example Invocation

After making changes:

```
/rfc-spec
```

Or with specific scope:

```
Generate an RFC for the changes in src/submit/
```
