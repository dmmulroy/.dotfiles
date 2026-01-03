# DOTFILES

macOS dev env via GNU Stow. Fish + Neovim + Tmux + Git + jj.

## STRUCTURE

```
.dotfiles/
├── dot                 # CLI: init/update/doctor/stow/package
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── tmux/           # Multiplexer + TPM plugins
│   ├── git/            # Conditional work config
│   ├── jj/             # Jujutsu VCS + hooks
│   ├── opencode/       # AI agent config
│   └── ghostty/        # Terminal
├── packages/
│   ├── bundle          # Base Brewfile
│   └── bundle.work     # Work additions
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

## CONVENTIONS

- Stow layout: `home/` mirrors `~`, stow creates symlinks
- Fish: `conf.d/` auto-sourced, `functions/` lazy-loaded
- Neovim: 1 plugin per file in `lua/plugins/`, returns lazy.nvim spec
- Git abbrs: ~180 oh-my-zsh style via `__git.init.fish`
- Private helpers: prefix `__` (e.g., `__git.default_branch`)

## ANTI-PATTERNS

- Edit `~/.config/*` directly (changes lost on stow)
- Casks in `bundle.work` (use base bundle)
- Hardcode paths (use `$DOTFILES_DIR`, `$HOME`)

## COMMANDS

```bash
dot init              # Full setup
dot update            # Pull + brew upgrade + restow
dot doctor            # Health check
dot stow              # Resymlink only
dot package add X     # Add + install package
dot summary           # AI commit summary (opencode)
dot benchmark-shell   # Fish startup perf
```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|
| Fish | `config.fish` | Sources `conf.d/`, sets EDITOR/MANPAGER |
| Neovim | `init.lua` | 1 line: `require("dmmulroy")` |
| Tmux | `tmux.conf` | Prefix `C-;`, auto-installs TPM |
| Git | `config` | SSH signing, `pull.rebase`, conditional include |
| jj | `config.toml` | SSH signing, private commits blocked |

## UNIQUE STYLES

- tmux prefix: `C-;` (not `C-b`)
- tmux splits: `\` horizontal, `Enter` vertical
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- git: `fomo` = fetch origin main + rebase
