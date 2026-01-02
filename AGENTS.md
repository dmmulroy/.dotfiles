# Dotfiles

## Purpose & Scope
macOS development environment managed via GNU Stow. Owns: system setup orchestration, package management, symlink management. Does NOT own: individual tool configs (delegated to child nodes).

## Entry Points & Contracts
- `dot` — Main CLI tool for setup, maintenance, and utilities
- `packages/bundle` — Base Brewfile (all machines)
- `packages/bundle.work` — Work-specific packages (optional)

## Dependencies
- GNU Stow (symlink management)
- Homebrew (package management)
- Fish shell (default shell)

## Usage Patterns
```bash
./dot init              # Full system setup
./dot stow              # Update symlinks after editing configs
./dot doctor            # Health check
./dot package add/remove/update/list  # Package management
./dot summary           # AI-powered commit summary
./dot benchmark-shell   # Fish startup performance
```

## Anti-Patterns
- Don't edit configs in `~/` directly — edit in `./home/`, then `dot stow`
- Don't skip shellcheck when modifying `dot` script

## Downlinks
- [home/.config/fish/AGENTS.md](home/.config/fish/AGENTS.md) — Shell config
- [home/.config/nvim/AGENTS.md](home/.config/nvim/AGENTS.md) — Editor config
- [home/.config/tmux/AGENTS.md](home/.config/tmux/AGENTS.md) — Terminal multiplexer
- [home/.config/git/AGENTS.md](home/.config/git/AGENTS.md) — Git identity & settings
- [home/.config/jj/AGENTS.md](home/.config/jj/AGENTS.md) — Jujutsu VCS config
- [home/.config/ghostty/AGENTS.md](home/.config/ghostty/AGENTS.md) — Terminal emulator

## Outlinks
- [docs/cli.md](docs/cli.md) — Full CLI reference
- [docs/architecture.md](docs/architecture.md) — System design

## Patterns & Pitfalls
- **Stow-based workflow**: All configs live in `./home/`, symlinked to `~/` via GNU Stow
- **Conditional git identity**: Work repos in `~/Code/work/` auto-switch to Cloudflare email
- **jj-aware updates**: `dot update` detects jj-managed repos and uses `jj git fetch` + `jj rebase`
- **Catppuccin Macchiato everywhere**: Consistent theme across nvim, tmux, fish, ghostty
- **ALWAYS run `shellcheck dot`** when modifying the dot script
- **When dot CLI changes**: Update help text, AGENTS.md, README.md, and fish completions (`dot completions`)
- **Package fallback**: Installation continues even if individual packages fail
- **OpenCode install priority**: Homebrew → native installer → bun → npm
