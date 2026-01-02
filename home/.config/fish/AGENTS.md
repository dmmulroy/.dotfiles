# Fish Shell Configuration

## Purpose & Scope
Fish shell environment, aliases, functions, and tool integrations. Owns: shell startup, PATH, aliases, custom functions, completions. Does NOT own: tool-specific configs (git, nvim, etc. have their own).

## Entry Points & Contracts
- `config.fish` — Entry point: greeting, EDITOR, base PATH
- `conf.d/*.fish` — Auto-sourced configs (aliases, tool integrations)
- `functions/*.fish` — Custom functions (lazy-loaded)
- `completions/*.fish` — Shell completions
- `fish_plugins` — Fisher plugin list

## Dependencies
- Fisher (plugin manager)
- Tools initialized in conf.d: fnm, zoxide, starship, bun, rustup, brew
- jhillyerd/plugin-git (provides `__git.*` functions)

## Usage Patterns
```fish
vim              # Opens nvim (current dir if no args)
fvim             # Fuzzy-find file, open in nvim
scratch          # Open temp file in editor
tempd            # cd into temp directory
gwip / gunwip    # Create/undo WIP commits
uuid / ulid      # Generate IDs
nato <text>      # NATO phonetic alphabet
httpstatus <code> # HTTP status code lookup
```

## Anti-Patterns
- Don't edit completions manually — `dot completions` regenerates them
- Don't assume conf.d load order — files load alphabetically

## Patterns & Pitfalls
- **vim/vi/code all map to nvim** — no separate vim installed
- **`__git.*` functions from plugin-git** — not custom, sourced via git.fish
- **Catppuccin theme** in conf.d — consistent with nvim/tmux/ghostty
- **OrbStack integration** sourced in config.fish (auto-added, safe to keep)
- **Startup is fast** — use `dot benchmark-shell` to verify
