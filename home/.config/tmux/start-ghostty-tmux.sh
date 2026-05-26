#!/usr/bin/env bash

set -euo pipefail

# This replaces tmux-continuum's macOS startup script, which supports
# Terminal.app/iTerm/kitty/Alacritty but not Ghostty. Only the first Ghostty
# terminal at login enters restored tmux; ordinary new windows use Fish.
login_command="$HOME/.config/tmux/ghostty-login-tmux.sh"
open_command="${GHOSTTY_OPEN_COMMAND:-/usr/bin/open}"
if [[ -x "$login_command" ]]; then
    exec "$open_command" -na Ghostty.app --args "--initial-command=${login_command}"
fi

# Keep Ghostty available with its configured/default shell if startup setup is
# incomplete for any reason.
exec "$open_command" -na Ghostty.app
