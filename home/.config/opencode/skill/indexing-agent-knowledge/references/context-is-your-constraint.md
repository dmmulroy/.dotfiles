# Context Is Your Constraint

> AI is limited by the context you give it, just like engineers are.

**Author:** Tyler Brandt  
**Source:** intent-systems.com/learn/context-is-your-constraint

## Contents

- [Core Insight](#core-insight)
- [What Is Context?](#what-is-context)
- [The Thought Experiment](#the-thought-experiment)
- [Three Approaches to Context](#three-approaches-to-context)
- [Stage Progression](#stage-progression)
- [Key Takeaway](#key-takeaway)

---

## Core Insight

The capability ceiling on AI isn't model intelligence—it's **what the model sees before it acts**.

If the model doesn't see what a great engineer would look at before touching production, it won't perform like a great engineer.

---

## What Is Context?

When you send a request to a model, it sees your message plus the entire CONTEXT WINDOW:

- System prompt
- Tool definitions
- All previous user prompts and assistant replies
- Tool calls and results
- Any extra files injected

**Three constraints drive everything:**

1. **Blind spots cause hallucinations** - Missing context filled with generic priors
2. **Everything influences everything** - Every token affects every other token
3. **The window is finite** - Hard limits, degraded performance before hitting them

---

## The Thought Experiment

Question: "What's the next feature we should build?"

**Without context:** Generic ideas—dashboard, reporting, dark mode.

**With two facts:**
1. 70% revenue is enterprise, #1 churn = confusing onboarding
2. Sales can't prove value in week one, support tickets show admin permission failures

**Now obvious:** Guided enterprise onboarding, permission templates.

Nothing about your intelligence changed. The **context** changed.

LLMs behave exactly the same way.

---

## Three Approaches to Context

### 1. Agentic Search (Default)

Agent uses tools (list_files, grep, read_file) + semantic search to explore autonomously.

**Small service:** Usually works, finds relevant code  
**Medium service:** Slot machine—maybe finds right files, maybe not  
**Large codebase:** Impossible—misses critical files, no concept of "what must never happen"

**Core limitation:** Code doesn't capture intent, history, tribal knowledge.

### 2. Manual Context Engineering

Engineers hand-curate exactly what agent sees.

**When done well:**
- Include what matters beyond code: requirements, ADRs, constraints
- Work across services
- Agent infers patterns
- Quality can be stunning

**Tradeoffs:**
- 10x skill gap between novice and expert
- 30-90 minutes per non-trivial change
- Brittle—miss one file, quality degrades
- Not reusable—disappears into chat logs
- Doesn't scale—bottleneck on expensive people

### 3. Systematic Context Layer (Intent Layer)

Take manual context engineering skills, bake into reusable infrastructure.

**How:**
- Chunk codebase semantically
- Create condensed AGENTS.md at boundaries
- Hierarchically summarize and downlink
- Respect token budgets

**Payoff:**
- Automatic context for every task
- Raises the floor—every interaction gets expert-level context
- Reusable infrastructure that compounds
- Progressive disclosure at scale

---

## Stage Progression

| Stage | Approach | Capability |
|-------|----------|------------|
| 2 | Agentic search | Local edits, small refactors |
| 3 | Manual context | Expert can get 10x results |
| 4 | Systematic layer | 10x results democratized to whole team |

---

## Key Takeaway

> **If the AI sees what your best engineers see, it can perform like your best engineers. If it doesn't, it won't.**

The gap between teams who solve the context bottleneck and those who don't has never been wider.

Two steps:
1. Teach engineers manual context engineering on purpose
2. Turn that knowledge into shared, token-efficient context layer
