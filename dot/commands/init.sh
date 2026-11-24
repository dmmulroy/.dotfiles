# dot init: run every component's install step (dot/lib/components/).

cmd_init_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} init [--only LIST] [--skip LIST] [--dry-run] [--headless]
                   [--skip-ssh] [--skip-font]

Install everything this machine needs, one component at a time (list them
with '${SCRIPT_NAME} components'). Safe to run again: each step skips what is
already installed. A failed required component stops the run.

OPTIONS:
    --only LIST     Run only these components (comma-separated)
    --skip LIST     Skip these components (comma-separated)
    --dry-run       Print the plan and change nothing
    --headless      No prompts (each takes its default) and no font, for
                    exe.dev and other remote VMs (iac repo, infra/exe-dev)
    --skip-ssh      Same as --skip ssh_key
    --skip-font     Same as --skip font
EOF
}

cmd_init() {
    DOT_OPTION_ONLY=""
    DOT_OPTION_SKIP=""
    while [[ $# -gt 0 ]]; do
        __parse_component_option "$@" || return 1
        if (( DOT_OPTION_SHIFT > 0 )); then
            shift "$DOT_OPTION_SHIFT"
            continue
        fi
        case "$1" in
            --skip-ssh) __append_component_option --skip ssh_key ;;
            --skip-font) __append_component_option --skip font ;;
            --headless)
                # The GitHub key is still generated (ssh-keygen needs no input);
                # the iac repo (infra/exe-dev) registers it on GitHub.
                __append_component_option --skip font
                export DOT_HEADLESS=true
                export DEBIAN_FRONTEND=noninteractive
                ;;
            *)
                __print_error "Unknown init option: $1"
                __print_info "Run '${SCRIPT_NAME} init --help' for usage"
                return 1
                ;;
        esac
        shift
    done
    __select_components "$DOT_OPTION_ONLY" "$DOT_OPTION_SKIP" || return 1

    if [[ "$DOT_DRY_RUN" == true ]]; then
        __print_header "Initializing dotfiles (dry run: nothing changes)"
    else
        __acquire_run_lock || return 1
        __print_header "Initializing dotfiles"
    fi

    if ! __run_component_phase install; then
        __print_header "Initialization stopped at a failed required component"
        return 1
    fi
    if [[ "$DOT_DRY_RUN" == true ]]; then
        __print_header "Dry run complete (nothing changed)"
    else
        __print_header "Initialization complete! 🎉"
    fi
}
