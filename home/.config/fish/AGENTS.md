# FISH SHELL CONFIG

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

Layered: `config.fish` -> `conf.d/*.fish` (auto) -> `functions/*.fish` (lazy)

## STRUCTURE

```
fish/
├── config.fish         # Core: greeting, EDITOR, MANPAGER, dotfiles PATH
├── conf.d/             # Auto-sourced config fragments (17 files)
│   ├── aliases.fish    # Shell aliases (c, code, pn, wr)
│   ├── paths.fish      # PATH modifications (.dotfiles, .local/bin, ghostty)
│   ├── git.fish        # Git abbreviations init
│   ├── brew.fish       # Homebrew setup
│   ├── tmux_keys.fish  # CSI-u Shift+Enter workaround for tmux extended-keys
│   ├── vite-plus.fish  # Sources Vite+ env
│   ├── starship.fish   # Starship prompt init
│   ├── secrets.fish    # Env tokens (GITIGNORED)
│   └── ...             # Tool-specific (bun, zoxide, rustup, orbstack)
├── functions/          # Lazy-loaded functions (31 files)
│   ├── __git.*.fish    # Internal git helpers (5 files)
│   ├── gwip.fish       # WIP commit
│   └── ...             # Utilities (uuid, ulid, timer, notify, nato, rn)
└── completions/        # Command completions (dot, bun, wrangler, kubectl, vp)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add alias | `conf.d/aliases.fish` |
| Add PATH | `conf.d/paths.fish` |
| Add function | `functions/<name>.fish` (1 function per file) |
| Git abbr | `functions/__git.init.fish` (180+ abbrs) |
| Tool setup | `conf.d/<tool>.fish` |
| Completions | `completions/<cmd>.fish` |
| Env secrets | `conf.d/secrets.fish` (gitignored) |

## CONVENTIONS

- Functions use `-d "description"` flag (mandatory)
- Private helpers prefix `__` (e.g., `__git.default_branch`)
- Namespace pattern: `__<namespace>.<function>` (dot-separated)
- Fallback chains for cross-platform compat (uuidgen -> python3 -> node)
- Fisher for plugin management (`fish_plugins`)
- Use `fish_add_path` not manual `set PATH`
- Use `set -gx` for global exports

## ANTI-PATTERNS

- Heavy work in `config.fish` (use `conf.d/` fragments)
- Blocking commands at startup (defer to function)
- Global vars without `set -gx`
- Using `~` in scripts (use `$HOME`)

## KEY ALIASES

| Alias | Expands To |
|-------|------------|
| `c` | clear |
| `code` | vim (which maps to nvim) |
| `vim`/`vi` | nvim with `.` default (defined in `conf.d/functions.fish`) |
| `pn` | pnpm |
| `wr` | wrangler |
| `ks` | tmux kill-server |
| `pbc`/`pbp` | pbcopy/pbpaste |
| `scratch` | nvim with nofile buftype |

## GIT ABBREVIATIONS

~180 oh-my-zsh style abbrs loaded via `__git.init`:
- Basic: `g`, `gst`, `gd`, `ga`, `gc`, `gp`, `gl`
- Branch: `gb`, `gco`, `gcb`, `gbd`, `gbD`, `gcom` (checkout default)
- Rebase: `grb`, `grbi`, `grbm`, `grbom` (fetch origin main + rebase)
- Amend: `gc!`, `gcan!`
- Push: `gp!` (force-with-lease), `gpu` (set-upstream)
- Stash: `gsta`, `gstp`
- Worktree: `gwt*`

## CUSTOM FUNCTIONS

| Function | Purpose |
|----------|---------|
| `gwip`/`gunwip` | Create/undo WIP commit |
| `gbda` | Delete merged branches (incl. squash-merged) |
| `git_rebase_stack`/`gstk` | Rebase PR stack, auto-detects via gh |
| `gtest <cmd>` | Test command against staged changes only |
| `gbage` | List branches by age |
| `grename <old> <new>` | Rename branch locally + remote |
| `fvim [query]` | fzf → nvim |
| `uuid`/`ulid` | Generate IDs |
| `timer <duration>` | Countdown with notification (5s, 10m, 1h) |
| `notify <msg>` | Desktop notification |
| `tempd` | cd into new temp directory |
| `trash <file>` | Safe delete to ~/.Trash |
| `httpstatus <code>` | HTTP status lookup (supports wildcards) |
| `nato <text>` | Convert text to NATO phonetic alphabet |
| `rn` | Right now — current time + calendar |

## TMUX CSI-U WORKAROUND

`conf.d/tmux_keys.fish` binds `\e[13;2u` (Shift+Enter CSI-u) to `execute` inside tmux. Required because tmux `extended-keys always` sends CSI-u to ALL programs, but fish doesn't natively handle them. Only needed inside tmux; TUI apps (pi, nvim) parse CSI-u natively.

## NOTES

- `secrets.fish` + `vault-funcs.fish` are gitignored — contain sensitive tokens
- `fish_frozen_key_bindings.fish` exists in conf.d — prevents fish from re-generating bindings
- `catppuccin_macchiato_theme.fish` sets shell colors to match global theme
- `config.fish` is minimal: greeting off, EDITOR=nvim, MANPAGER=nvim, dotfiles PATH
