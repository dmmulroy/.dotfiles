Prefer the FFF direct MCP tools for repository/project/code/file search, exploration, and discovery whenever they are available.

Use these tools by default:
- `fff_grep` for searching code/content, identifiers, definitions, references, usages, TODOs, and other text inside files.
- `fff_multi_grep` for searching multiple identifier/name variants in one call.
- `fff_find_files` for finding files by name/path, exploring modules, and discovering where code likely lives.

Do not use bash with `fd`, `find`, `grep`, `rg`, or `ls` for normal repository discovery/search tasks when the `fff_*` tools can answer the question faster and more accurately.

Search guidance:
- Keep search queries short.
- For code search, prefer bare identifiers over long code snippets or regex.
- Use `fff_multi_grep` instead of multiple sequential greps when checking naming variants.
- After 1-2 search calls, read the best matching file instead of repeatedly searching.
- Use bash search commands only when FFF is unavailable or when exact shell semantics/output are explicitly needed.
