# Canonicalize Tailwind

Use this when the user wants to clean up, canonicalize, or normalize Tailwind class lists.

## Activation

Activate when the user asks to:

- clean up Tailwind classes
- canonicalize Tailwind utility lists
- sort, normalize, or deduplicate Tailwind classes
- resolve conflicting Tailwind utilities in class strings

Do not activate when:

- the user wants a new design or layout
- the request is about component extraction or code organization
- the request is about visual changes rather than class-list cleanup

## User-facing progress updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Use `npx @tailwindcss/cli canonicalize` to clean up Tailwind class lists — collapses shorthands (`mt-2 mr-2 mb-2 ml-2` → `m-2`), resolves overrides (`py-3 p-1 px-3` → `p-3`), canonicalizes arbitrary values to named utilities, and sorts classes; pass `--css path/to/input.css` if the project uses a custom CSS entry file

  Single class string:

  ```sh
  npx @tailwindcss/cli canonicalize "mt-2 mr-2 mb-2 ml-2"
  # m-2
  ```

  Multiple class strings as positional args (each returned on its own line):

  ```sh
  npx @tailwindcss/cli canonicalize "py-3 p-1 px-3" "mt-2 mr-2 mb-2 ml-2"
  # p-3
  # m-2
  ```

  Pipe class strings via stdin (one per line):

  ```sh
  echo "py-3 p-1 px-3\nmt-2 mr-2 mb-2 ml-2" | npx @tailwindcss/cli canonicalize
  # p-3
  # m-2
  ```

  Use `--format json` or `--format jsonl` for structured output with `input`/`output`/`changed` fields:

  ```sh
  npx @tailwindcss/cli canonicalize --format json "py-3 p-1 px-3"
  # [{ "input": "py-3 p-1 px-3", "output": "p-3", "changed": true }]
  ```

  Use `--stream` to process stdin line-by-line without buffering:

  ```sh
  npx @tailwindcss/cli canonicalize --stream
  ```
