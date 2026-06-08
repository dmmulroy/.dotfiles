# Pi Scratchpad Tech Spec

Pi Scratchpad is a Pi extension for storing Markdown scratchpad files and including them in future Pi requests through explicit `@scratchpad/...` references.

## Goals

- Persist arbitrary Markdown as durable scratchpad files.
- Support both project-local and global scratchpad scopes.
- Let the user save the last assistant message as a scratchpad file before navigating away with `/tree`.
- Let the user browse, view, edit, create, and delete scratchpad files from Pi.
- Let the user reference scratchpad files with `@scratchpad/...` and automatically include a bounded snapshot of the file in the next agent request.
- Prefer Glimpse for rich UI when available, falling back to Pi TUI.

## Non-goals

- No agent-facing `scratchpad` tool in v1.
- No front matter or metadata block in scratchpad files.
- No automatic background autosave in the editor.
- No browser-tab fallback for the UI.
- No live hydration of scratchpad references on every model request.

## Language

These terms are canonical and should stay aligned with `CONTEXT.md`.

- **Scratchpad file**: a persisted Markdown document used to carry human- or agent-curated context across branches, sessions, or projects.
- **Scratchpad scope**: the availability boundary of a scratchpad file, either project-specific or global.
- **Project scratchpad file**: a scratchpad file available within the project where it was created.
- **Global scratchpad file**: a scratchpad file available across projects.
- **Scratchpad reference**: a user-facing mention that includes a scratchpad file in a request.
- **Scratchpad snapshot**: the copy of a scratchpad file's contents included in a request when a scratchpad reference is submitted.

## Storage model

Scratchpad files are plain Markdown files. The filename is the stable ID.

### Directories

- Project scope: `<cwd>/.pi/scratchpad/`
- Global scope: `~/.pi/agent/scratchpad/`

The containing directory determines scope. There is no `scope` field inside the Markdown file.

### File format

A scratchpad file is just Markdown:

```md
# Research summary

Notes go here.
```

No YAML front matter, JSON front matter, sidecar metadata, or embedded bookkeeping is required in v1.

### Timestamps

Use filesystem metadata for display and sorting:

- creation-ish display: `birthtime` where available, otherwise `ctime`
- updated display: `mtime`

Do not write timestamps into the Markdown file.

### Filename format

New files use:

```text
YYYY-MM-DD-short-descriptive-slug.md
```

Examples:

```text
2026-06-06-rsc-research.md
2026-06-06-agent-handoff-notes.md
```

Collision behavior:

```text
2026-06-06-rsc-research.md
2026-06-06-rsc-research-2.md
2026-06-06-rsc-research-3.md
```

Renaming a file changes its ID. That is acceptable for v1.

## Scope behavior

Project scope is the default.

- `/scratchpad new "Title"` creates a project scratchpad file.
- `/scratchpad new --global "Title"` creates a global scratchpad file.
- `/scratchpad save-last "Title"` creates a project scratchpad file.
- `/scratchpad save-last --global "Title"` creates a global scratchpad file.

The browser/editor UI should show both scopes by default and visibly badge each file as `project` or `global`.

## Scratchpad references

Scratchpad references use the `@scratchpad/...` namespace.

### Supported forms

```text
@scratchpad/foo
@scratchpad/project/foo
@scratchpad/global/foo
@scratchpad/project/2026-06-06-rsc-research.md
@scratchpad/global/agent-style-guide.md
```

### Resolution rules

- `@scratchpad/project/...` searches only project scope.
- `@scratchpad/global/...` searches only global scope.
- `@scratchpad/...` without an explicit scope searches project first, then global.
- Autocomplete should prefer inserting explicit scoped references:
  - `@scratchpad/project/<filename>.md`
  - `@scratchpad/global/<filename>.md`

### Match rules

A reference may match either:

- a full filename, with or without `.md`
- a unique prefix of a filename

If a reference is ambiguous within its search scope, injection should fail with a visible error that lists the matching candidates.

If no file matches, injection should fail with a visible error.

## Snapshot injection

Scratchpad references automatically include file contents in the agent request.

This is a **submit-time snapshot**, not live hydration. See `docs/adr/0001-snapshot-scratchpad-references.md`.

### Why snapshot instead of live hydration

- Preserves the exact content the agent saw.
- Keeps resumed/exported sessions auditable.
- Avoids hidden changes in behavior after editing a scratchpad file.
- Is friendlier to prompt caching than re-reading mutable files before every model request.

### Session representation

The visible user message should stay clean:

```text
Continue from @scratchpad/project/2026-06-06-rsc-research.md
```

The extension should add a companion custom message for the turn:

```ts
{
  customType: "scratchpad-snapshot",
  display: true,
  content: "Scratchpad snapshot: project/2026-06-06-rsc-research.md (4.2 KB)",
  details: {
    snapshots: [
      {
        scope: "project",
        reference: "@scratchpad/project/2026-06-06-rsc-research.md",
        filename: "2026-06-06-rsc-research.md",
        path: "/absolute/path/to/.pi/scratchpad/2026-06-06-rsc-research.md",
        offset: 1,
        limit: undefined,
        content: "...included markdown...",
        truncated: false,
        totalLines: 42,
        shownLines: 42
      }
    ]
  }
}
```

The message should be included in LLM context. It should render compactly in TUI, with expansion showing the snapshot contents when possible.

### Suggested injected content format

The custom message content sent to the model should include the actual Markdown, for example:

```xml
<scratchpad file="project/2026-06-06-rsc-research.md" offset="1">
# Research summary

...
</scratchpad>
```

For multiple references, include one `<scratchpad>` block per resolved file.

## Snapshot truncation and continuation

Scratchpad snapshot reads should mirror the built-in `read` tool behavior.

Defaults:

- max lines: `2000`
- max bytes: `50 KB`
- whichever limit is hit first

### Offset and limit

Scratchpad references support query parameters:

```text
@scratchpad/project/foo.md?offset=743
@scratchpad/project/foo.md?offset=743&limit=500
```

Semantics match `read`:

- `offset` is a 1-indexed starting line number.
- `limit` is a maximum number of lines.
- the 50 KB byte cap still applies even when `limit` is provided.

### Truncation message

When truncated, append copyable continuation instructions to the injected snapshot:

```text
[Showing lines 1-742 of 1200 (50KB limit). Use @scratchpad/project/foo.md?offset=743 to continue.]
```

If a user-provided `limit` stops before EOF:

```text
[150 more lines in file. Use @scratchpad/project/foo.md?offset=501 to continue.]
```

Do not silently truncate without a continuation notice.

### First-line-too-large behavior

If the first selected line alone exceeds the 50 KB cap, mirror `read`'s explicit warning style. The snapshot should not pretend useful content was included.

Example:

```text
[Line 1 is 88KB, exceeds 50KB limit. Split the scratchpad file or inspect it with shell/editor tooling.]
```

## Commands

Register one namespace command:

```text
/scratchpad
```

### `/scratchpad`

Open the scratchpad browser/editor UI.

The UI should support:

- list project and global scratchpad files
- filter/search by filename and content preview if cheap enough
- view rendered Markdown
- edit Markdown
- create a new scratchpad file
- delete a scratchpad file after confirmation
- copy a scratchpad reference
- insert a scratchpad reference into the Pi editor

### `/scratchpad new [--global] [title]`

Create a new empty scratchpad file.

Behavior:

1. Determine scope (`project` by default, `global` if `--global`).
2. Generate filename from title or fallback title.
3. Open editor with empty or minimal Markdown body.
4. Save only on explicit user save.

### `/scratchpad save-last [--global] [title]`

Save the most recent assistant message on the current branch as a scratchpad file.

Behavior:

1. Find the latest assistant message in `ctx.sessionManager.getBranch()`.
2. Extract text blocks only.
3. Exclude thinking blocks and tool calls.
4. Determine title:
   - explicit title argument if provided
   - first Markdown heading from content if present
   - fallback such as `research-summary`
5. Generate filename.
6. Open editor prefilled with extracted content before saving.
7. Save only on explicit user save.

If there is no assistant text message, show a warning and do not create a file.

## UI strategy

Use Glimpse when available; fall back to Pi TUI.

### Glimpse detection

Follow the `pi-interview` detection pattern:

1. Try resolving `glimpseui` relative to the extension using `createRequire(import.meta.url).resolve("glimpseui")`.
2. If not found, try global npm root:
   - run `npm root -g`
   - check `<global-root>/glimpseui/src/glimpse.mjs`
3. Dynamically import the resolved module.
4. Cache the result (`open` function or unavailable) for the process lifetime.

Do not make `glimpseui` a hard dependency.

### UI mode override

Support an environment override:

```sh
PI_SCRATCHPAD_UI=auto     # default: try Glimpse, fall back to TUI
PI_SCRATCHPAD_UI=glimpse  # require Glimpse; show error if unavailable
PI_SCRATCHPAD_UI=tui      # skip Glimpse
```

### Glimpse implementation

Use inline HTML with bidirectional message passing. Do not start a local HTTP server in v1.

Pattern:

```ts
const win = open(html, {
  width: 1000,
  height: 800,
  title: "Pi Scratchpad"
});

win.on("message", async (msg) => {
  switch (msg.action) {
    case "list":
      win.send(`window.receiveScratchpads(${JSON.stringify(await listScratchpads())})`);
      break;
    case "read":
      win.send(`window.receiveScratchpad(${JSON.stringify(await readScratchpad(msg))})`);
      break;
    case "save":
      await writeScratchpad(msg);
      win.send(`window.saved(${JSON.stringify({ ok: true })})`);
      break;
  }
});
```

Glimpse UI should provide:

- file list with scope badges
- Markdown editor
- Markdown preview
- dirty indicator
- `Cmd/Ctrl+S` save
- close confirmation when dirty, where possible
- copy reference button
- insert reference action back into Pi editor when invoked from command context

### Pi TUI fallback

Use `ctx.ui.custom()` with overlay mode where appropriate.

Fallback UI should provide the same core actions, even if less polished:

- searchable file list
- Markdown detail view
- editor via Pi's multiline editor or custom component
- explicit save/cancel
- copy/insert reference actions

## Editing semantics

Editing is explicit-save only.

- No debounce autosave.
- No background writes while typing.
- Dirty state should be visible.
- Closing with dirty changes should prompt for confirmation when the UI supports it.
- Save writes the full Markdown file atomically where practical.

## Autocomplete

Use `ctx.ui.addAutocompleteProvider()` on `session_start`.

Behavior:

- Trigger on `@scratchpad` / `@scratchpad/` / scoped prefixes.
- Suggest both project and global scratchpad files.
- Show scope in the description or label.
- Insert explicit scoped references.
- Delegate to the existing autocomplete provider for all other prefixes.

Example suggestions:

```text
@scratchpad/project/2026-06-06-rsc-research.md    project
@scratchpad/global/agent-style-guide.md           global
```

## Implementation outline

Recommended location:

```text
agent/extensions/pi-scratchpad/
├── package.json
├── index.ts
├── storage.ts
├── references.ts
├── truncate.ts
├── glimpse.ts
├── tui.ts
└── ui-html.ts
```

### `storage.ts`

Responsibilities:

- resolve project/global directories
- ensure directories exist lazily
- list scratchpad files
- create filenames
- read/write/delete files
- produce display metadata from filesystem stats

### `references.ts`

Responsibilities:

- parse `@scratchpad/...` references from prompt text
- parse query parameters
- resolve references to exact files
- detect ambiguity and missing files
- build snapshot records

### `truncate.ts`

Responsibilities:

- mirror `read` truncation defaults and behavior
- line offset/limit handling
- continuation notice generation using `@scratchpad/...?...`

### `glimpse.ts`

Responsibilities:

- pi-interview-style Glimpse detection
- environment override handling
- open inline HTML UI
- bridge messages to storage operations

### `tui.ts`

Responsibilities:

- Pi TUI browser/editor fallback
- compact snapshot message renderer if not kept in `index.ts`

### `index.ts`

Responsibilities:

- register `/scratchpad` command
- register autocomplete provider
- register `scratchpad-snapshot` message renderer
- hook `before_agent_start` to parse references and inject companion snapshot messages

## Event/API plan

### Reference injection

Use `before_agent_start` rather than `input` for snapshot injection.

Reason: `before_agent_start` can return a companion custom message while leaving the user message unchanged.

Sketch:

```ts
pi.on("before_agent_start", async (event, ctx) => {
  const refs = parseScratchpadReferences(event.prompt);
  if (refs.length === 0) return;

  const snapshots = await buildSnapshots(refs, ctx.cwd);

  return {
    message: {
      customType: "scratchpad-snapshot",
      display: true,
      content: renderSnapshotContext(snapshots),
      details: { snapshots },
    },
  };
});
```

The custom message participates in the LLM context for that turn and is persisted in the session.

### Snapshot renderer

Register a compact renderer:

```ts
pi.registerMessageRenderer("scratchpad-snapshot", (message, options, theme) => {
  // collapsed: "Scratchpad snapshot: 2 files (18.4 KB)"
  // expanded: include file names and snapshot content/truncation notices
});
```

## Error handling

Reference errors should stop or clearly alter the request rather than silently omitting context.

Recommended behavior:

- Missing reference: inject a visible error custom message and do not include a fake snapshot.
- Ambiguous reference: inject a visible error listing candidates.
- Invalid query params: visible error with expected syntax.
- Unreadable file: visible error with filesystem message.

If Pi supports cancelling from `before_agent_start`, cancel. If not, inject an explicit error block so the agent knows the intended scratchpad context was not available.

## Security and safety

- Only resolve files inside the project/global scratchpad directories.
- Prevent path traversal (`..`) from escaping scratchpad directories.
- Treat symlinks carefully: either disallow symlink targets outside the scratchpad directory or resolve and enforce containment.
- Do not execute Markdown content.
- Glimpse HTML must escape all file/content data before rendering.
- The Glimpse bridge should accept only known message actions and validate payloads.

## Testing plan

### Unit tests

- slug generation
- collision suffixing
- scope directory resolution
- reference parsing
- explicit scope resolution
- project-first unscoped resolution
- ambiguity errors
- query param parsing
- offset/limit behavior
- truncation continuation notices
- path traversal rejection

### Integration-ish tests

- `save-last` extracts only assistant text blocks
- `before_agent_start` injects one snapshot message for one reference
- multiple references produce multiple snapshot blocks
- truncated snapshot includes copyable continuation reference
- autocomplete delegates for non-scratchpad prefixes

### Manual tests

- `/scratchpad` opens Glimpse when `glimpseui` is installed
- `PI_SCRATCHPAD_UI=tui` forces TUI fallback
- `PI_SCRATCHPAD_UI=glimpse` reports a useful error when Glimpse is missing
- create/edit/save project scratchpad
- create/edit/save global scratchpad
- copy/insert reference
- reference a scratchpad, then `/tree` away and continue with the snapshot present

## Open implementation questions

These are intentionally left for implementation-time discovery rather than product semantics:

- Whether Pi's custom message renderer expansion affordance is sufficient for full snapshot display or needs a custom detail overlay.
- Whether Glimpse should be attempted on every platform where `glimpseui` imports successfully, or initially limited to macOS like `pi-interview`.
- Whether project scratchpad directory should be based strictly on `ctx.cwd` or a detected VCS root. V1 should use `ctx.cwd` unless implementation discovers Pi already exposes a better project root concept.
