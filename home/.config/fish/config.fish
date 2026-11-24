# Disable greeting
set fish_greeting 

# Set Editor to neovim
set -gx EDITOR 'nvim'

# Set neovim as the program to open manpages
set -gx MANPAGER 'nvim +Man!'

# Add dot (dotfiles CLI) to PATH; conf.d/paths.fish does too
fish_add_path ~/.dotfiles/dot/bin

# Rex puts its server's rex CLI first on PATH, but startup files reorder PATH.
# Keep it first so rex matches the running server (must stay last).
# Skip system dirs: the Linux server package puts rex in /usr/bin, and moving
# that first would shadow ~/.local/bin (e.g. apt's old nvim over the release).
if set -q REX_BIN_DIR; and not contains -- $REX_BIN_DIR /usr/bin /bin /usr/local/bin /usr/sbin /sbin
    fish_add_path --path --prepend --move $REX_BIN_DIR
end
