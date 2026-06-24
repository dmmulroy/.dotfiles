---
name: coding-standards
description: User-invoked shared reference package for my coding vocabulary, design principles, review lens, and technology standards.
disable-model-invocation: true
---

# Coding Standards

This skill package is the canonical shared standards reference for the companion workflow skills.

## Direct use

When invoked directly:

1. Read `PRINCIPLES.md`; read `VOCABULARY.md` when shared terms or architectural vocabulary matter.
2. Load the relevant context pointers below.
3. If asked to update standards, preserve a single source of truth: edit these reference files first.
4. Completion criterion: the active standards files for the request have been loaded, and standards updates target this package first.

## Context pointers

- `REVIEW-LENS.md` — use for applying standards in code review.
- `MODULES.md` — use for domain modules, application/service modules, dependency seams, adapters, and abstraction depth.
- `TYPESCRIPT.md` — use for TypeScript language, testing, and lightweight tooling principles.
- `CLOUDFLARE.md` — use for Workers, Durable Objects, Agents, D1, Queues, Workflows, and workerd seams.
- `EFFECT.md` — use for Effect-specific mechanics.
