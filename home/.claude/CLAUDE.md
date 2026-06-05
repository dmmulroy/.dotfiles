# CLAUDE WORKSPACE

Global Claude Code configuration, managed via dotfiles.

## STRUCTURE

```
~/.dotfiles/home/.claude/   # dotfiles source (stowed to ~/.claude)
├── package.json            # npm workspace root: workspaces = ["skills/*"]
├── tsconfig.json           # Strict, bundler mode, ESNext, noEmit
├── .gitignore
├── settings.json           # Model, effort level, plugins, MCP servers
├── CLAUDE.md               # This file — global agent instructions
└── skills/                 # Custom TypeScript skills (workspace packages)

~/.claude/                  # live directory (stow target)
├── skills/                 # Symlinks into ~/.dotfiles/home/.claude/skills/
└── memory/                 # Per-project persistent memory (runtime, not in dotfiles)
```

Dotfiles source: `~/.dotfiles/home/.claude/`

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Change effort level or plugins | `settings.json` |
| Add/remove MCP servers | `settings.json` → `mcpServers` |
| Add a skill | `skills/<name>/` (stow symlinks it to `~/.claude/skills/<name>`) |
| Project-specific instructions | `.claude/CLAUDE.md` inside the repo |

## CONVENTIONS

- TypeScript preferred over JavaScript for new files
- ESM-first; avoid CommonJS unless the project requires it
- No comments unless the WHY is non-obvious
- Prefer editing existing files over creating new ones
- No summary paragraphs at the end of responses

## ANTI-PATTERNS

- Never commit secrets, tokens, or API keys
- Never amend commits that have already been pushed
- Never use `--no-verify` unless explicitly requested
- Never add features or abstractions beyond what the task requires
- Never run destructive git operations without explicit confirmation

## KEY SETTINGS

```jsonc
// settings.json
{
  "effortLevel": "high",
  "enabledPlugins": {
    "gopls-lsp@claude-plugins-official": true,
    "atlassian@claude-plugins-official": true
  }
}
```

## NOTES

- Skills in `~/.claude/skills/` are available globally in all projects
- Project-level `.claude/CLAUDE.md` takes precedence over this file for project-specific rules
- MCP servers use OAuth; re-authenticate via `/mcp` if a server shows as disconnected
