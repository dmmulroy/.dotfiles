# User paths (use $HOME for portability across machines)
fish_add_path "$HOME/.dotfiles"
fish_add_path "$HOME/.local/bin"
fish_add_path "$HOME/.opencode/bin"
fish_add_path "$HOME/.config/opencode/scripts"
fish_add_path "/Applications/Ghostty.app/Contents/MacOS"

# Rex CLI (installed by the Rex app with its server). Versions/Current follows
# app updates. Inside Rex panes, REX_BIN_DIR (config.fish) still goes first.
set -l rex_cli_dir "$HOME/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS"
if test -x "$rex_cli_dir/rex"
    fish_add_path --global --path "$rex_cli_dir"
end
