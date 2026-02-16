# Technical Debt

## Debt Categories

| Type | Example | Urgency |
|------|---------|---------|
| **Deliberate-Prudent** | "Ship now, refactor next sprint" | Planned paydown |
| **Deliberate-Reckless** | "We don't have time for tests" | Accumulating risk |
| **Inadvertent-Prudent** | "Now we know a better way" | Normal learning |
| **Inadvertent-Reckless** | "What's layering?" | Learning curve |

## When to Pay Down Debt

**Pay now when:**
- Debt is in path of upcoming work
- Cognitive load slowing every change
- Bugs recurring in same area
- Onboarding time increasing

**Defer when:**
- Area is stable, rarely touched
- Bigger refactor coming anyway
- Time constrained on priority work
- Code may be deprecated

## ROI Framework

```
Debt ROI = (Time Saved Per Touch × Touches/Month × Months) / Paydown Cost
```

| ROI | Action |
|-----|--------|
| >3× | Prioritize immediately |
| 1-3× | Plan into upcoming work |
| <1× | Accept or isolate |

## Refactoring Strategies

### Strangler Fig
1. Build new alongside old
2. Redirect traffic incrementally
3. Remove old when empty

Best for: Large system replacements

### Branch by Abstraction
1. Create abstraction over old code
2. Implement new behind abstraction
3. Switch implementations
4. Remove old

Best for: Library/dependency swaps

### Parallel Change (Expand-Contract)
1. Add new behavior alongside old
2. Migrate callers incrementally
3. Remove old behavior

Best for: API changes

### Mikado Method
1. Try the change
2. When it breaks, note prerequisites
3. Revert
4. Recursively fix prerequisites
5. Apply original change

Best for: Untangling dependencies

## Tracking Debt

Minimum viable debt tracking:
```markdown
## Tech Debt Log

| ID | Description | Impact | Area | Added |
|----|-------------|--------|------|-------|
| TD-1 | No caching layer | Slow queries | /api | 2024-01 |
```

Review monthly. Prune resolved items.

## Communicating Debt to Stakeholders

**Frame as investment, not cleanup:**
- "This will reduce bug rate by ~30%"
- "Deployment time goes from 2 hours to 20 minutes"
- "New features in this area take 2x longer than they should"

**Avoid:**
- "The code is messy"
- "We need to refactor"
- Technical jargon without business impact
