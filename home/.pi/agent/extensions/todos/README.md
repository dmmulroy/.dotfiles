# todos

A file-backed Pi extension that adds:

- a `todo` tool for the agent
- a `/todos` command for humans

This extension was installed from the upstream source:

- <https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/todos.ts>

Local entrypoint:

- `agent/extensions/todos/index.ts`

Because it lives under `~/.pi/agent/extensions/*/index.ts`, Pi should auto-discover it as a global extension after reload.

> Note: the local copy was lightly patched to match the Pi version in this repo (mainly keybinding/type compatibility). Functionally it is still the upstream todos extension.

---

## Table of contents

- [What this extension does](#what-this-extension-does)
- [Quick start](#quick-start)
- [User guide](#user-guide)
  - [Storage location](#storage-location)
  - [The `todo` tool](#the-todo-tool)
  - [The `/todos` command](#the-todos-command)
  - [Recommended workflow](#recommended-workflow)
- [Data model and on-disk format](#data-model-and-on-disk-format)
  - [Todo file format](#todo-file-format)
  - [Settings file](#settings-file)
  - [Lock file](#lock-file)
- [Technical overview](#technical-overview)
  - [Main concepts](#main-concepts)
  - [Important TypeScript types](#important-typescript-types)
  - [Core helper functions](#core-helper-functions)
  - [Tool behavior by action](#tool-behavior-by-action)
  - [Interactive UI behavior](#interactive-ui-behavior)
  - [Rendering behavior](#rendering-behavior)
  - [Concurrency and locking](#concurrency-and-locking)
  - [Session semantics](#session-semantics)
  - [Garbage collection](#garbage-collection)
- [Operational notes](#operational-notes)
- [Updating from upstream](#updating-from-upstream)

---

## What this extension does

The extension gives Pi a persistent todo system backed by real files instead of conversation-only state.

Each todo is stored as its own Markdown file with:

- JSON front matter at the top
- optional Markdown body below it
- optional lock file while a session edits it

This design makes todos:

- easy to inspect with normal shell/editor tools
- easy to version-control if desired
- resilient across Pi restarts
- shareable across sessions

It also adds an interactive browser via `/todos`, so you can search, inspect, claim, release, close, reopen, copy, or delete todos without manually editing files.

---

## Quick start

Reload Pi:

```sh
/reload
```

Then you can use it in two ways.

1. Ask Pi to use the `todo` tool, for example:

- “list my todos”
- “create a todo to add tests for the tmux config”
- “claim TODO-deadbeef and start working on it”
- “append implementation notes to TODO-deadbeef”
- “close TODO-deadbeef”

2. Open the interactive manager:

```text
/todos
```

The extension stores data in:

- `.pi/todos` by default
- or the directory pointed to by `PI_TODO_PATH`

---

## User guide

### Storage location

By default, todos are stored under:

```text
.pi/todos/
```

You can override that with:

```sh
export PI_TODO_PATH=/absolute/or/relative/path
```

Implementation detail:

- the path is resolved relative to Pi’s current working directory when the extension runs
- the settings file is stored inside that same todo directory

Examples:

```sh
export PI_TODO_PATH=.local-todos
export PI_TODO_PATH=/tmp/project-todos
```

### The `todo` tool

The extension registers one tool named:

- `todo`

Supported actions:

- `list`
- `list-all`
- `get`
- `create`
- `update`
- `append`
- `delete`
- `claim`
- `release`

#### `list`

Returns assigned and open todos only.

Use when you want the active working set and do not care about closed history.

#### `list-all`

Returns assigned, open, and closed todos.

Use when you want the full backlog and history.

#### `get`

Fetches one todo by id.

Accepted id forms:

- `TODO-deadbeef`
- `deadbeef`
- `#deadbeef`

Internally, ids are normalized down to an 8-character hex id.

#### `create`

Creates a new todo file.

Fields you can supply:

- `title`
- `status` (defaults to `open`)
- `tags`
- `body`

A random 8-hex-character id is generated automatically.

#### `update`

Replaces selected fields on an existing todo.

Possible fields:

- `title`
- `status`
- `tags`
- `body`

Important:

- `update.body` replaces the entire body
- if a todo is moved to a closed state (`closed` or `done`), the extension clears `assigned_to_session`

#### `append`

Appends text to the todo body.

This is the safest choice when you want to preserve the existing notes and add more detail.

Behavior:

- trims trailing whitespace first
- inserts a blank line between existing content and the appended text when needed
- writes the updated file back to disk

#### `claim`

Marks the todo as assigned to the current Pi session.

Use this before working on a task to reduce collisions between sessions.

Behavior:

- fails if the todo is closed
- fails if another session has it assigned, unless `force: true`
- stores the current session id in `assigned_to_session`

#### `release`

Clears the assignment.

Behavior:

- no-op if already unassigned
- fails if assigned to another session, unless `force: true`

#### `delete`

Deletes the todo file.

The `/todos` UI wraps this in a confirmation step.

### The `/todos` command

The extension also registers:

- `/todos`

This opens a searchable interactive todo browser.

If you pass text after the command, it is used as the initial search filter:

```text
/todos tests
/todos tmux
/todos TODO-deadbeef
```

Command UX features:

- fuzzy search over id, title, tags, status, and assignment info
- arrow-key navigation
- Enter to open an action menu
- quick “work” action
- quick “refine” action
- detail overlay for viewing the Markdown body
- copy path / copy text helpers
- delete confirmation dialog

The command also provides argument completions based on existing todos.

#### Quick actions from `/todos`

The UI has two especially useful flows:

- **work**: pre-fills the Pi editor with a prompt like `work on todo TODO-deadbeef "Title"`
- **refine**: pre-fills the editor with a prompt asking Pi to help refine the task before rewriting it

This is a nice bridge between task management and actual agent work.

### Recommended workflow

A practical workflow looks like this:

1. Create a todo with a short title and optional starter notes.
2. Claim it before serious work.
3. Append notes as you learn things.
4. Use `/todos` to inspect and refine.
5. Mark it `closed` or `done` when finished.
6. Let GC eventually prune old closed todos if enabled.

### Recommended tagging conventions

Because the current todo extension does not have a first-class concept of:

- epic
- parent issue
- project
- PRD grouping

`tags` are the best built-in way to group related todos and make them searchable in `/todos`.

#### General recommendations

Use a small, stable set of tags instead of lots of one-off variants.

Good examples:

- `ui`
- `api`
- `infra`
- `migration`
- `bug`
- `docs`
- `prd`
- `vertical-slice`

Avoid near-duplicates like:

- `frontend` and `ui`
- `test` and `tests`
- `prd-foo` and `foo-prd`

Pick one convention and stick to it.

#### Recommended PRD grouping convention

When a set of todos all come from the same PRD, give every one of them the same shared tag:

- `prd:<slug>`

Where `<slug>` is a lowercase, hyphenated slug derived once from the PRD title.

Example:

- PRD title: `Improved tmux session restore`
- shared tag: `prd:improved-tmux-session-restore`

Then each todo from that PRD should usually include tags like:

- `prd`
- `vertical-slice`
- `prd:improved-tmux-session-restore`

Optional extra tags can still describe the area of work, for example:

- `ui`
- `api`
- `infra`

The important part is that **all todos for the same PRD reuse the exact same `prd:<slug>` tag**.

That gives you a simple search/grouping mechanism in `/todos` and via the `todo` tool.

Examples:

```text
/todos prd:improved-tmux-session-restore
/todos improved-tmux-session-restore
```

#### Why tags are the best mechanism today

The current extension supports grouping/search via:

- title
- tags
- status
- assignment info
- body text indirectly when you inspect the todo

But it does not currently provide a dedicated structured field like `parent_prd`, `epic`, or `project`.

So if you want reliable grouping, shared tags are the recommended approach.

---

## Data model and on-disk format

### Todo file format

Each todo is stored as:

```text
<todo-dir>/<id>.md
```

Example:

```text
.pi/todos/deadbeef.md
```

The file format is:

1. a JSON object at the top
2. a blank line
3. optional Markdown body text

Example:

```md
{
  "id": "deadbeef",
  "title": "Add tests",
  "tags": ["qa", "tmux"],
  "status": "open",
  "created_at": "2026-01-25T17:00:00.000Z",
  "assigned_to_session": "session-123"
}

Investigate startup path.
Add integration coverage.
```

Important details:

- this is **JSON front matter**, not YAML
- the body is plain Markdown text
- the extension parses the leading JSON object by scanning for the matching closing `}` while respecting strings/escapes
- unreadable or malformed files are generally ignored rather than crashing the whole listing flow

The logical record is:

```ts
interface TodoRecord {
  id: string;
  title: string;
  tags: string[];
  status: string;
  created_at: string;
  assigned_to_session?: string;
  body: string;
}
```

### Settings file

Todo settings live in:

```text
<todo-dir>/settings.json
```

Current settings shape:

```json
{
  "gc": true,
  "gcDays": 7
}
```

Meaning:

- `gc`: whether to delete old closed todos on startup
- `gcDays`: age threshold in days, based on `created_at`

If the file is missing or invalid, defaults are used.

### Lock file

While editing a todo, the extension may create:

```text
<todo-dir>/<id>.lock
```

The lock payload shape is:

```ts
interface LockInfo {
  id: string;
  pid: number;
  session?: string | null;
  created_at: string;
}
```

Notes:

- `session` here is derived from `ctx.sessionManager.getSessionFile()`
- this is different from `assigned_to_session`, which uses `getSessionId()`
- locks are used to protect file mutation windows
- stale locks can be stolen interactively after a TTL check

---

## Technical overview

### Main concepts

The implementation has four big responsibilities:

1. **persistent storage** — todos live as files
2. **agent tool API** — Pi can list/read/mutate todos through the `todo` tool
3. **interactive human UI** — `/todos` gives a searchable visual manager
4. **coordination** — locks and assignment fields reduce cross-session conflicts

### Important TypeScript types

The file defines these central types:

#### `TodoFrontMatter`

Metadata that lives in the JSON block:

```ts
interface TodoFrontMatter {
  id: string;
  title: string;
  tags: string[];
  status: string;
  created_at: string;
  assigned_to_session?: string;
}
```

#### `TodoRecord`

Full todo including body:

```ts
interface TodoRecord extends TodoFrontMatter {
  body: string;
}
```

#### `TodoSettings`

Startup GC behavior:

```ts
interface TodoSettings {
  gc: boolean;
  gcDays: number;
}
```

#### `TodoToolDetails`

The typed `details` payload used for tool rendering in Pi:

- list/list-all return `{ action, todos, currentSessionId }`
- single-item actions return `{ action, todo }`
- both can include `error`

This allows the extension to render compact and expanded tool results intelligently instead of only dumping text.

### Core helper functions

A few helpers define most of the storage semantics.

#### ID normalization

- `normalizeTodoId()` accepts `#id`, `TODO-id`, or raw id
- `validateTodoId()` enforces an 8-char hex id
- `formatTodoId()` displays ids as `TODO-<hex>`

#### File parsing and serialization

- `findJsonObjectEnd()` finds the end of the leading JSON object
- `splitFrontMatter()` splits JSON front matter from Markdown body
- `parseFrontMatter()` parses metadata with safe defaults
- `parseTodoContent()` builds a `TodoRecord`
- `serializeTodo()` writes the canonical file format back to disk

#### Storage path helpers

- `getTodosDir()` resolves the todo root
- `getTodoPath()` maps `id -> <todo-dir>/<id>.md`
- `getLockPath()` maps `id -> <todo-dir>/<id>.lock`
- `getTodoSettingsPath()` maps to `settings.json`

#### Read/write helpers

- `ensureTodosDir()` creates the directory if missing
- `readTodoFile()` loads one todo
- `writeTodoFile()` persists one todo
- `ensureTodoExists()` is a small existence+read helper
- `appendTodoBody()` appends body text with spacing cleanup

### Tool behavior by action

#### Listing

`listTodos()` reads all `*.md` files, parses them, and returns sorted results.

Sort behavior favors:

1. open before closed
2. assigned before unassigned among open items
3. older `created_at` first within each group

`splitTodosByAssignment()` further separates results into:

- assigned
- open
- closed

`list` returns only assigned + open.
`list-all` returns all three groups.

#### Mutation actions

Mutation actions are serialized through `withTodoLock()`.

That wrapper:

1. acquires the lock file
2. runs the mutation callback
3. removes the lock in `finally`

Mutating actions include:

- `create`
- `update`
- `append`
- `claim`
- `release`
- `delete`
- status changes used by the UI

#### Claim/release

Assignment is separate from locking.

- **lock** = short-lived protection around a mutation
- **assignment** = longer-lived ownership signal for work coordination

That distinction is important:

- a todo can be assigned without being locked
- a todo can be locked briefly during a write without being permanently assigned

### Interactive UI behavior

The `/todos` command is not just a plain text list. It creates several small TUI components:

- `TodoSelectorComponent`
- `TodoActionMenuComponent`
- `TodoDeleteConfirmComponent`
- `TodoDetailOverlayComponent`

#### `TodoSelectorComponent`

Responsibilities:

- search input
- fuzzy filtering
- selection state
- rendering a windowed list of matching todos
- quick keyboard actions for work/refine

Search text includes:

- formatted id
- raw id
- title
- tags
- status
- assignment text

#### `TodoActionMenuComponent`

Presents actions for a selected todo:

- view
- work
- refine
- close/reopen
- release
- copy path
- copy text
- delete

#### `TodoDeleteConfirmComponent`

A minimal yes/no selector used before deletion.

#### `TodoDetailOverlayComponent`

Shows the body rendered as Markdown in an overlay.

Features:

- scroll up/down
- page navigation
- Enter to transition into “work on todo” flow
- Escape to go back

### Rendering behavior

The tool defines custom `renderCall()` and `renderResult()` functions.

This means Pi shows structured tool output rather than raw JSON blobs.

Examples:

- `list` renders grouped assigned/open/closed sections
- item actions render a summary line and, when expanded, metadata + body
- error states render in Pi’s error color
- compact mode adds a hint for the configured “expand tools” keybinding

The extension also returns plain text content for the LLM itself, so the agent still gets machine-readable JSON-like payloads to reason about.

### Concurrency and locking

Locking uses a sidecar `.lock` file and `fs.open(..., "wx")` for exclusive creation.

Important behavior:

- active locks block competing mutations
- stale locks are recognized via file age
- TTL is currently `30 minutes`
- in interactive mode, the user can confirm stealing a stale lock
- in non-interactive mode, stale locks produce an error instead of being stolen automatically

This is intentionally conservative.

### Session semantics

There are two session-related concepts in the data:

#### `assigned_to_session`

Stored in todo metadata and used as the durable ownership signal.

Source:

- `ctx.sessionManager.getSessionId()`

#### lock `session`

Stored in the lock file and used only for mutation coordination/debugging.

Source:

- `ctx.sessionManager.getSessionFile()`

Closed todos automatically clear `assigned_to_session` through `clearAssignmentIfClosed()`.

A todo is considered closed if its status is:

- `closed`
- `done`

### Garbage collection

On `session_start`, the extension does this:

1. ensures the todo directory exists
2. reads `settings.json`
3. garbage-collects old closed todos if enabled

GC rule:

- if `gc: true`
- and todo status is `closed` or `done`
- and `created_at` is older than `gcDays`
- then the todo file is deleted on startup

This means closed todos are not necessarily permanent unless you disable GC.

---

## Operational notes

- `list` intentionally hides closed todos; use `list-all` for history.
- `update` replaces fields; `append` preserves existing body text and adds to it.
- The extension ignores unreadable todo files during scans instead of failing the whole list operation.
- `assigned_to_session` is cleared automatically when status becomes closed/done.
- `/todos` is the best interface for browsing and triaging.
- The `todo` tool is the best interface for agent-driven planning and execution.

---

## Updating from upstream

This repo contains a vendored local copy, not a package dependency.

To update safely:

1. fetch the latest upstream `todos.ts`
2. diff it against `agent/extensions/todos/index.ts`
3. preserve any local compatibility fixes needed for this Pi version
4. reload Pi and test `/todos`

Do **not** blindly overwrite the local file unless you also verify compatibility with the currently installed Pi APIs.
