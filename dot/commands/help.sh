# dot help: the command list (DOT_COMMAND_SUMMARIES in dot/lib/dot-main.sh)
# or one command's usage (cmd_<command>_usage in its file).

cmd_help_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} help [COMMAND]
EOF
}

cmd_help() {
    local command_name="${1:-}"
    if [[ -n "$command_name" ]]; then
        local command_function
        if ! command_function="$(__command_function "$command_name")" || ! declare -F "${command_function}_usage" >/dev/null; then
            __print_error "Unknown command: ${command_name}"
            return 1
        fi
        "${command_function}_usage"
        return
    fi

    echo -e "${BOLD}${SCRIPT_NAME}${RESET} ${DOT_VERSION} - set up, update, and check this machine from the dotfiles repo"
    echo ""
    echo -e "${BOLD}USAGE:${RESET}"
    echo "    ${SCRIPT_NAME} COMMAND [ARGS]"
    echo "    ${SCRIPT_NAME} COMMAND --help"
    echo ""
    echo -e "${BOLD}COMMANDS:${RESET}"
    local summary
    for summary in "${DOT_COMMAND_SUMMARIES[@]}"; do
        printf "    %-18s %s\n" "${summary%%|*}" "${summary#*|}"
    done
    echo ""
    echo -e "${BOLD}EXAMPLES:${RESET}"
    echo "    ${SCRIPT_NAME} init                         # set up a new machine"
    echo "    ${SCRIPT_NAME} init --headless              # remote VM: no prompts, no font"
    echo "    ${SCRIPT_NAME} update                       # pull and update everything"
    echo "    ${SCRIPT_NAME} update --only rex,pi         # update two components"
    echo "    ${SCRIPT_NAME} update --dry-run             # show the plan"
    echo "    ${SCRIPT_NAME} doctor                       # check this machine"
    echo "    ${SCRIPT_NAME} components                   # what dot manages"
    echo "    ${SCRIPT_NAME} package add ripgrep          # install + add to the package list"
    echo ""
    echo -e "${BOLD}PATHS:${RESET}"
    echo "    Repo:      ${DOTFILES_DIR}"
    echo "    dot:       ${DOT_ROOT} (how it works: dot/README.md)"
    echo "    Packages:  ${PACKAGES_DIR}"
    echo "    Stowed:    ${HOME_DIR} -> ${HOME}"
}
