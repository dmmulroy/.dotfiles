# pi-claude-cli: the pi provider for the Claude subscription (through Claude
# Code). pi's settings.json is gitignored (private gateway), so fresh machines
# need the package added explicitly; `pi update --all` (pi component) updates it.
__define_component pi_claude_cli all optional "pi-claude-cli"

PI_CLAUDE_CLI_SOURCE="git:github.com/dmmulroy/pi-claude-cli"

component_pi_claude_cli_install() {
    if ! __command_exists pi; then
        __print_error "pi is not installed"
        return 1
    fi
    if __pi_claude_cli_installed; then
        __print_success "pi-claude-cli is already installed"
        return 0
    fi
    __print_info "Installing pi-claude-cli..."
    if pi install "$PI_CLAUDE_CLI_SOURCE" </dev/null; then
        __print_success "pi-claude-cli installed (pick a model with /model after claude auth login)"
    else
        __print_error "Failed to install pi-claude-cli"
        return 1
    fi
}

component_pi_claude_cli_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only pi_claude_cli" "pi-claude-cli is installed" __pi_claude_cli_installed
}

__pi_claude_cli_installed() {
    local packages
    packages="$(pi list 2>/dev/null)" || return 1
    grep -Fqx "  ${PI_CLAUDE_CLI_SOURCE}" <<< "$packages"
}
