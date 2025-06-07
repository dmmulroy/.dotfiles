# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Dotfiles Management CLI
```bash
# Full system setup (interactive)
./dot init

# Install base packages only
brew bundle --file=./packages/bundle

# Install work packages (in addition to base)
brew bundle --file=./packages/bundle.work

# Update symlinks 
stow -R -v -d . -t "$HOME" home

# Check installation health
./dot doctor

# Summarize recent commits with AI
./dot summary
./dot summary -n 5 -d

# Manage backups
./dot backup
./dot restore
```

### Development Workflow
When modifying configurations:
1. Edit files in the `./home/` directory (NOT in your actual home directory)
2. Run `./dot init` or `stow -R -v -d . -t "$HOME" home` to update symlinks
3. Test changes in the relevant application

## Architecture

This dotfiles repository uses GNU Stow for symlink management. All configuration files live under `home/` and are symlinked to the user's home directory.

### Key Design Patterns
- **Stow-based symlinks**: All configs are in `.home/` directory, symlinked to `~` via GNU Stow
- **Brewfile package management**: Packages defined in `packages/bundle` (base) and `packages/bundle.work` (optional)
- **Conditional Git configuration**: Work projects under `~/Code/work/` get different Git config via includeIf
- **Plugin managers**: Each tool uses its own (lazy.nvim for Neovim, TPM for Tmux, Fisher for Fish)

### Important Relationships
- Fish shell configurations load custom functions from `home/.config/fish/functions/`
- Neovim uses Lua-based configuration with modular plugin definitions in `home/.config/nvim/lua/plugins/`
- Git configuration conditionally includes work-specific settings based on directory path
- The `init.sh` script orchestrates the entire setup process in a specific order (Homebrew → packages → stow → shell setup)

### Non-obvious Implementation Details
- Homebrew path differs between ARM64 (`/opt/homebrew`) and x86 (`/usr/local`) - the init script handles this
- Fish shell must be added to `/etc/shells` before it can be set as default
- Tmux plugins are installed automatically on first launch via TPM
- Work packages prompt is interactive - the script asks before installing work-specific tools
- The `dot` CLI tool is in PATH via Fish config (`fish_add_path ~/.dotfiles`)
- Backups are automatically compressed using gzip for space efficiency
- Package installation has fallback logic - continues even if individual packages fail
- Claude Code CLI is included for AI assistance
- The `dot doctor` command performs comprehensive health checks of the development environment
