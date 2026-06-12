# DOTFILES

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

macOS dev env via GNU Stow + nix-darwin. Fish + Neovim + Tmux + Git + pi.

Packages: CLI tools are native nixpkgs (`environment.systemPackages`); GUI casks +
custom-tap brews are managed by nix-darwin's `homebrew` module. Nix is installed via
Determinate (so `nix.enable = false` in the darwin config). `dot` orchestrates
`darwin-rebuild switch`; GNU Stow still handles dotfile symlinks.

## STRUCTURE

```
.dotfiles/
├── dot                 # CLI: init/update/doctor/stow/package (2500 lines bash)
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── tmux/           # Multiplexer + TPM plugins
│   ├── git/            # Conditional work config
│   ├── ghostty/        # Terminal
│   ├── starship.toml   # Prompt (custom.scm, 2s timeout for Vite+)
│   └── ripgrep/        # rg config
├── home/.pi/           # Pi agent workspace (AGENTS.md)
│   ├── agent/extensions/ # 6 TypeScript extensions
│   └── agent/skills/   # 15 agent skills
├── flake.nix           # nix-darwin flake; darwinConfigurations."PT-RICARDOFERREIRA"
├── nix/
│   ├── darwin.nix      # system module (imports + nixpkgs config + primaryUser)
│   ├── packages.nix    # CLI tools → environment.systemPackages (nixpkgs)
│   ├── homebrew.nix    # casks + custom-tap brews (homebrew module)
│   └── packages.work.nix # optional work-only systemPackages
└── docs/
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add CLI tool | `dot package add <nixpkgs-attr>` or edit `nix/packages.nix` |
| Add GUI app/cask | `dot package add <cask> cask` or edit `nix/homebrew.nix` |
| Shell alias/abbr | `home/.config/fish/conf.d/aliases.fish` |
| Shell function | `home/.config/fish/functions/` |
| Git alias | `home/.config/git/config` [alias] section |
| Neovim plugin | `home/.config/nvim/lua/plugins/<name>.lua` |
| Neovim keymap | `home/.config/nvim/lua/dmmulroy/keymaps.lua` |
| Tmux binding | `home/.config/tmux/tmux.conf` |
| Starship prompt | `home/.config/starship.toml` |
| Pi extension | `home/.pi/agent/extensions/<name>/` |
| Pi skill | `home/.pi/agent/skills/<name>/SKILL.md` |
| Pi settings | `home/.pi/agent/settings.json` |
| Work git identity | Auto via `home/.config/git/work_config` for `~/Code/work/` |

## CONVENTIONS

- Stow layout: `home/` mirrors `~`, stow creates symlinks
- Fish: `conf.d/` auto-sourced, `functions/` lazy-loaded
- Neovim: 1 plugin per file in `lua/plugins/`, returns lazy.nvim spec
- Git abbrs: ~180 oh-my-zsh style via `__git.init.fish`
- Private helpers: prefix `__` (e.g., `__git.default_branch`)
- Pi extensions: TypeScript, npm workspaces under `home/.pi/`
- Pi skills: Markdown-first (`SKILL.md`) with optional bundled resources

## ANTI-PATTERNS

- Edit `~/.config/*` directly (changes lost on stow)
- `dot package add brew X` expecting the brew name — `pkg` adds the **nixpkgs attr** (e.g. `awscli2`, `jujutsu`)
- Removing a cask won't uninstall the app while `onActivation.cleanup = "none"`
- Hardcode paths (use `$DOTFILES_DIR`, `$HOME`)
- Nested git repos in stowed dirs (creates symlink issues)
- node_modules in stowed dirs (pi extensions exception — gitignored)

## COMMANDS

```bash
dot init              # Full setup (brew, nix, darwin-rebuild, stow, bun, ssh, font, fish)
dot update            # Pull + nix flake update + darwin-rebuild switch + restow + pi update + Pocock skills sync
dot doctor            # Health check (checks brew, nix-darwin, stow, fish, jj)
dot stow              # Resymlink only
dot package add X [pkg|cask]  # Edit nix config + darwin-rebuild switch (pkg = nixpkgs attr, default)
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
| Starship | `starship.toml` | 2s timeout (Vite+ shims), custom.scm after dir |
| Pi | `settings.json` | Default provider: opencode.cloudflare.dev, Catppuccin theme |

## UNIQUE STYLES

- tmux prefix: `C-;` (not `C-b`)
- tmux splits: `\` horizontal, `Enter` vertical
- tmux extended-keys: `always` + CSI-u (required for pi/claude-code; fish needs `tmux_keys.fish` workaround)
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- nvim completion: blink.cmp (not nvim-cmp), LSP source score_offset=1000
- git: `fomo` = fetch origin main + rebase
- Theme: Catppuccin Macchiato across all tools

## NOTES

- `dot update` handles WARP VPN brew API issues automatically (still relevant for cask downloads)
- fisher is vendored at `home/.config/fish/functions/fisher.fish` (not in nixpkgs; brew copy wasn't visible to the nix fish)
- `home/.config/fish/conf.d/0-nix.fish` prepends the nix bin dir early so prompt-init conf.d files (starship/zoxide) find nix tools
- Tmux theme must load BEFORE continuum (status-right conflict)
- Starship `command_timeout = 2000` because Vite+ node shims are slow
- `secrets.fish` is gitignored — contains env tokens for work services
- `.pi/agent/*` mostly gitignored; extensions + skills explicitly un-ignored
- jj was removed; repo now uses git only
