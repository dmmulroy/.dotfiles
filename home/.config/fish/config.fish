#Disable greeting
set fish_greeting 

# Set Editor to neovim
set -gx EDITOR 'nvim'

# Set neovim as the program to open manpages
set -gx MANPAGER 'nvim +Man!'

# Add dotfiles directory to PATH for 'dot' command
fish_add_path ~/.dotfiles

export PATH="$HOME/.dotfiles:$PATH"

alias lg='lazygit'
alias ld='lazydocker'

zoxide init fish | source

starship init fish | source

