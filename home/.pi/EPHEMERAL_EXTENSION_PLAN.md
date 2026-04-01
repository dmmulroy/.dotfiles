# Pi Ephemeral v1 Plan

## Summary

Pi Ephemeral is a Pi extension that gives the user an in-Pi UI for selectively installing and removing Pi resources into the **current project**.

The resources are treated like toggles:
- turn a resource on → install it into the current project
- turn a resource off → remove it from the current project

The purpose is to keep commonly useful skills, prompts, extensions, and MCP servers available **on demand** without keeping them permanently present in every local Pi project.

---

## Core Goal

Reduce always-on clutter and context by making project-local Pi resources ephemeral and toggleable.

The user should be able to:
- open a Pi UI
- browse categories like `skills`, `prompts`, `extensions`, and `mcp`
- search within a category
- stage additions/removals
- apply all changes in one submit step
- then manually run `/reload`

---

## v1 Scope

Pi Ephemeral supports these resource types:

1. Skills
2. Prompt templates
3. Extensions
4. MCP servers

---

## Out of Scope for v1

- automatic conditional installs based on repo detection
- rich repair workflows for drifted state
- auto-reload after apply
- custom metadata files like `meta.json`
- overwriting existing unmanaged project files
- adopting existing unmanaged project files into Ephemeral management
- preserving locally modified managed files on removal

---

# Product Behavior

## Mental Model

Pi Ephemeral manages a separate personal catalog of reusable Pi resources:

```text
~/.pi/ephemeral/
```

From that catalog, the user can selectively project resources into the current project.

### Toggle model

```text
Catalog item ON   -> install into current project
Catalog item OFF  -> remove from current project
```

### Important invariant

Pi Ephemeral only removes resources that it previously installed and recorded in its manifest.

It does **not** install over unmanaged project resources.

---

# Catalog Layout

## Catalog root

```text
~/.pi/ephemeral/
  skills/
  prompts/
  extensions/
  mcp/
    mcp.json
```

No extra metadata files are used in v1.

---

## Catalog discovery rules

### Skills

Discover Pi-style skills from:

```text
~/.pi/ephemeral/skills/
```

Expected structure:

```text
~/.pi/ephemeral/skills/
  my-skill/
    SKILL.md
```

Display info is derived from `SKILL.md` frontmatter:
- label = `name`
- description = `description`

---

### Prompt templates

Discover from:

```text
~/.pi/ephemeral/prompts/*.md
```

Display info:
- label = filename without `.md`
- description = frontmatter `description`, else first non-empty line

Example:

```text
~/.pi/ephemeral/prompts/
  review.md
  refactor.md
```

---

### Extensions

Discover from:

```text
~/.pi/ephemeral/extensions/*.ts
~/.pi/ephemeral/extensions/*/package.json
~/.pi/ephemeral/extensions/*/index.ts
```

#### Single-file extension item

```text
~/.pi/ephemeral/extensions/my-extension.ts
```

Display info:
- label = filename without `.ts`
- description = blank in v1

#### Package-style extension item

```text
~/.pi/ephemeral/extensions/pi-mcp/
  package.json
  src/...
```

Display info:
- label = `package.json.name`, fallback dir name
- description = `package.json.description`, fallback blank

---

### MCP servers

Catalog source of truth:

```text
~/.pi/ephemeral/mcp/mcp.json
```

Selectable units are **individual server entries** under:

```json
{
  "mcpServers": {
    "context7": { ... },
    "grep_app": { ... }
  }
}
```

For v1, Pi Ephemeral ignores top-level MCP config fields such as:
- `settings`
- `imports`

Only selected `mcpServers` are merged into the project.

---

# Project Targets

## Skills

Copied into:

```text
<project>/.pi/skills/<skill-name>/...
```

Example:

```text
<project>/.pi/skills/tdd/SKILL.md
```

---

## Prompt templates

Copied into:

```text
<project>/.pi/prompts/<name>.md
```

Example:

```text
<project>/.pi/prompts/review.md
```

---

## Extensions

### Single-file extensions

Copied into:

```text
<project>/.pi/extensions/<name>.ts
```

Example:

```text
<project>/.pi/extensions/notify.ts
```

### Package-style extensions

Copied into:

```text
<project>/.pi/ephemeral/extensions/<name>/
```

And then referenced from:

```text
<project>/.pi/settings.json
```

using an **absolute expanded path**.

Example settings entry:

```json
{
  "extensions": [
    "/Users/dmmulroy/project/.pi/ephemeral/extensions/pi-mcp"
  ]
}
```

---

## MCP servers

Merged into:

```text
<project>/.pi/mcp.json
```

Only the selected `mcpServers` entries are written.

No per-server project files are created.

---

# Installation Modes

## 1. Copy mode

Used for:
- skills
- prompts
- single-file extensions
- package-style extension source trees copied into `.pi/ephemeral/extensions/...`

## 2. Reference mode

Used for:
- package-style extensions after they are copied locally
- references are stored in project `.pi/settings.json`

## 3. Merge mode

Used for:
- MCP server selection into project `.pi/mcp.json`

---

# Conflict Rules

## Existing unmanaged target path

If a target path already exists and is **not already managed** by Pi Ephemeral:
- install fails
- item is shown as conflicted
- Pi Ephemeral does not overwrite or adopt the file

### Example

```text
Wanted target:
  .pi/skills/tdd/

But this already exists and is unmanaged.

Result:
  install refused
```

---

## MCP name collision

If project `.pi/mcp.json` already contains a server with the same name and it is not managed by Pi Ephemeral:
- install fails
- no overwrite
- no rename

### Example

```text
Catalog server: github
Project already has: github
Managed by Ephemeral: no

Result:
  install refused
```

---

# Removal Rules

On deselect, Pi Ephemeral removes the managed resource.

## Copy-managed resources

For copied managed files/directories:
- delete them
- even if locally modified

## Settings-managed references

For referenced package extensions:
- remove the matching absolute path entry from `.pi/settings.json`

## MCP-managed entries

For MCP:
- remove only the managed server entries from `.pi/mcp.json`

---

# Manifest

Project source of truth:

```text
<project>/.pi/ephemeral.json
```

Purpose:
- track which resources are managed by Pi Ephemeral
- know what to remove on deselect
- prevent deleting unmanaged project resources
- detect drift and warn

## Minimum structure

```json
{
  "version": 1,
  "items": {
    "skills:tdd": {
      "type": "skill",
      "id": "tdd",
      "installMode": "copy",
      "sourcePath": "/Users/dmmulroy/.pi/ephemeral/skills/tdd",
      "targetPaths": [
        "/path/to/project/.pi/skills/tdd/SKILL.md"
      ],
      "settingsChanges": [],
      "installedAt": "2026-04-01T00:00:00.000Z",
      "catalogFingerprint": "..."
    },
    "extensions:pi-mcp": {
      "type": "extension",
      "id": "pi-mcp",
      "installMode": "reference",
      "sourcePath": "/Users/dmmulroy/.pi/ephemeral/extensions/pi-mcp",
      "targetPaths": [
        "/path/to/project/.pi/ephemeral/extensions/pi-mcp"
      ],
      "settingsChanges": [
        {
          "file": "/path/to/project/.pi/settings.json",
          "kind": "extensions",
          "value": "/path/to/project/.pi/ephemeral/extensions/pi-mcp"
        }
      ],
      "installedAt": "2026-04-01T00:00:00.000Z",
      "catalogFingerprint": "..."
    },
    "mcp:context7": {
      "type": "mcp",
      "id": "context7",
      "installMode": "merge",
      "sourcePath": "/Users/dmmulroy/.pi/ephemeral/mcp/mcp.json#mcpServers.context7",
      "targetPaths": [
        "/path/to/project/.pi/mcp.json"
      ],
      "settingsChanges": [],
      "installedAt": "2026-04-01T00:00:00.000Z",
      "catalogFingerprint": "..."
    }
  }
}
```

---

# UI Design

## Command entrypoint

Suggested command:

```text
/ephemeral
```

This opens a custom overlay UI.

---

## High-level layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Pi Ephemeral             [skills] [prompts] [extensions] [mcp]             │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ Search: tdd                       │ Managed in this project                  │
│                                   │                                          │
│ ○ tdd                             │ skills                                   │
│ ● write-a-prd                     │   • write-a-prd                          │
│ ○ grill-me                        │                                          │
│ ○ pr-walkthrough                  │ prompts                                  │
│                                   │   • review                               │
│                                   │                                          │
│                                   │ extensions                               │
│                                   │   • pi-mcp                               │
│                                   │                                          │
│                                   │ Pending                                  │
│                                   │   + tdd                                  │
│                                   │   - review                               │
│                                   │                                          │
│                                   │ Warnings                                 │
│                                   │   ! prompt 'foo' conflicts with local    │
├───────────────────────────────────┴──────────────────────────────────────────┤
│ type to search • space toggle • enter preview • tab category • ctrl+s apply │
│ esc close                                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Layout behavior
- top row = category tabs
- left pane = searchable catalog list for the active category
- right pane = **only items managed by Pi Ephemeral in the current project**
- right pane is passive, not interactive
- footer = controls, warnings, apply hints

---

## Category tabs

v1 tabs:

```text
[skills] [prompts] [extensions] [mcp]
```

Changing category does **not** discard staged changes.

---

## Left pane behavior

The left pane is the main interaction surface.

### Features
- always-on typing search
- filtered list of catalog items for current category
- `space` toggles selected item staged on/off
- `enter` opens preview/details for selected item

### Toggle symbols

```text
○ not selected / not managed
● selected or currently managed
```

Pending state can be rendered with clearer symbols/colors if desired, for example:

```text
+ staged add
- staged remove
```

---

## Right pane behavior

The right pane is passive and shows only Ephemeral-managed project resources.

Suggested sections:
- Managed in this project
- Pending
- Warnings

### Example

```text
Managed in this project

skills
  • write-a-prd
  • grill-me

prompts
  • review

extensions
  • pi-mcp

mcp
  • context7
  • grep_app

Pending
  + tdd
  - review

Warnings
  ! extension 'foo' conflicts with existing unmanaged path
```

---

# UI Flows

## Flow 1: Open and browse

```text
User runs /ephemeral
        |
        v
Overlay opens on last category or default 'skills'
        |
        v
Catalog list shown on left, managed project items shown on right
        |
        v
User types to filter
```

ASCII flow:

```text
/start
  |
  v
/ephemeral
  |
  v
[Overlay opens]
  |
  +--> [skills]
  +--> [prompts]
  +--> [extensions]
  '--> [mcp]
```

---

## Flow 2: Stage changes across categories

```text
Open skills
  |
  v
Toggle 2 skills
  |
  v
Tab to prompts
  |
  v
Toggle 1 prompt
  |
  v
Tab to mcp
  |
  v
Toggle 2 servers
  |
  v
Pending summary accumulates across categories
```

ASCII flow:

```text
[skills] --toggle--> (+ skill-a, + skill-b)
   |
   v
[prompts] --toggle--> (+ prompt-x)
   |
   v
[mcp] --toggle--> (+ context7, + grep_app)
   |
   v
[Pending summary contains all staged changes]
```

---

## Flow 3: Preview item

`enter` on selected item opens a preview/details view.

### By type
- skill → render `SKILL.md`
- prompt → render the prompt markdown file
- extension → show summary (source path, type, package name/description if available)
- MCP → show JSON snippet for the selected server entry

ASCII flow:

```text
[Catalog item selected]
        |
      Enter
        |
        v
 ┌──────────────────────── Preview ────────────────────────┐
 │ tdd                                                     │
 │ ------------------------------------------------------  │
 │ # TDD                                                   │
 │ Use this skill when...                                  │
 │ ...                                                     │
 │                                                         │
 │ esc back                                                │
 └─────────────────────────────────────────────────────────┘
```

---

## Flow 4: Apply staged changes

User presses `ctrl+s`.

```text
ctrl+s
  |
  v
Compute plan:
  - additions
  - removals
  - conflicts
  - warnings
  |
  v
If conflicts exist:
  show apply failure / partial refusal summary
Else:
  perform writes/deletes/merges
  update .pi/ephemeral.json
  notify user to run /reload
```

ASCII flow:

```text
[Pending changes]
      |
    ctrl+s
      |
      v
[Plan changes]
      |
      +--> [Conflict?] --yes--> [Show error/warning, do not overwrite]
      |
      '--no--> [Apply changes]
                   |
                   v
            [Write manifest]
                   |
                   v
         [Notify: run /reload]
```

---

## Flow 5: Remove managed item

```text
Managed item exists in project
  |
  v
User toggles it off in left pane
  |
  v
Pending shows removal
  |
  v
Apply
  |
  v
Delete copied files / remove settings ref / remove mcp server entry
  |
  v
Update manifest
```

ASCII flow:

```text
[managed: review.md]
      |
   toggle off
      |
      v
[pending: - review]
      |
    ctrl+s
      |
      v
[delete .pi/prompts/review.md]
      |
      v
[remove manifest entry]
```

---

# Keyboard Model

Recommended v1 controls:

```text
Type       -> always-on search in left pane
Up/Down    -> move selection in left pane
Tab        -> switch category
Space      -> toggle selected item on/off
Enter      -> preview selected item
Ctrl+S     -> apply staged changes
Esc        -> close overlay or close preview
```

Optional preview controls:

```text
Up/Down    -> scroll preview
Esc        -> return to main overlay
```

---

# Drift Handling

v1 drift behavior should stay intentionally simple.

## Examples of drift
- manifest says an item is installed, but target files are missing
- manifest says a package extension ref exists, but the `.pi/settings.json` entry was removed
- manifest says an MCP server is managed, but `.pi/mcp.json` no longer contains it

## v1 behavior
- detect drift
- show warning/error in the UI and/or on Pi startup when in a project using Ephemeral
- do not auto-repair
- do not launch a complex repair workflow

### Example warning block

```text
Warnings
  ! drift detected: managed skill 'tdd' missing target file
  ! drift detected: managed extension 'pi-mcp' missing settings reference
```

---

# Apply Semantics

## After apply

Pi Ephemeral should:
1. apply writes/deletes/merges
2. update `.pi/ephemeral.json`
3. show a notification like:

```text
Ephemeral changes applied. Run /reload to activate them.
```

It should **not** auto-reload in v1.

---

# Suggested Internal Architecture

Suggested package-style extension layout:

```text
agent/extensions/pi-ephemeral/
  package.json
  src/index.ts
  src/types.ts
  src/catalog.ts
  src/manifest.ts
  src/project-state.ts
  src/apply.ts
  src/ui.ts
  src/preview.ts
  src/mcp.ts
```

## Responsibilities

### `catalog.ts`
- scan `~/.pi/ephemeral`
- normalize skills/prompts/extensions/MCP items into a shared item model

### `manifest.ts`
- read/write `.pi/ephemeral.json`
- manage item identity and ownership

### `project-state.ts`
- inspect current project:
  - `.pi/settings.json`
  - `.pi/mcp.json`
  - managed target paths
- compute current managed state and drift warnings

### `apply.ts`
- calculate additions/removals
- copy files
- delete files/directories
- update settings refs
- merge/remove MCP servers
- write manifest

### `ui.ts`
- render overlay
- tabs, left list, right pane, footer
- search and staged changes

### `preview.ts`
- render preview/details for selected item

### `mcp.ts`
- parse `~/.pi/ephemeral/mcp/mcp.json`
- extract per-server entries
- merge selected server entries into project `.pi/mcp.json`

---

# Summary of Locked Decisions

## Locked product decisions
- dedicated catalog at `~/.pi/ephemeral`
- v1 supports skills, prompts, extensions, MCP servers
- no catalog metadata files
- staged apply model
- manual `/reload` after apply
- two-column overlay UI
- right pane shows only Ephemeral-managed project items
- staged changes persist across categories
- enter previews selected item
- search is always-on typing
- conflicts refuse install
- managed copied files are deleted on deselect
- package extension settings refs use absolute expanded paths
- MCP merges only selected `mcpServers`
- simple drift warnings only

---

# Example End-to-End Scenario

```text
Project starts with:
  .pi/
    settings.json
    mcp.json

User opens /ephemeral
  -> selects skill: tdd
  -> selects prompt: review
  -> selects extension: pi-mcp
  -> selects MCP servers: context7, grep_app
  -> presses ctrl+s

Pi Ephemeral applies:
  + copies skill into .pi/skills/tdd/
  + copies prompt into .pi/prompts/review.md
  + copies package extension into .pi/ephemeral/extensions/pi-mcp/
  + adds absolute extension path to .pi/settings.json
  + merges context7 + grep_app into .pi/mcp.json
  + writes .pi/ephemeral.json
  + notifies: run /reload
```

Resulting project shape might look like:

```text
<project>/
  .pi/
    settings.json
    mcp.json
    ephemeral.json
    prompts/
      review.md
    skills/
      tdd/
        SKILL.md
    ephemeral/
      extensions/
        pi-mcp/
          package.json
          src/...
```

---

# Final Principle

Pi Ephemeral should feel like a **project-local resource toggle board** for Pi.

Not a package manager.
Not a rules engine.
Not an auto-sync system.

Just a fast, explicit way to say:

```text
I want these Pi capabilities in this project right now,
and I want to remove them cleanly later.
```
