---
name: prd-to-todos
description: Break a PRD into independently-grabbable file-backed todos using tracer-bullet vertical slices. Use when the user wants to convert a PRD into implementation tasks, create vertical-slice todos, or break down a PRD into work items.
allowed-tools: read bash webfetch websearch todo
---

# PRD to Todos

Break a PRD into independently-grabbable implementation todos using **vertical slices (tracer bullets)**.

This skill is adapted for this Pi setup:

- input can come from a local PRD file, a PRD already in context, or a URL/issue the agent can fetch
- output should be created with the `todo` tool, not GitHub issues

## Process

### 1. Locate the PRD

Ask the user for the PRD source if it is not already clear.

Accept any of:

- a local file path
- a pasted PRD
- a URL
- a GitHub issue number or URL if that is how the PRD is stored

If the PRD is not already in context:

- use `read` for local files
- use `webfetch` for URLs
- use `bash` only if you need a repo-specific CLI like `gh issue view` to fetch the PRD text

Make sure you have the full PRD, including:

- problem statement
- solution summary
- user stories
- constraints
- implementation notes
- out-of-scope notes

If the PRD is incomplete, ask clarifying questions before breaking it down.

### 2. Explore the codebase (optional but preferred)

If you have not already explored the codebase, do so enough to understand:

- the current architecture
- the relevant modules and boundaries
- likely integration points
- obvious sequencing constraints
- where the risky or ambiguous areas are

Use this exploration to improve the slice boundaries.

### 3. Draft vertical slices

Break the PRD into **tracer-bullet** slices.

Each slice must be a **thin end-to-end path** that cuts through all relevant layers, not a horizontal layer-only task.

Examples of good slices:

- one narrow user flow through schema + backend + UI + tests
- one integration path that is demoable on its own
- one deliverable that can be verified independently

Examples of bad slices:

- “add DB tables”
- “build backend API”
- “implement frontend UI”

Those are horizontal slices and should usually be avoided.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every necessary layer
- A completed slice is demoable, testable, or otherwise verifiable on its own
- Prefer many thin slices over a few thick ones
- Separate discovery/decision work from build work only when truly necessary
- Make dependencies explicit and minimize them aggressively
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list.

For each slice, include:

- **Title**: short descriptive name
- **Blocked by**: other slices, if any
- **User stories covered**: reference the PRD user story numbers
- **Why this is a vertical slice**: one sentence explaining the end-to-end value

Then ask the user:

- Does the granularity feel right? Too coarse or too fine?
- Are the dependency relationships correct?
- Should any slices be merged or split?
- Are any important user stories uncovered?

Iterate until the user explicitly approves the breakdown.

Do **not** create todos before approval.

### 5. Create todos with the `todo` tool

Once the breakdown is approved, create one todo per slice using the `todo` tool.

Do **not** create the todo files by editing the filesystem directly unless the `todo` tool is unavailable.

Create todos in dependency order so later todos can reference the real todo ids of blockers.

Before creating the first todo, derive a single normalized PRD slug from the PRD title and reuse it across every todo created from that PRD.

Use that slug in a shared tag of the form:

- `prd:<slug>`

Example:

- PRD title: `Improved tmux session restore`
- shared PRD tag: `prd:improved-tmux-session-restore`

#### Title conventions

Use a concise title that a teammate could immediately grab.

Good examples:

- `Add minimal PRD list view with end-to-end data flow`
- `Support first-run auth handshake for sync setup`
- `Refine empty-state copy and error recovery flow`

#### Tag conventions

Use tags to make todos easy to filter later.

In the current todo extension, tags are the best built-in grouping/search mechanism for relating multiple todos to the same PRD. There is no separate first-class parent/epic field beyond what you write in the body.

Always include:

- `prd`
- `vertical-slice`
- the shared PRD tag: `prd:<slug>`

Where `<slug>` is a lowercase, hyphenated slug derived once from the PRD title and reused exactly across all todos from that PRD.

Optionally include:

- an area tag like `api`, `ui`, `infra`, or `migration` if it helps discoverability

Do not invent a different feature tag per slice if it would fragment search. The point is that all todos for the PRD should share the exact same `prd:<slug>` tag so they can be listed and grouped easily.

#### Todo body template

Use this markdown body when creating each todo:

<todo-template>
## Parent PRD

<path, URL, issue reference, or short identifier>

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not a layer-by-layer implementation checklist. Reference specific sections of the parent PRD rather than duplicating the PRD in full.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- TODO-<id> if blocked

Or:

None - can start immediately

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7

## Notes

Any implementation notes, risks, or clarifications needed to make the task independently grabbable.
</todo-template>

### 6. Summarize what you created

After creating the todos:

- list each created todo id and title
- show the shared PRD tag used for all created todos
- show dependency relationships using the real todo ids
- mention any user stories that were intentionally deferred or left out

Do **not** claim the todos unless the user asks you to.
Do **not** modify the parent PRD unless the user explicitly asks you to.

## Quality bar

A good output from this skill has these properties:

- every todo is independently understandable
- every todo is small enough to grab and finish
- every todo produces end-to-end value
- acceptance criteria are concrete and testable
- dependencies are real, not speculative
- the todo list is a better execution plan than the original PRD alone
