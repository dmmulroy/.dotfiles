# dot CLI Reference

## Commands

### System Setup

```bash
# Full system setup (interactive)
./dot init

# Update symlinks for dotfiles
./dot stow
# OR manually: stow -R -v -d . -t "$HOME" home

# Install dot command globally (add to PATH)
./dot link

# Uninstall global dot command
./dot unlink

# Check installation health
./dot doctor
```

### Package Management

```bash
# Install base packages only
brew bundle --file=./packages/bundle

# Install work packages (in addition to base)
brew bundle --file=./packages/bundle.work

# List packages
./dot package list                    # List all packages
./dot package list base               # List base packages only  
./dot package list work               # List work packages only

# Add packages
./dot package add git                 # Add git formula to base bundle
./dot package add docker cask         # Add docker cask to base bundle
./dot package add kubectl brew work   # Add kubectl to work bundle

# Update packages
./dot package update                  # Update all installed packages
./dot package update git              # Update specific package
./dot package update all base         # Update only base bundle packages
./dot package update all work         # Update only work bundle packages

# Remove packages
./dot package remove git              # Remove git from any bundle
./dot package remove docker base      # Remove docker from base bundle only
```

### Utilities

```bash
# Summarize recent commits with AI
./dot summary
./dot summary -n 5 -d

# Benchmark Fish shell startup performance
./dot benchmark-shell
./dot benchmark-shell -r 20 -v

# Generate SSH key for GitHub/GitLab
./dot gen-ssh-key                    # Prompts for email
./dot gen-ssh-key user@github.com    # Uses provided email
./dot gen-ssh-key work@company.com   # Creates work-specific key

# Generate Fish shell completions
./dot completions
```

## Command Clarification

- `./dot stow` - Create symlinks for dotfiles (configs) from `home/` to `~/`
- `./dot link` - Install the `dot` command globally so you can run `dot` from anywhere
- `./dot init` - Full system setup (includes both stowing and package installation)
