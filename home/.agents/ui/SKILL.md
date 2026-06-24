---
name: ui
description: Explore, build, and refine user interfaces with Tailwind CSS using ui.sh design guidance. Use when explicitly invoked with /ui for UI design, implementation, refinement, responsiveness, dark mode, Tailwind cleanup, or componentization.
disable-model-invocation: true
---

# ui

This skill helps you build and refine user interfaces with Tailwind CSS. It exposes a set of focused subskills, each scoped to a specific task. Match the user's prompt to the closest subskill — if none fit, fall back to the `design` subskill, which designs and builds new UI from scratch using the design guidelines.

## Subskills

| Subskill                | When to use                                                                                                                            | File                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `design`                | Building new UI, layouts, sections, components, or pages from scratch — the default fallback when no other subskill matches the prompt | uses [`design-guidelines.md`](uidotsh://ui/design-guidelines) directly |
| `ideas`                 | Generating multiple UI ideas, concepts, directions, options, variants, or alternatives to compare and choose from                      | [`ideas.md`](uidotsh://ui/ideas)                                       |
| `finalize`              | Finalizing finished UI code by running componentization and Tailwind canonicalization                                                  | [`finalize.md`](uidotsh://ui/finalize)                                 |
| `componentize`          | Extracting UI into reusable components and turning a prototype or draft into production-ready, componentized code                      | [`componentize.md`](uidotsh://ui/componentize)                         |
| `canonicalize-tailwind` | Cleaning up, sorting, normalizing, deduplicating, and resolving conflicts in Tailwind class lists                                      | [`canonicalize-tailwind.md`](uidotsh://ui/canonicalize-tailwind)       |
| `add-dark-mode`         | Converting an existing design to support dark mode                                                                                     | [`add-dark-mode.md`](uidotsh://ui/add-dark-mode)                       |
| `dark-mode-image`       | Adapting a source image (illustration, screenshot, photo) into a dark-mode-suitable version                                            | [`dark-mode-image.md`](uidotsh://ui/dark-mode-image)                   |
| `make-responsive`       | Making an existing desktop-only design responsive across breakpoints                                                                   | [`make-responsive.md`](uidotsh://ui/make-responsive)                   |

## When invoked without a prompt

List the subskills above with a one-line description of each so the user can come back with a specific request. Keep it brief — this is a menu, not documentation.

## When invoked with a prompt

1. If the prompt asks for multiple UI ideas, concepts, directions, options, variants, or alternatives, use the `ideas` subskill — this includes wording like "come up with a few different ideas for..." even when the target is a new section, component, layout, or page.
2. Otherwise, match the prompt to the closest subskill in the table above.
3. If no subskill clearly matches, use the `design` fallback — load [`design-guidelines.md`](uidotsh://ui/design-guidelines) and the specific guideline files it points to that match the request.
4. Load the matched subskill file before doing any implementation work; subskills will instruct you to load additional design guideline files as needed.
5. If the prompt is ambiguous between two subskills, ask one focused clarifying question rather than guessing.

### Routing examples

| Prompt                                                                            | Subskill                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| "Build a landing page for a SaaS product"                                         | `design` (fallback)                                                                |
| "Build a dashboard with a sidebar"                                                | `design` (fallback)                                                                |
| "Show me 3 different hero layouts"                                                | `ideas` ([`ideas.md`](uidotsh://ui/ideas))                                                 |
| "Come up with a few different ideas for a new testimonial section after the hero" | `ideas` ([`ideas.md`](uidotsh://ui/ideas))                                                 |
| "Any suggestions for this section?"                                               | `ideas` ([`ideas.md`](uidotsh://ui/ideas))                                                 |
| "Clean up the Tailwind in this file"                                              | `canonicalize-tailwind` ([`canonicalize-tailwind.md`](uidotsh://ui/canonicalize-tailwind)) |
| "Extract this page into components"                                               | `componentize` ([`componentize.md`](uidotsh://ui/componentize))                            |
| "Turn this draft into production code"                                            | `componentize` ([`componentize.md`](uidotsh://ui/componentize))                            |
| "Add dark mode to this page"                                                      | `add-dark-mode` ([`add-dark-mode.md`](uidotsh://ui/add-dark-mode))                         |
| "Make a dark version of this image"                                               | `dark-mode-image` ([`dark-mode-image.md`](uidotsh://ui/dark-mode-image))                   |
| "Make this responsive"                                                            | `make-responsive` ([`make-responsive.md`](uidotsh://ui/make-responsive))                   |

## Core behavior

- This skill only activates when explicitly invoked with `/ui`
- If `/ui` is used for something clearly unrelated to UI work, explain what the skill is for and ask the user to clarify
- Always load the matched subskill file (or `design-guidelines.md` for the fallback) before writing code — never skip the design guidelines
