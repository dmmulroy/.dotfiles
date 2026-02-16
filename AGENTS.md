# DOTFILES

**Generated:** 2026-01-29T00:00:00Z
**Commit:** f2997bb

macOS dev env via GNU Stow. Fish + Neovim + Tmux + Git + jj.

## STRUCTURE

```
.dotfiles/
├── dot                 # CLI: init/update/doctor/stow/package (2500 lines bash)
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── tmux/           # Multiplexer + TPM plugins
│   ├── git/            # Conditional work config
│   ├── jj/             # Jujutsu VCS + intent-check hook
│   ├── opencode/       # AI agent config (AGENTS.md)
│   └── ghostty/        # Terminal
├── packages/
│   ├── bundle          # Base Brewfile (29 formulas, 12 casks)
│   └── bundle.work     # Work additions (formulas only)
└── docs/
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add package | `dot package add <name>` or edit `packages/bundle` |
| Shell alias/abbr | `home/.config/fish/conf.d/aliases.fish` |
| Shell function | `home/.config/fish/functions/` |
| Git alias | `home/.config/git/config` [alias] section |
| Neovim plugin | `home/.config/nvim/lua/plugins/<name>.lua` |
| Neovim keymap | `home/.config/nvim/lua/dmmulroy/keymaps.lua` |
| Tmux binding | `home/.config/tmux/tmux.conf` |
| jj alias | `home/.config/jj/config.toml` [aliases] |
| Work git identity | Auto via `home/.config/git/work_config` for `~/Code/work/` |
| Pi extension shared helper | `home/.pi/agent/prelude/` |

## CONVENTIONS

- Stow layout: `home/` mirrors `~`, stow creates symlinks
- Fish: `conf.d/` auto-sourced, `functions/` lazy-loaded
- Neovim: 1 plugin per file in `lua/plugins/`, returns lazy.nvim spec
- Git abbrs: ~180 oh-my-zsh style via `__git.init.fish`
- Private helpers: prefix `__` (e.g., `__git.default_branch`)
- VCS: jj colocated (`.jj/` + `.git/`), `dot update` is jj-aware
- Pi extensions: check `home/.pi/agent/prelude/` before writing new helpers; extract reusable logic there

## ANTI-PATTERNS

- Edit `~/.config/*` directly (changes lost on stow)
- Casks in `bundle.work` (use base bundle)
- Hardcode paths (use `$DOTFILES_DIR`, `$HOME`)
- Nested git repos in stowed dirs (creates symlink issues)
- node_modules in stowed dirs (opencode exception)

## COMMANDS

```bash
dot init              # Full setup (brew, stow, bun, ssh, font, fish)
dot update            # Pull (jj-aware) + brew upgrade + restow
dot doctor            # Health check
dot stow              # Resymlink only
dot package add X     # Add + install package
dot summary           # AI commit summary (opencode)
dot benchmark-shell   # Fish startup perf
dot gen-ssh-key       # Generate ed25519 key by email domain
```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|
| Fish | `config.fish` | Sources `conf.d/`, sets EDITOR/MANPAGER |
| Neovim | `init.lua` | 1 line: `require("dmmulroy")` |
| Tmux | `tmux.conf` | Prefix `C-;`, auto-installs TPM |
| Git | `config` | SSH signing, `pull.rebase`, conditional include |
| jj | `config.toml` | SSH signing, private commits blocked, intent-check hook |

## UNIQUE STYLES

- tmux prefix: `C-;` (not `C-b`)
- tmux splits: `\` horizontal, `Enter` vertical
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- git: `fomo` = fetch origin main + rebase
- Theme: Catppuccin Macchiato across tools

## NOTES

- jj hook warns on push if AGENTS.md stale
- `dot update` handles WARP VPN brew API issues automatically
- Tmux theme must load BEFORE continuum (status-right conflict)
- opencode/ has node_modules (exception to stow anti-pattern)
