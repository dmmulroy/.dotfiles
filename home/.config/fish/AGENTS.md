# FISH SHELL CONFIG

**Generated:** 2026-01-29T00:00:00Z
**Commit:** f2997bb

Layered: `config.fish` -> `conf.d/*.fish` (auto) -> `functions/*.fish` (lazy)

## STRUCTURE

```
fish/
├── config.fish         # Core: greeting, EDITOR, PATH additions
├── conf.d/             # Auto-sourced config fragments
│   ├── aliases.fish    # Shell aliases (c, code, pn, oc, wr)
│   ├── paths.fish      # PATH modifications
│   ├── git.fish        # Git abbreviations init
│   ├── brew.fish       # Homebrew setup
│   ├── opencode.fish   # Experimental feature flags
│   └── ...             # Tool-specific (fnm, bun, zoxide, starship)
├── functions/          # Lazy-loaded functions
│   ├── __git.*.fish    # Internal git helpers
│   ├── gwip.fish       # WIP commit
│   └── ...             # Utilities (uuid, timer, notify)
└── completions/        # Command completions (dot, bun, wrangler)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add alias | `conf.d/aliases.fish` |
| Add PATH | `conf.d/paths.fish` |
| Add function | `functions/<name>.fish` |
| Git abbr | `functions/__git.init.fish` (180+ abbrs) |
| Tool setup | `conf.d/<tool>.fish` |
| Completions | `completions/<cmd>.fish` |

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
| `code`/`vim`/`vi` | nvim (with `.` default) |
| `pn` | pnpm |
| `oc` | opencode |
| `wr` | wrangler |
| `lc` | localcode (dev opencode) |
| `ks` | tmux kill-server |
| `pbc`/`pbp` | pbcopy/pbpaste |

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
| `fvim [query]` | fzf -> nvim |
| `uuid`/`ulid` | Generate IDs |
| `timer <duration>` | Countdown with notification (5s, 10m, 1h) |
| `notify <msg>` | Desktop notification |
| `scratch` | Temp file in editor |
| `tempd` | cd into new temp directory |
| `trash <file>` | Safe delete to ~/.Trash |
| `httpstatus <code>` | HTTP status lookup (supports wildcards) |

## OPENCODE FLAGS

```fish
# conf.d/opencode.fish
OPENCODE_EXPERIMENTAL_LSP_TOOL=1
OPENCODE_EXPERIMENTAL_PLAN_MODE=1
OPENCODE_ENABLE_EXA=1
```
