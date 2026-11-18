alias bunx 'vpx'
alias c 'clear'
alias code 'vim'
alias codex 'pi'
alias grep 'grep --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn,.idea,.tox}'
alias npx 'vpx'
if command -q pbcopy
    alias pbc 'pbcopy'
    alias pbp 'pbpaste'
else if set -q WAYLAND_DISPLAY; and command -q wl-copy
    alias pbc 'wl-copy'
    alias pbp 'wl-paste --no-newline'
else if command -q xclip
    alias pbc 'xclip -selection clipboard'
    alias pbp 'xclip -selection clipboard -o'
end
# Debian/Ubuntu install fd as fdfind
if not command -q fd; and command -q fdfind
    alias fd 'fdfind'
end
alias pn 'pnpm'
alias scratch 'nvim -c "setlocal buftype=nofile"'
alias vimdiff 'nvim -d'
alias wr 'wrangler'
