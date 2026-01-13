# Disable greeting
set fish_greeting 

# Set Editor to neovim
set -gx EDITOR 'nvim'

# Set neovim as the program to open manpages
set -gx MANPAGER 'nvim +Man!'

# OpenCode experimental features
set -gx OPENCODE_EXPERIMENTAL_LSP_TOOL 1
set -gx OPENCODE_EXPERIMENTAL_PLAN_MODE 1

# Add dotfiles directory to PATH for 'dot' command
fish_add_path ~/.dotfiles



# Added by OrbStack: command-line tools and integration
# This won't be added again if you remove it.
source ~/.orbstack/shell/init2.fish 2>/dev/null || :
