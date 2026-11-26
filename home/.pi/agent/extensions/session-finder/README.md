# session-finder

Telescope-style search over pi sessions.

| Command | Searches |
|---|---|
| `/find [query]` | The current session, every branch (in memory) |
| `/find-all [query]` | Every session on this device (SQLite index) |

## Keys

| Key | Action |
|---|---|
| typing | Filter (every term must appear; smart case) |
| ↑ / ↓, C-p / C-n, C-k / C-j | Move through results (best match sits next to the prompt) |
| PgUp / PgDn | Move a page |
| C-u / C-d | Scroll the preview |
| Tab / S-Tab | Cycle role filter: all → user → llm → tools |
| C-s | Switch scope: current session ↔ all sessions |
| Enter | Open (see below) |
| Esc, C-c | Close |

## Query syntax

```
u:  user:              user messages
a:  llm:  assistant:   assistant text
t:  tool:  t:bash      tool calls + results (optionally one tool)
tc: call:  tc:edit     tool calls only
tr: result: tr:bash    tool results only
cwd:dotfiles           sessions whose cwd contains "dotfiles" (all-sessions scope)
"two words"            one literal term
```

In the current session, a query with no literal match falls back to fuzzy
matching on the start of each message.

## Enter

- **Current session, on the active branch:** scrolls the fullscreen transcript to the message.
- **Current session, another branch:** asks, then `navigateTree` to it (no summary), then scrolls.
- **Another session:** asks, then `switchSession`; if the message is on another
  branch there, asks again before switching branch; then scrolls.

Scrolling only works in fullscreen mode. In regular mode the terminal owns
scrollback, so the preview is the way to read a match.

## How it works

```
index.ts           commands, Enter handling (confirm → navigateTree / switchSession → reveal)
picker.ts          overlay UI: results, prompt, preview
current-search.ts  in-memory search over ctx.sessionManager.getEntries()
index-client.ts    main-thread handle to the worker (one per pi process, on globalThis)
worker.ts          worker thread owning the SQLite index
index-store.ts     indexer + search + preview over node:sqlite
extract.ts         session entry → searchable parts (shared with the worker)
query.ts           query parsing, trigram MATCH building, verification (shared)
reveal.ts          scrolls pi's transcript (private internals, see below)
```

- **Index:** `~/.pi/agent/cache/session-finder/index.sqlite` (roughly 0.25 bytes
  per byte of message text; safe to delete, it rebuilds). Contentless FTS5 with
  the trigram tokenizer and `detail=none`, so the text is not stored twice: hits
  are verified, and previews read, by re-reading the JSONL line at its byte offset.
- **Indexed:** user text, assistant text (not thinking), each tool call
  (`name: primary-arg` + other args), full tool results, user `!` commands.
- **Incremental:** pi only appends to session files, so each file is indexed from
  its stored byte offset. A file that shrank or changed inode is re-indexed.
  Deleted files drop out. Indexing runs on `/find-all` and 15 s after pi starts.
- **Queries:** each term is split into trigrams, ANDed in FTS5 (phrase queries need
  `detail=full`), then every candidate is checked against the real text.
  The worker yields between files, so searches stay responsive while indexing.
- **Concurrency:** several pi processes share the index. Each file is indexed
  inside `BEGIN IMMEDIATE` after re-reading its row, so no file is indexed twice.
- **Worker loading:** `worker.ts` runs under Node's native type stripping, so it
  and its imports (`index-store.ts`, `extract.ts`, `query.ts`) must use erasable
  syntax only (`erasableSyntaxOnly` in tsconfig) and must not import pi packages.

## reveal.ts is fragile

Pi (1.6) has no API to scroll the transcript. `reveal.ts` walks
`tui.layoutRoot` → primary `ScrollView` → document/chat `Container`s, finds the
message component (`messageId`, `toolCallId`, or timestamp/text for live
messages), sums rendered line counts above it, and calls `scrollTo`. Every step
is duck-typed; if pi's layout changes it reports "unsupported" and the preview
still works. Replace it with a public API (`ctx.ui.revealEntry(entryId)`) if
pi adds one.
