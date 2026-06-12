# Dotfiles

A comprehensive, automated dotfiles management system for macOS development environments. Features a powerful CLI tool for setup, maintenance, and AI-powered development insights.

> [!NOTE]
> This repository is forked from [Dillon Mulroy's dotfiles](https://github.com/dmmulroy/.dotfiles). Nearly all of the original design and the `dot` CLI are his work — this is my adaptation on top of his foundation. Huge thanks to [@dmmulroy](https://github.com/dmmulroy).

## Overview

This repository contains my personal development environment configuration, managed through a custom CLI tool called `dot`. It uses GNU Stow for symlink management and **nix-darwin** for package management — CLI tools come from nixpkgs while GUI casks are managed declaratively through nix-darwin's Homebrew module — and includes configurations for Fish shell, Neovim, Tmux, Git, and other essential development tools.

### Key Features

- 🚀 **One-command setup** - Complete development environment in minutes
- 🤖 **AI Integration** - pi for AI assistance
- 📦 **Resilient Package Management** - Continues installation even if packages fail
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
├── flake.nix          # nix-darwin flake
├── nix/
│   ├── darwin.nix     # System module
│   ├── packages.nix   # CLI tools (nixpkgs → environment.systemPackages)
│   ├── homebrew.nix   # GUI casks + custom-tap brews (homebrew module)
│   └── packages.work.nix # Optional work-only packages
├── CLAUDE.md          # Instructions for AI assistants
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
1. Installs Homebrew (if not present — nix-darwin drives it for casks)
2. Installs Nix (Determinate Systems installer, if not present)
3. Applies the nix-darwin configuration (`darwin-rebuild switch`) — installs CLI tools from nixpkgs and GUI casks via the Homebrew module
4. Creates symlinks with GNU Stow
5. Installs Bun runtime
6. Installs pi via the Vite+ tool registry
7. Generates SSH key for GitHub (optional)
8. Installs MonoLisa font (optional)
9. Sets up Fish shell with plugins

### Maintenance Commands

#### `dot update` - Update Everything
```bash
dot update
```
- Pulls latest dotfiles changes (auto-detects jj vs git)
- Bumps flake inputs (`nix flake update`) and applies them (`darwin-rebuild switch`); nix-darwin upgrades the declared casks via brew
- Re-stows configuration files
- Runs `pi update` to update pi and its configured packages
- Runs pi headlessly with `/skill:sync-pocock-skills` and waits for the checked-in Matt Pocock skills sync to complete

#### `dot doctor` - Health Check
```bash
dot doctor
```
Comprehensive diagnostics including:
- ✅ Homebrew + nix-darwin installation
- ✅ Essential tools (git, nvim, tmux, node, etc.)
- ✅ pi installation and core development tools
- ✅ Fish shell configuration
- ✅ PATH configuration
- ⚠️ Broken symlinks detection
- ⚠️ Missing dependencies

#### `dot check-packages` - Package Status
```bash
dot check-packages
```
Shows which declared packages (nixpkgs + Homebrew casks/brews) are present vs. missing.

#### `dot retry-failed` - Retry Failed Installations
```bash
dot retry-failed
```
Obsolete under nix-darwin: a failed `darwin-rebuild switch` rolls back atomically, so there's no partial state to retry. Re-run `dot update`.

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

### Utility Commands

#### `dot completions` - Generate Fish Shell Completions
```bash
dot completions
```
Generates comprehensive Fish shell completions for the `dot` command, including:
- All commands and subcommands
- Dynamic completions for installed packages
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

The system manages packages through the `dot package` command, which edits the nix configuration and applies it with `darwin-rebuild switch`:

#### Package Commands

```bash
# List declared packages (nixpkgs + Homebrew)
dot package list

# Add a CLI tool (nixpkgs attribute) — edits nix/packages.nix
dot package add ripgrep
dot package add jujutsu

# Add a GUI app (Homebrew cask) — edits nix/homebrew.nix
dot package add slack cask

# Update everything: bump flake.lock, then darwin-rebuild switch
dot package update

# Remove a package (from either nix file) and apply
dot package remove ripgrep
```

#### Package Files

**`nix/packages.nix`** — CLI tools via nixpkgs (`environment.systemPackages`):
- Development tools: neovim, fish, jujutsu
- CLI utilities: ripgrep, fd, fzf, starship
- Toolchains: zig, wasmtime, wasm-tools

**`nix/homebrew.nix`** — GUI casks + custom-tap brews managed by nix-darwin's Homebrew module:
- Casks: raycast, cleanshot, orbstack, kitty, zed, yaak, claude-code
- Custom taps/brews: jj-starship, hunk

**`nix/packages.work.nix`** — optional work-only packages (import on work machines).

#### Package Notes

- **`pkg` adds the nixpkgs attribute name** (e.g. `awscli2`, `jujutsu`), not the brew name
- **Sorted maintenance**: entries kept alphabetically sorted within each list
- **Atomic**: `darwin-rebuild switch` applies the whole config or rolls back
- **Reproducible**: versions pinned via `flake.lock`; `dot update` bumps them
- **Cask removal** won't uninstall the app while `onActivation.cleanup = "none"` in `nix/homebrew.nix`

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
- **jj Support**: Auto-detects jj-managed repos and uses appropriate update commands

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
dot package add new-tool       # nixpkgs attr → nix/packages.nix
dot package add new-app cask   # Homebrew cask → nix/homebrew.nix
```

**Method 2: Manual editing:**
Edit `nix/packages.nix` (CLI tools) or `nix/homebrew.nix` (casks):
```nix
# nix/packages.nix — add the nixpkgs attribute, sorted
environment.systemPackages = with pkgs; [
  new-tool
];

# nix/homebrew.nix — add the cask name
casks = [ "new-app" ];
```

Then apply:
```bash
dot package update  # or: sudo darwin-rebuild switch --flake ~/.dotfiles#$(scutil --get LocalHostName)
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

**pi installation issues:**
```bash
# Ensure Vite+ is installed, then install pi from the tool registry
curl -fsSL https://vite.plus | bash
vp install -g @mariozechner/pi-coding-agent
```

### Getting Help

- Run `dot help` for command overview
- Run `dot <command> --help` for specific command help
- Check `dot doctor` for environment issues
- For a failed `darwin-rebuild switch`, read the build error it prints; the previous generation stays active (`darwin-rebuild --list-generations`, `darwin-rebuild rollback`)

## Development

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes in the `home/` directory structure
4. Test with `dot doctor` and `dot check-packages`
5. Submit a pull request

### Testing Changes

```bash
# Make modifications to dotfiles
# ...

# Test changes
dot doctor

# Re-stow if needed
dot stow
```

## Advanced Usage

### Selective Installation

```bash
# Install everything, skip optional components
dot init --skip-ssh --skip-font

# Check what's missing
dot check-packages

# Apply work packages: import nix/packages.work.nix from nix/darwin.nix, then
dot package update
```

### Shell Completions

```bash
# Generate Fish shell completions
dot completions

# Completions include dynamic suggestions for:
# - Package names when using package remove/update
# - All commands, subcommands, and options
```

## License

This repository is for personal use. Feel free to fork and adapt for your own needs.

## Acknowledgments

- **[Dillon Mulroy](https://github.com/dmmulroy)** — this repository is forked from his [dotfiles](https://github.com/dmmulroy/.dotfiles), which form the basis for nearly everything here, including the `dot` CLI. This project would not exist without his work.
- [GNU Stow](https://www.gnu.org/software/stow/) for symlink management
- [nix-darwin](https://github.com/nix-darwin/nix-darwin) + [nixpkgs](https://github.com/NixOS/nixpkgs) for package management
- [Homebrew](https://brew.sh/) for GUI casks (driven by nix-darwin)
- pi for AI assistance
- The dotfiles community for inspiration and best practices