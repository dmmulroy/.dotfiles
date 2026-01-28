# Decision Frameworks

## Reversibility Matrix

| Decision Type | Approach |
|---------------|----------|
| **Two-way door** (easily reversed) | Decide fast, learn from outcome |
| **One-way door** (hard to reverse) | Invest time in analysis |

Most decisions are two-way doors. Don't over-analyze.

## Cost of Delay

```
Daily Cost = (Value Delivered / Time to Deliver) × Risk Factor
```

Use when prioritizing:
- High daily cost → Do first
- Low daily cost → Can wait

## RICE Scoring

| Factor | Question | Scale |
|--------|----------|-------|
| **R**each | How many users affected? | # users/period |
| **I**mpact | How much per user? | 0.25, 0.5, 1, 2, 3 |
| **C**onfidence | How sure are we? | 20%, 50%, 80%, 100% |
| **E**ffort | Person-weeks | 0.5, 1, 2, 4, 8+ |

```
RICE = (Reach × Impact × Confidence) / Effort
```

## Technical Decision Checklist

Before committing to a technical approach:

- [ ] Have we talked to someone who's done this before?
- [ ] What's the simplest version that teaches us something?
- [ ] What would make us reverse this decision?
- [ ] Who maintains this in 6 months?
- [ ] What's our rollback plan?

## When to Build vs Buy vs Adopt

| Signal | Build | Buy | Adopt (OSS) |
|--------|-------|-----|-------------|
| Core differentiator | Yes | No | Maybe |
| Commodity problem | No | Yes | Yes |
| Tight integration needed | Yes | Maybe | Maybe |
| Team has expertise | Yes | N/A | Yes |
| Time pressure | No | Yes | Maybe |
| Long-term control needed | Yes | No | Maybe |

## Decomposition Strategies

### Vertical Slicing
Cut features into thin end-to-end slices that deliver value:
```
Bad:  "Build database layer" → "Build API" → "Build UI"
Good: "User can see their profile" → "User can edit name" → "User can upload avatar"
```

### Risk-First Ordering
1. Identify highest-risk unknowns
2. Build spike/proof-of-concept for those first
3. Then build around proven foundation

### Dependency Mapping
```
[Feature A] ─depends on→ [Feature B] ─depends on→ [Feature C]
                                                      ↑
                                                 Start here
```
