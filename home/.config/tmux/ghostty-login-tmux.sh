#!/usr/bin/env bash

set -euo pipefail

# Ghostty runs this only for its initial login terminal. Start the configured
# macOS login shell first so its interactive configuration/environment is loaded
# exactly as it would be in a normal terminal, then hand that terminal to tmux.
user_name="${USER:-$(/usr/bin/id -un)}"
login_shell="$(/usr/bin/dscl . -read "/Users/${user_name}" UserShell 2>/dev/null | /usr/bin/awk '/^UserShell:/ { print $2; exit }' || true)"
if [[ -z "$login_shell" || ! -x "$login_shell" ]]; then
    login_shell="${SHELL:-/bin/zsh}"
fi

case "${login_shell##*/}" in
    fish)
        exec "$login_shell" --login --interactive --command 'exec tmux'
        ;;
    *)
        exec "$login_shell" -lic 'exec tmux'
        ;;
esac
