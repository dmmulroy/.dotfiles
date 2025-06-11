# Dotfiles

A comprehensive, automated dotfiles management system for macOS development environments. Features a powerful CLI tool for setup, maintenance, and AI-powered development insights.

## Overview

This repository contains my personal development environment configuration, managed through a custom CLI tool called `dot`. It uses GNU Stow for symlink management, Homebrew for package installation, and includes configurations for Fish shell, Neovim, Tmux, Git, and other essential development tools.

### Key Features

- 🚀 **One-command setup** - Complete development environment in minutes
- 🤖 **AI Integration** - Claude Code for commit summaries and assistance
- 📦 **Resilient Package Management** - Continues installation even if packages fail
- 💾 **Compressed Backups** - Create and restore configuration snapshots
- 🔒 **Encrypted Secrets** - Secure storage for API keys and sensitive data
- 🔍 **Health Monitoring** - Comprehensive environment diagnostics
- 🛠️ **Modular Design** - Separate work and personal configurations

## Quick Start

```bash
# Clone the repository
git clone https://github.com/dmmulroy/.dotfiles.git ~/.dotfiles
cd ~/.dotfiles

# Full setup (installs everything)
./dot init

# Or customize the installation
./dot init --skip-ssh --skip-font
```

After installation, the `dot` command will be available globally for ongoing management. Running `dot` without arguments shows help.

## Repository Structure

```
~/.dotfiles/
├── dot                 # Main CLI tool
├── home/              # Configuration files (stowed to ~)
│   ├── .config/
│   │   ├── fish/      # Fish shell configuration
│   │   ├── git/       # Git configuration
│   │   ├── nvim/      # Neovim configuration
│   │   ├── tmux/      # Tmux configuration
│   │   └── ...
│   └── .ideavimrc     # IntelliJ IDEA Vim config
├── packages/
│   ├── bundle         # Base Brewfile
│   └── bundle.work    # Work-specific packages
├── backups/           # Configuration backups (compressed)
├── CLAUDE.md          # Instructions for Claude Code
└── README.md          # This file
```

## The `dot` CLI Tool

The `dot` command is a comprehensive management tool for your dotfiles. It handles everything from initial setup to ongoing maintenance and provides AI-powered insights.

### Installation Commands

#### `dot init` - Initial Setup
Complete environment setup with all tools and configurations.

```bash
# Full installation
dot init

# Skip SSH key generation
dot init --skip-ssh

# Skip font installation  
dot init --skip-font

# Skip both SSH and font setup
dot init --skip-ssh --skip-font
```

**What it does:**
1. Installs Homebrew (if not present)
2. Installs packages from Brewfiles
3. Creates symlinks with GNU Stow
4. Installs Bun runtime
5. Installs Claude Code CLI via Bun/npm
6. Generates SSH key for GitHub (optional)
7. Installs MonoLisa font (optional)
8. Sets up Fish shell with plugins

### Maintenance Commands

#### `dot update` - Update Everything
```bash
dot update
```
- Pulls latest dotfiles changes
- Updates Homebrew packages
- Re-stows configuration files

#### `dot doctor` - Health Check
```bash
dot doctor
```
Comprehensive diagnostics including:
- ✅ Homebrew installation
- ✅ Essential tools (git, nvim, tmux, node, etc.)
- ✅ Claude Code installation method and functionality
- ✅ Fish shell configuration
- ✅ PATH configuration
- ⚠️ Broken symlinks detection
- ⚠️ Missing dependencies

#### `dot check-packages` - Package Status
```bash
dot check-packages
```
Shows which packages are installed vs. missing from your Brewfiles.

#### `dot retry-failed` - Retry Failed Installations
```bash
dot retry-failed
```
Attempts to reinstall packages that failed during initial setup.

### AI-Powered Features

#### `dot summary` - Commit Analysis
Uses Claude Code to generate intelligent summaries of recent git commits.

```bash
# Summarize last 3 commits (default)
dot summary

# Summarize specific number of commits
dot summary -n 5

# Include file diffs for detailed analysis
dot summary -d

# Verbose mode with commit details
dot summary -v

# Combine options
dot summary -n 10 -d -v
```

**Example Output:**
```
=> Summary of Recent Changes

Development Focus: Recent work centers on improving the diagnostic navigation
system in Neovim, updating deprecated API calls to use modern vim.diagnostic.jump()
functions. This includes better error handling and user experience improvements.

Technical Patterns: The commits show incremental configuration refinements
with a focus on tooling updates and environment optimization...
```

### Backup & Restore

The `dot backup` command provides comprehensive backup management with subcommands for all backup operations.

#### Create Backups
```bash
# Create timestamped backup (default)
dot backup

# Create named backup
dot backup create pre-experiment

# Shorthand for named backup
dot backup pre-experiment

# All backups are automatically compressed (tar.gz)
```

#### Restore Configurations
```bash
# List available backups
dot backup restore

# Restore specific backup
dot backup restore pre-experiment
```

#### Backup Management
```bash
# List all backups with details
dot backup list

# Remove backups older than 30 days
dot backup clean

# Compress legacy uncompressed backups
dot backup compress

# Delete specific backup
dot backup delete old-backup

# Show backup help
dot backup help
```

### Performance & Development Tools

#### `dot benchmark-shell` - Fish Shell Performance Benchmarking
```bash
# Run 10 benchmarks (default)
dot benchmark-shell

# Run specific number of benchmarks
dot benchmark-shell -r 20

# Show verbose output with individual timings  
dot benchmark-shell -v

# Combine options
dot benchmark-shell -r 15 -v
```

Measures Fish shell startup performance with detailed analysis:
- **High-precision timing** via Python3 or Perl
- **Performance assessment** with color-coded results (excellent ≤50ms, good ≤100ms, fair ≤200ms)
- **Optimization tips** for slow performance
- **Statistical analysis** including average, min, max, and range
- **Profiling guidance** for detailed bottleneck identification

**Example Output:**
```
=> Fish Shell Startup Benchmark Results

Configuration:
  Shell: fish, version 4.0.2
  Runs: 10
  Test: Empty script execution

Performance Results:
  Average time: 0.061 seconds
  Fastest time: 0.048 seconds
  Slowest time: 0.078 seconds
  Time range:   0.030 seconds

Performance Assessment:
✓ Good startup performance (≤100ms)
```

### Secrets Management

The dotfiles system includes built-in encrypted secrets management for storing sensitive information like API keys, tokens, and passwords.

#### `dot secrets` - Encrypted Secrets Management
```bash
# Encrypt a secrets file
dot secrets encrypt secrets.txt

# Decrypt to default file (secrets.txt)
dot secrets decrypt

# Decrypt to custom filename
dot secrets decrypt my-secrets.txt

# Edit encrypted secrets interactively
dot secrets edit

# Check encrypted secrets file status
dot secrets status
```

**Features:**
- **AES-256-CBC encryption** with PBKDF2 key derivation for secure storage
- **Interactive editing** with automatic re-encryption
- **Password-protected** operations with confirmation prompts
- **Git-ignored** encrypted files (`.secrets.enc` and `secrets.txt`)
- **Flexible file formats** - supports any plain text format (.env, YAML, JSON, etc.)

**Security best practices:**
- Use strong, unique passwords for encryption
- Always delete decrypted files when done (commands will prompt for this)
- Never commit the `.secrets.enc` file to public repositories
- Regularly rotate sensitive credentials stored in secrets
- Consider using different encryption passwords for different environments

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

### Utility Commands

#### `dot completions` - Generate Fish Shell Completions
```bash
dot completions
```
Generates comprehensive Fish shell completions for the `dot` command, including:
- All commands and subcommands
- Dynamic completions for installed packages and backups
- Dynamic completions for secrets commands
- Option completions with descriptions

#### `dot edit` - Open in Editor
```bash
dot edit
```
Opens the dotfiles directory in your default editor (defined by `$EDITOR`).

#### `dot stow` - Update Dotfiles Symlinks
```bash
# Create/update symlinks for configuration files
dot stow
```
Re-creates symlinks from `home/` directory to your home directory (`~`). Use this after editing configuration files.

#### `dot link` / `dot unlink` - Global dot Command Installation
```bash
# Install dot command globally (add to PATH)
dot link

# Remove global installation
dot unlink
```
Makes the `dot` command available from any directory by creating a symlink in `/usr/local/bin` or `~/.local/bin`.

## Configuration

### Package Management

The system provides comprehensive package management through the `dot package` command and uses two Brewfiles for different contexts:

#### Package Commands

```bash
# List packages
dot package list              # List all packages
dot package list base         # List base packages only
dot package list work         # List work packages only

# Add packages
dot package add git           # Add git formula to base bundle
dot package add docker cask   # Add docker cask to base bundle  
dot package add kubectl brew work  # Add kubectl to work bundle

# Update packages
dot package update            # Update all installed packages
dot package update git        # Update specific package
dot package update all base   # Update only base bundle packages
dot package update all work   # Update only work bundle packages

# Remove packages
dot package remove git        # Remove git from any bundle
dot package remove docker base  # Remove docker from base bundle only
```

#### Package Files

**`packages/bundle`** - Base packages for all machines:
- Development tools: neovim, tmux, fish, git
- CLI utilities: ripgrep, fd, fzf, starship
- Applications: Arc browser, Raycast, OrbStack
- AI tools: aider

**`packages/bundle.work`** - Work-specific additions:
- AWS/Kubernetes tools
- Enterprise development tools

#### Package Features

- **Auto-detection**: Package type (brew vs cask) automatically detected
- **Sorted maintenance**: Packages kept alphabetically sorted within each type
- **Installation integration**: Adding packages installs them immediately
- **Update flexibility**: Can update all packages, specific packages, or by bundle
- **Cleanup included**: Update command includes Homebrew refresh and optional cleanup

### Key Configurations

- **Fish Shell**: Custom functions, environment variables, and plugin management via Fisher
- **Neovim**: Lua-based configuration with lazy.nvim plugin manager
- **Tmux**: Plugin management via TPM, session persistence, Vim-style navigation
- **Git**: Conditional work configuration, custom aliases, GPG signing

### Architecture Highlights

- **GNU Stow**: Manages symlinks from `home/` to `~`
- **Modular Design**: Separate configs for different tools
- **Conditional Loading**: Work-specific Git config for `~/Code/work/`
- **Plugin Managers**: Each tool uses its own (lazy.nvim, TPM, Fisher)
- **Error Resilience**: Package installation continues despite individual failures

## Environment Setup

### Prerequisites

- macOS (Intel or Apple Silicon)
- Internet connection
- Terminal access

### First-Time Setup

1. **Clone repository:**
   ```bash
   git clone https://github.com/dmmulroy/.dotfiles.git ~/.dotfiles
   cd ~/.dotfiles
   ```

2. **Run installation:**
   ```bash
   ./dot init
   ```

3. **Restart shell or source Fish config:**
   ```bash
   # In Fish shell
   source ~/.config/fish/config.fish
   
   # Or restart terminal
   ```

4. **Verify installation:**
   ```bash
   dot doctor
   ```

### Customization

#### Adding Packages

**Method 1: Using package commands (recommended):**
```bash
# Add package using the package command
dot package add new-tool             # Adds to base bundle
dot package add new-app cask         # Adds cask to base bundle
dot package add work-tool brew work  # Adds to work bundle
```

**Method 2: Manual editing:**
Edit `packages/bundle` or `packages/bundle.work`:
```ruby
# Add to packages/bundle
brew "new-tool"
cask "new-app"
```

Then run:
```bash
dot init  # or brew bundle --file=./packages/bundle
```

#### Modifying Configurations
1. Edit files in `home/` directory (not your actual home directory)
2. Re-stow changes: `dot stow` (or `dot init` for full setup)
3. Test configuration changes

#### Work-Specific Setup
The system automatically applies work-specific Git configuration for repositories under `~/Code/work/`.

## Troubleshooting

### Common Issues

**Command not found: `dot`**
```bash
# Source Fish configuration
source ~/.config/fish/config.fish

# Or add to PATH manually
export PATH="$HOME/.dotfiles:$PATH"
```

**Package installation failures:**
```bash
# Check what failed
dot check-packages

# Retry failed packages
dot retry-failed
```

**Broken symlinks:**
```bash
# Diagnose issues
dot doctor

# Re-create symlinks
dot stow
```

**Claude Code authentication:**
```bash
# If summary command fails
claude auth login
```

**Claude Code installation issues:**
```bash
# Reinstall via Bun (recommended)
bun install -g @anthropic-ai/claude-code

# Or via npm
npm install -g @anthropic-ai/claude-code
```

### Getting Help

- Run `dot help` for command overview
- Run `dot <command> --help` for specific command help
- Check `dot doctor` for environment issues
- Review logs in failed package files: `packages/failed_packages_*.txt`

## Development

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes in the `home/` directory structure
4. Test with `dot doctor` and `dot check-packages`
5. Submit a pull request

### Testing Changes

```bash
# Create backup before testing
dot backup create test-changes

# Make modifications
# ...

# Test changes
dot doctor

# If issues occur, restore backup
dot backup restore test-changes
```

## Advanced Usage

### Selective Installation

```bash
# Install only base packages, skip optional components
dot init --skip-ssh --skip-font

# Check what's missing
dot check-packages

# Install work packages later
brew bundle --file=./packages/bundle.work
```

### Backup Strategies

```bash
# Before major changes
dot backup create stable-config

# Before experiments  
dot backup create pre-nvim-changes

# Clean up old backups
dot backup clean
```

### Shell Completions

```bash
# Generate Fish shell completions
dot completions

# Manage encrypted secrets
dot secrets encrypt secrets.txt
dot secrets edit
dot secrets status

# Completions include dynamic suggestions for:
# - Package names when using package remove/update
# - Backup names when using backup restore/delete
# - Secrets file names for encrypt/decrypt commands
# - All commands, subcommands, and options
```

### AI-Powered Workflows

```bash
# Review recent work
dot summary -v

# Detailed analysis for release notes
dot summary -n 10 -d

# Quick daily standup summary
dot summary -n 5
```

## License

This repository is for personal use. Feel free to fork and adapt for your own needs.

## Acknowledgments

- [GNU Stow](https://www.gnu.org/software/stow/) for symlink management
- [Homebrew](https://brew.sh/) for package management
- [Claude Code](https://claude.ai/code) for AI assistance
- The dotfiles community for inspiration and best practices