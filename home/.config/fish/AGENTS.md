# FISH SHELL CONFIG

Layered: `config.fish` → `conf.d/*.fish` (auto) → `functions/*.fish` (lazy)

## STRUCTURE

```
fish/
├── config.fish         # Core: greeting, EDITOR, PATH additions
├── conf.d/             # Auto-sourced config fragments
│   ├── aliases.fish    # Shell aliases (c, code, pn, oc, wr)
│   ├── paths.fish      # PATH modifications
│   ├── git.fish        # Git abbreviations init
│   ├── brew.fish       # Homebrew setup
│   └── ...             # Tool-specific (fnm, bun, zoxide, starship)
├── functions/          # Lazy-loaded functions
│   ├── __git.*.fish    # Internal git helpers
│   ├── gwip.fish       # WIP commit
│   └── ...             # Utilities (uuid, timer, notify)
└── completions/        # Command completions
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add alias | `conf.d/aliases.fish` |
| Add PATH | `conf.d/paths.fish` |
| Add function | `functions/<name>.fish` |
| Git abbr | `functions/__git.init.fish` (180+ abbrs) |
| Tool setup | `conf.d/<tool>.fish` |

## CONVENTIONS

- Functions use `-d "description"` flag
- Private helpers prefix `__` (e.g., `__git.default_branch`)
- Fallback chains for cross-platform compat
- Fisher for plugin management (`fish_plugins`)

## ANTI-PATTERNS

- Heavy work in `config.fish` (use `conf.d/` fragments)
- Blocking commands at startup (defer to function)
- Global vars without `set -gx`

## KEY ALIASES

| Alias | Expands To |
|-------|------------|
| `c` | clear |
| `code`/`vim`/`vi` | nvim (with `.` default) |
| `pn` | pnpm |
| `oc` | opencode |
| `wr` | wrangler |

## GIT ABBREVIATIONS

~180 oh-my-zsh style abbrs loaded via `__git.init`:
- Basic: `g`, `gst`, `gd`, `ga`, `gc`, `gp`, `gl`
- Branch: `gb`, `gco`, `gcb`, `gbd`, `gbD`
- Rebase: `grb`, `grbi`, `grbm`, `grbom`
- Flow: `gff`, `gfbs`, `gfp`

## CUSTOM FUNCTIONS

| Function | Purpose |
|----------|---------|
| `gwip`/`gunwip` | Create/undo WIP commit |
| `gbda` | Delete merged branches (incl. squashed) |
| `fvim` | fzf → nvim |
| `uuid`/`ulid` | Generate IDs |
| `timer N` | Countdown with notification |
| `scratch` | Temp file in editor |
