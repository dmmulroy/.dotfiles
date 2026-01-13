alias c 'clear'
alias code 'vim'
alias grep 'grep --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn,.idea,.tox}'
alias ks 'tmux kill-server'
alias pbc 'pbcopy'
alias pbp 'pbpaste'
alias pn 'pnpm'
alias oc 'opencode'
# Disable automatic completion generation for oc to avoid errors
complete -c oc -e
alias scratch 'nvim -c "setlocal buftype=nofile"'
alias vimdiff 'nvim -d'
alias wr 'wrangler'
alias lc 'localcode'
