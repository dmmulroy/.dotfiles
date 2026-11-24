# Claude Code's native installer (~/.local/bin/claude). pi-claude-cli runs it
# for the Claude subscription; log in yourself afterwards: `claude auth login`.
__define_component claude_code all optional "Claude Code"

component_claude_code_install() {
    if __command_exists claude; then
        __print_success "Claude Code is already installed"
        return 0
    fi
    __print_info "Installing Claude Code..."
    if __run_remote_installer https://claude.ai/install.sh bash; then
        export PATH="${HOME}/.local/bin:${PATH}"
        __print_success "Claude Code installed (log in with: claude auth login)"
    else
        __print_error "Failed to install Claude Code"
        return 1
    fi
}

component_claude_code_update() {
    if ! __command_exists claude; then
        component_claude_code_install
        return
    fi
    if claude update; then
        __print_success "Claude Code is up to date"
    else
        __print_warning "claude update failed"
    fi
}

component_claude_code_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only claude_code" "Claude Code is installed" __command_exists claude
}
