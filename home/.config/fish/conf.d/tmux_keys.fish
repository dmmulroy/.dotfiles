# tmux_keys.fish - Handle CSI-u extended key sequences in fish
#
# When tmux is configured with `extended-keys always`, it sends CSI-u encoded
# sequences for modifier+key combos to ALL programs, not just those that request
# them. This means fish receives raw escape sequences for keys like Shift+Enter
# that it wouldn't normally see.
#
# Without these bindings, Shift+Enter in fish (inside tmux) would print the raw
# escape sequence instead of acting as Enter.
#
# These bindings only affect the fish shell itself — TUI apps like pi that have
# their own CSI-u parsers handle these sequences natively.

if set -q TMUX
    # Shift+Enter (CSI-u: \e[13;2u) → execute command (same as Enter)
    bind \e\[13\;2u execute
    # Also handle the older xterm-style format tmux may use
    bind \e\[27\;2\;13~ execute
end
