# Disable greeting
set fish_greeting 

# Set Editor to neovim
set -gx EDITOR 'nvim'

# Set neovim as the program to open manpages
set -gx MANPAGER 'nvim +Man!'

# Add dotfiles directory to PATH for 'dot' command
fish_add_path ~/.dotfiles

# Rex puts its server's rex CLI first on PATH, but startup files reorder PATH.
# Keep it first so rex matches the running server (must stay last).
if set -q REX_BIN_DIR
    fish_add_path --path --prepend --move $REX_BIN_DIR
end
