# dot edit: open the dotfiles repo in $EDITOR.

cmd_edit_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} edit

Open ${DOTFILES_DIR} in \$EDITOR (default: nvim).
EOF
}

cmd_edit() {
    __require_no_args edit "$@" || return 1
    local editor="${EDITOR:-nvim}"
    if ! __command_exists "$editor"; then
        __print_error "Editor '${editor}' not found; set EDITOR"
        return 1
    fi
    exec "$editor" "$DOTFILES_DIR"
}
