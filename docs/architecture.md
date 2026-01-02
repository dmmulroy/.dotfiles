# Architecture

This dotfiles repository uses GNU Stow for symlink management. All configuration files live under `home/` and are symlinked to the user's home directory.

## Key Design Patterns

- **Stow-based symlinks**: All configs are in `home/` directory, symlinked to `~` via GNU Stow
- **Brewfile package management**: Packages defined in `packages/bundle` (base) and `packages/bundle.work` (optional)
- **Conditional Git configuration**: Work projects under `~/Code/work/` get different Git config via includeIf
- **Plugin managers**: Each tool uses its own (lazy.nvim for Neovim, TPM for Tmux, Fisher for Fish)

## Important Relationships

- Fish shell configurations load custom functions from `home/.config/fish/functions/`
- Neovim uses Lua-based configuration with modular plugin definitions in `home/.config/nvim/lua/plugins/`
- Git configuration conditionally includes work-specific settings based on directory path
- The `dot init` command orchestrates the entire setup process in a specific order (Homebrew -> packages -> stow -> Bun -> OpenCode -> shell setup)

## Non-obvious Implementation Details

- The `dot update` command auto-detects jj-managed repos (colocated mode) and uses `jj git fetch` + `jj rebase` instead of `git pull`
- Homebrew path differs between ARM64 (`/opt/homebrew`) and x86 (`/usr/local`) - the init script handles this
- Fish shell must be added to `/etc/shells` before it can be set as default
- Tmux plugins are installed automatically on first launch via TPM
- Work packages prompt is interactive - the script asks before installing work-specific tools
- The `dot` CLI tool is in PATH via Fish config (`fish_add_path ~/.dotfiles`)
- Package installation has fallback logic - continues even if individual packages fail
- OpenCode CLI is installed via Homebrew (`brew install opencode`) with native installer/bun/npm fallback
- The `dot doctor` command performs comprehensive health checks of the development environment, including OpenCode installation method verification and conflict detection
- Package management commands (`dot package add/remove/update/list`) automatically detect package type (brew vs cask) and maintain sorted bundle files
- Adding packages installs them immediately and updates the appropriate bundle file
- Updating packages can target all packages, specific packages, or packages from specific bundles
- Update command includes Homebrew refresh and optional cleanup of old versions
- Removing packages from bundles optionally uninstalls them from the system
- The `dot completions` command generates comprehensive Fish shell completions with dynamic suggestions for packages
- The `dot gen-ssh-key` command automatically derives key names from email domains (e.g., user@github.com -> id_ed25519_github), adds keys to ssh-agent, copies public keys to clipboard, and backs up existing keys before overwriting
