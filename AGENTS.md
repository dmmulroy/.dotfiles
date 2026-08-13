# DOTFILES

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

macOS dev env via GNU Stow. Fish + Neovim + Herdr + Git + pi.

## STRUCTURE

```
.dotfiles/
├── dot                 # CLI: init/update/doctor/stow/package (2500 lines bash)
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── herdr/          # Terminal-native workspace/tab/pane manager
│   ├── git/            # Conditional work config
│   ├── ghostty/        # Terminal
│   ├── starship.toml   # Prompt (custom.scm, 2s timeout for Vite+)
│   └── ripgrep/        # rg config
├── home/.agents/       # Shared agent skills (stowed to ~/.agents/)
│   └── skills/         # SKILL.md packages for pi and other agents
├── home/.pi/           # Pi agent workspace (AGENTS.md)
│   └── agent/extensions/ # TypeScript extensions
├── packages/
│   ├── bundle          # Base Brewfile (32 formulas, 13 casks)
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
| Herdr config | `home/.config/herdr/config.toml` |
| Starship prompt | `home/.config/starship.toml` |
| Agent skill | `home/.agents/skills/<name>/SKILL.md` |
| Pi extension | `home/.pi/agent/extensions/<name>/` |
| Pi settings | `home/.pi/agent/settings.json` |
| Work git identity | Auto via `home/.config/git/work_config` for `~/Code/work/` |

## CONVENTIONS

- Stow layout: `home/` mirrors `~`, stow creates symlinks
- Fish: `conf.d/` auto-sourced, `functions/` lazy-loaded
- Neovim: 1 plugin per file in `lua/plugins/`, returns lazy.nvim spec
- Git abbrs: ~180 oh-my-zsh style via `__git.init.fish`
- Private helpers: prefix `__` (e.g., `__git.default_branch`)
- Pi extensions: TypeScript, npm workspaces under `home/.pi/`
- Agent skills: Markdown-first (`SKILL.md`) under `home/.agents/skills/`, stowed to `~/.agents/skills/`

## ANTI-PATTERNS

- Edit `~/.config/*` directly (changes lost on stow)
- Casks in `bundle.work` (use base bundle)
- Hardcode paths (use `$DOTFILES_DIR`, `$HOME`)
- Nested git repos in stowed dirs (creates symlink issues)
- node_modules in stowed dirs (pi extensions exception — gitignored)
- Skill copies under `home/.pi/agent/skills/` or `~/.pi/agent/skills/`
- Replacing `~/.agents/skills/<name>` stow symlinks with real directories

## IF YOU NOTICE SKILL LAYOUT DRIFT — FIX IT

Canonical skills live in `home/.agents/skills/<name>/` and stow to `~/.agents/skills/<name>` as a symlink. If you see any of these, fix them without being asked:

- A skill under `home/.pi/agent/skills/` or `~/.pi/agent/skills/`: move unique content into `home/.agents/skills/`, then delete the `.pi` copy/symlink.
- `~/.agents/skills/<name>` is a real directory instead of a symlink: copy it back into `home/.agents/skills/<name>/`, remove the live dir, restore the stow symlink.
- `skills` / `vpx skills add|update` wrote copies into `~/.agents` or `~/.pi`: fold the content into the repo copy, restore stow symlinks, do not leave a second tree.
- Do not restore skills the user deleted from `home/.agents/skills/`.

## COMMANDS

```bash
dot init              # Full setup (brew, stow, bun, ssh, font, fish)
dot update            # Pull + brew update/upgrade + restow + pi update
dot doctor            # Health check
dot stow              # Resymlink only
dot package add X     # Add + install package
dot benchmark-shell   # Fish startup perf
dot gen-ssh-key       # Generate ed25519 key by email domain
```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|
| Fish | `config.fish` | Sources `conf.d/`, sets EDITOR/MANPAGER |
| Neovim | `init.lua` | 1 line: `require("dmmulroy")` |
| Herdr | `config.toml` | Prefix `C-;`, workspaces/tabs/panes |
| Git | `config` | SSH signing, `pull.rebase`, conditional include |
| Starship | `starship.toml` | 2s timeout (Vite+ shims), custom.scm after dir |
| Pi | `settings.json` | Default provider: opencode.cloudflare.dev, Catppuccin theme |

## UNIQUE STYLES

- herdr prefix: `C-;`
- herdr splits: `\` split right, `Enter` split down
- herdr pane navigation: direct `C-h/j/k/l`
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- nvim completion: blink.cmp (not nvim-cmp), LSP source score_offset=1000
- git: `fomo` = fetch origin main + rebase
- Theme: Catppuccin Macchiato across all tools

## NOTES

- `dot update` handles WARP VPN brew API issues automatically
- Starship `command_timeout = 2000` because Vite+ node shims are slow
- `secrets.fish` is gitignored — contains env tokens for work services
- `.pi/agent/*` mostly gitignored; extensions explicitly un-ignored
- jj was removed; repo now uses git only
