# dot_main: global options and command dispatch. `dot <command>` runs
# cmd_<command> from dot/commands/<command>.sh; `dot <command> --help` runs
# cmd_<command>_usage from the same file.

# Every command and its one-line description, for `dot help` and completions.
DOT_COMMAND_SUMMARIES=(
    "init|Install everything on this machine (every component's install step)"
    "update|Pull the repo, then update every component"
    "doctor|Check every component and report problems"
    "components|List components: what dot installs, where, and in which order"
    "package|Add, remove, update, or list packages in the package lists"
    "check-packages|Report installed and missing packages from the package lists"
    "retry-failed|Retry packages that failed during init"
    "stow|Re-link home/ into ~ with GNU Stow"
    "gen-ssh-key|Generate an SSH key for an email address"
    "benchmark-shell|Benchmark Fish shell startup"
    "completions|Regenerate the Fish completions for dot"
    "link|Put dot on PATH with a symlink in /usr/local/bin or ~/.local/bin"
    "unlink|Remove the dot symlinks that link created"
    "edit|Open the dotfiles repo in \$EDITOR"
    "help|Show help for dot or one command"
)

# Print the function name for a command (init -> cmd_init), or fail.
__command_function() {
    # CLI names use dashes; cmd_<command>_usage functions are not commands.
    [[ "$1" =~ ^[a-z][a-z-]*$ && "$1" != *-usage ]] || return 1
    local command_function="cmd_${1//-/_}"
    declare -F "$command_function" >/dev/null || return 1
    printf '%s\n' "$command_function"
}

dot_main() {
    # Global options; the old --skip-ssh/--skip-font before the command still work.
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-ssh) export SKIP_SSH=true; shift ;;
            --skip-font) export SKIP_FONT=true; shift ;;
            --version) echo "${SCRIPT_NAME} version ${DOT_VERSION}"; return 0 ;;
            -h|--help) cmd_help; return 0 ;;
            *) break ;;
        esac
    done

    local command_name="${1:-help}"
    shift || true

    local command_function
    if ! command_function="$(__command_function "$command_name")"; then
        __print_error "Unknown command: ${command_name}"
        echo "Run '${SCRIPT_NAME} help' for usage information"
        return 1
    fi

    # Command help must return before any command side effects.
    if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
        cmd_help "$command_name"
        return
    fi

    "$command_function" "$@"
}
