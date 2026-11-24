# dot stow: re-link home/ into ~ (the stow component's install step).

cmd_stow_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} stow

Re-create the symlinks from the repo's home/ into ~ with GNU Stow. Files that
block stow are moved to ~/.dot-backup/<time>/ after you confirm.
EOF
}

cmd_stow() {
    __require_no_args stow "$@" || return 1
    __print_header "Stowing dotfiles"
    __stow_dotfiles
}
