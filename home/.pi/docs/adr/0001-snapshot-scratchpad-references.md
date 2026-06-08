# Snapshot scratchpad references when submitted

Scratchpad references will include a snapshot of the referenced Markdown file at message submission time rather than hydrating the current file contents on every model request. This preserves the exact context used by the session and avoids repeatedly perturbing prompt-cache inputs when scratchpad files change, at the cost of requiring the user to reference a scratchpad file again when they want updated contents.
