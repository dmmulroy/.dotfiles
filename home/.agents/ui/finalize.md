# Organize

Use this when the user wants to finalize finished UI code by componentizing it and canonicalizing Tailwind classes.

## Activation

Activate when the user asks to:

- clean up, componentize, organize, or refactor finished UI code
- prepare finished UI code for handoff

Do not activate when:

- the user wants a new design or layout
- the request is about visual changes, not code structure

## User-facing progress updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Run the [Componentize](uidotsh://ui/componentize) subskill first
- Run the [Canonicalize Tailwind](uidotsh://ui/canonicalize-tailwind) subskill after componentizing so extracted components are cleaned up too
