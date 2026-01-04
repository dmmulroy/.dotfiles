# The Intent Layer

> Make agents perform like your best engineers on large codebases.

**Author:** Tyler Brandt  
**Source:** intent-systems.com/learn/intent-layer

## Contents

- [AKL Concept Mapping](#akl-concept-mapping)
- [Core Concept](#core-concept)
- [The Dark Room Problem](#the-dark-room-problem)
- [What's in a Node](#whats-in-a-node)
- [Hierarchical Context](#hierarchical-context)
- [Downlinks](#downlinks)
- [Building It](#building-it)
- [Investment & Payoff](#investment--payoff)

---

## AKL Concept Mapping

| Intent Layer Term | AKL Equivalent |
|-------------------|----------------|
| Intent Layer | Agent Knowledge Layer (AKL) |
| Intent Node | Knowledge Node / AGENTS.md |
| Downlinks | Related Context links |

---

## Core Concept

The Intent Layer is a thin, hierarchical context system that lives inside your repo. It captures the mental model your best engineers carry: what subsystems own, what must never happen, where boundaries live.

**Basic unit:** Intent Node (`AGENTS.md`, `CLAUDE.md`) - small, opinionated file explaining:
- What that area is for
- How to use it safely
- Patterns and pitfalls agents need to know

**Key behavior:** If an Intent Node exists in a directory, it covers that directory and all subdirectories, automatically included when agents work there.

---

## The Dark Room Problem

Without context, agents start from zero every request. They fumble in the dark, learning only by what they bump into:

- **Blind spots cause hallucinations** - gaps filled with generic training priors
- **Everything influences everything** - noise competes for attention
- **Window is finite** - hard token limits, degraded performance before limits

The Intent Layer turns the lights on permanently.

---

## What's in a Node

Intent Nodes should be **small** but **dense**. A high-signal briefing:

1. **Purpose & Scope** - What area is responsible for, what it doesn't do
2. **Entry Points & Contracts** - Main APIs, invariants ("All outbound calls go through X")
3. **Usage Patterns** - Canonical examples
4. **Anti-patterns** - Negative examples ("Never call this directly")
5. **Dependencies & Edges** - Other dirs/services, downlinks to children
6. **Patterns & Pitfalls** - Repeatedly confusing areas

---

## Hierarchical Context

When an Intent Node is pulled into context, **all ancestor nodes are pulled too**. Creates a **T-shaped view**: broad context at top, specific detail where working.

```
AGENTS.md (root) — global architecture
↳ services/AGENTS.md — service structure
  ↳ payment-service/AGENTS.md — payment specifics
```

Agent gets full stack before reading implementation code.

**Least Common Ancestor optimization:** Shared knowledge lives once at shallowest node covering all relevant paths.

---

## Downlinks

Point agents toward related context outside ancestor chain:

```markdown
## Related Context
- Payment validation: `./validators/AGENTS.md`
- Settlement engine: `./settlement/AGENTS.md`
```

**Progressive disclosure:** Don't load irrelevant context upfront. Point to it for discovery if needed.

---

## Building It

### Hierarchical Summarization

**Key mechanic:** When capturing parent, summarize child Intent Nodes—not raw code.

Creates **fractal compression**:
- Leaf nodes compress raw code into dense context
- Parent nodes compress children's Intent Nodes
- 2k token parent might cover 200k tokens of code

### Chunking

**Optimal token compression:**
- 20k–64k sweet spot: meaningful compression, stays in sharp region
- Similar code compresses better together
- Disparate areas connect through hierarchy, not concatenation

### Squeeze Ambiguity

Capture in order of clarity: children before parents, well-understood before tangled.

**Track what you can't resolve yet:**
- Open questions - parked until neighboring chunk answers
- Cross-references - tracked until LCA determined
- Tasks - dead code, refactors

### Deduplicate

Place shared facts in **Least Common Ancestor**: shallowest node covering all paths where fact is relevant.

---

## Investment & Payoff

- Agents behave like best engineers—know boundaries before touching code
- Run longer tasks, parallelize agents, operate at higher level
- Context compounds—hard-won explanations captured once, reused forever

**Cost scales with benefit:** Small repo = few hours. Massive monolith = longer but proportionally bigger lift.

**Maintenance:** Overhead per PR, not weekly—5-10 min manual or automate entirely.
