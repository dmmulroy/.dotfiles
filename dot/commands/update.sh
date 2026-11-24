# dot update: pull the repo, then run every component's update step
# (components without one run their install step).

cmd_update_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} update [--only LIST] [--skip LIST] [--dry-run] [--no-pull]

Pull the dotfiles repo, then update every component in order: packages,
stowed config, Bun, Vite+ and Node.js, Herdr plugins, Rex, pi and its
packages, Claude Code, Fish plugins, and the rest ('${SCRIPT_NAME} components').
When the pull changes dot/ itself, dot restarts with the new version first.

OPTIONS:
    --only LIST     Update only these components (comma-separated)
    --skip LIST     Skip these components (comma-separated)
    --dry-run       Print the plan and change nothing (no pull either)
    --no-pull       Skip the git pull
EOF
}

cmd_update() {
    DOT_OPTION_ONLY=""
    DOT_OPTION_SKIP=""
    local pull=true
    local original_args=("$@")
    while [[ $# -gt 0 ]]; do
        __parse_component_option "$@" || return 1
        if (( DOT_OPTION_SHIFT > 0 )); then
            shift "$DOT_OPTION_SHIFT"
            continue
        fi
        case "$1" in
            --no-pull) pull=false ;;
            *)
                __print_error "Unknown update option: $1"
                __print_info "Run '${SCRIPT_NAME} update --help' for usage"
                return 1
                ;;
        esac
        shift
    done
    __select_components "$DOT_OPTION_ONLY" "$DOT_OPTION_SKIP" || return 1

    if [[ "$DOT_DRY_RUN" == true ]]; then
        __print_header "Updating dotfiles (dry run: nothing changes)"
        [[ "$pull" == true ]] && __print_info "Would run: git -C ${DOTFILES_DIR} pull"
    else
        __acquire_run_lock || return 1
        __print_header "Updating dotfiles"
        if [[ "$pull" == true ]]; then
            __pull_dotfiles_and_restart ${original_args[@]+"${original_args[@]}"} || return 1
        fi
    fi

    if ! __run_component_phase update; then
        __print_header "Update stopped at a failed required component"
        return 1
    fi
    if [[ "$DOT_DRY_RUN" == true ]]; then
        __print_header "Dry run complete (nothing changed)"
    else
        __print_header "Update complete"
    fi
}

# git pull the repo. When the pull changed dot/, exec the new dot with
# --no-pull and the same arguments: the running shell already loaded the old
# functions, and the new components may differ. exec keeps the PID, so the
# new process keeps the run lock.
__pull_dotfiles_and_restart() {
    local head_before head_after
    head_before="$(git -C "$DOTFILES_DIR" rev-parse HEAD)" || return 1

    __print_info "Pulling latest changes..."
    if ! git -C "$DOTFILES_DIR" pull; then
        __print_error "Failed to pull the dotfiles repo"
        return 1
    fi
    __print_success "Repository updated"

    head_after="$(git -C "$DOTFILES_DIR" rev-parse HEAD)" || return 1
    if [[ "$head_before" != "$head_after" ]] && ! git -C "$DOTFILES_DIR" diff --quiet "$head_before" "$head_after" -- dot; then
        __print_info "The pull changed dot/; restarting with the new version..."
        exec "${DOT_ROOT}/bin/dot" update --no-pull "$@"
    fi
}
