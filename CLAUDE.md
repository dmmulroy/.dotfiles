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

# Update symlinks for dotfiles
./dot stow
# OR manually: stow -R -v -d . -t "$HOME" home

# Install dot command globally (add to PATH)
./dot link

# Uninstall global dot command
./dot unlink

# Check installation health
./dot doctor

# Package management
./dot package list                    # List all packages
./dot package list base               # List base packages only  
./dot package list work               # List work packages only
./dot package add git                 # Add git formula to base bundle
./dot package add docker cask         # Add docker cask to base bundle
./dot package add kubectl brew work   # Add kubectl to work bundle
./dot package update                  # Update all installed packages
./dot package update git              # Update specific package
./dot package update all base         # Update only base bundle packages
./dot package update all work         # Update only work bundle packages
./dot package remove git              # Remove git from any bundle
./dot package remove docker base      # Remove docker from base bundle only

# Summarize recent commits with AI
./dot summary
./dot summary -n 5 -d

# Benchmark Fish shell startup performance
./dot benchmark-shell
./dot benchmark-shell -r 20 -v

# Manage backups
./dot backup
./dot restore

# Generate Fish shell completions
./dot completions

# Secrets management (encrypted storage)
./dot secrets encrypt secrets.txt        # Encrypt a secrets file
./dot secrets decrypt                    # Decrypt to secrets.txt (default)
./dot secrets decrypt my-secrets.txt     # Decrypt to custom filename
./dot secrets edit                       # Edit encrypted secrets interactively
./dot secrets status                     # Check encrypted secrets file status
```

### Development Workflow
When modifying configurations:
1. Edit files in the `./home/` directory (NOT in your actual home directory)
2. Run `./dot stow` to update symlinks (or `./dot init` for full setup)
3. Test changes in the relevant application

### Command Clarification
- `./dot stow` - Create symlinks for dotfiles (configs) from `home/` to `~/`
- `./dot link` - Install the `dot` command globally so you can run `dot` from anywhere
- `./dot init` - Full system setup (includes both stowing and package installation)

## Architecture

This dotfiles repository uses GNU Stow for symlink management. All configuration files live under `home/` and are symlinked to the user's home directory.

### Key Design Patterns
- **Stow-based symlinks**: All configs are in `.home/` directory, symlinked to `~` via GNU Stow
- **Brewfile package management**: Packages defined in `packages/bundle` (base) and `packages/bundle.work` (optional)
- **Conditional Git configuration**: Work projects under `~/Code/work/` get different Git config via includeIf
- **Plugin managers**: Each tool uses its own (lazy.nvim for Neovim, TPM for Tmux, Fisher for Fish)
- **Encrypted secrets storage**: Sensitive data encrypted with AES-256-CBC and stored as `.secrets.enc`

### Important Relationships
- Fish shell configurations load custom functions from `home/.config/fish/functions/`
- Neovim uses Lua-based configuration with modular plugin definitions in `home/.config/nvim/lua/plugins/`
- Git configuration conditionally includes work-specific settings based on directory path
- The `init.sh` script orchestrates the entire setup process in a specific order (Homebrew → packages → stow → Bun → Claude Code → shell setup)

### Non-obvious Implementation Details
- Homebrew path differs between ARM64 (`/opt/homebrew`) and x86 (`/usr/local`) - the init script handles this
- Fish shell must be added to `/etc/shells` before it can be set as default
- Tmux plugins are installed automatically on first launch via TPM
- Work packages prompt is interactive - the script asks before installing work-specific tools
- The `dot` CLI tool is in PATH via Fish config (`fish_add_path ~/.dotfiles`)
- Backups are automatically compressed using gzip for space efficiency
- Package installation has fallback logic - continues even if individual packages fail
- Claude Code CLI is installed globally via Bun/npm package manager for AI assistance
- The `dot doctor` command performs comprehensive health checks of the development environment, including Claude Code installation method verification
- Package management commands (`dot package add/remove/update/list`) automatically detect package type (brew vs cask) and maintain sorted bundle files
- Adding packages installs them immediately and updates the appropriate bundle file
- Updating packages can target all packages, specific packages, or packages from specific bundles
- Update command includes Homebrew refresh and optional cleanup of old versions
- Removing packages from bundles optionally uninstalls them from the system
- The `dot completions` command generates comprehensive Fish shell completions with dynamic suggestions for packages and backups

### Secrets Management
The dotfiles system includes built-in encrypted secrets management for storing sensitive information like API keys, tokens, and passwords:

- **Encryption**: Uses AES-256-CBC with PBKDF2 key derivation for secure storage
- **Storage location**: Encrypted secrets are stored as `.secrets.enc` in the dotfiles directory
- **File format**: Plain text files (e.g., `.env` format, YAML, JSON, or any text format)
- **Interactive editing**: The `edit` command provides secure temporary decryption for editing
- **Password-protected**: Each encryption/decryption requires a password prompt
- **Git-ignored**: The `.secrets.enc` file should be added to `.gitignore` to prevent accidental commits

**Security best practices:**
- Use strong, unique passwords for encryption
- Always delete decrypted files when done (`dot secrets` commands will prompt for this)
- Never commit the `.secrets.enc` file to public repositories
- Regularly rotate sensitive credentials stored in secrets
- Consider using different encryption passwords for different environments (dev/staging/prod)

**Example secrets file format:**
```bash
# API Keys
OPENAI_API_KEY=sk-1234567890abcdef
GITHUB_TOKEN=ghp_abcdefghijklmnop

# Database credentials  
DB_PASSWORD=super-secret-password
DB_CONNECTION_STRING=postgresql://user:pass@host:5432/db

# Environment-specific secrets
STAGING_API_URL=https://api-staging.example.com
PROD_API_URL=https://api.example.com
```

## Development Guidelines

### Shell Script Best Practices
- **ALWAYS run shellcheck when modifying the `dot` script**: `shellcheck dot` 
- Fix all shellcheck warnings and errors before committing changes
- Use proper quoting for variables and paths to prevent word splitting
- Use `command -v` instead of deprecated `which` command
- Implement proper trap cleanup for temporary files and directories

## Memories
- Anytime dot cli is updated always update the cli help flags/commands/text, CLAUDE.md, README.md, and the fish completions for dot
- Always run `shellcheck dot` when making changes to the dot script to ensure code quality and safety