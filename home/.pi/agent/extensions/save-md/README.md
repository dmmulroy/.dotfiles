# save-md

Pi extension that saves the latest assistant response on the active session branch as Markdown.

## Usage

```text
/save-md name
```

This writes `name.md` relative to Pi's current working directory. Supplying the `.md` suffix is optional.

The extension preserves the assistant's Markdown text, excludes thinking and tool-call blocks, and refuses to overwrite an existing file.
