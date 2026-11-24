# pi, the coding agent, installed globally through Vite+. `pi update --all`
# updates pi and every package in its settings (pi-claude-cli included).
__define_component pi all required "pi"

component_pi_install() {
    if __command_exists pi; then
        __print_success "pi is already installed"
        return 0
    fi
    __print_info "Installing pi..."
    if vp install -g @earendil-works/pi-coding-agent; then
        __print_success "pi installed"
    else
        __print_error "Failed to install pi"
        return 1
    fi
}

component_pi_update() {
    if ! __command_exists pi; then
        component_pi_install
        return
    fi
    __print_info "Updating pi and configured packages..."
    # From the repo so pi sees the checked-out (just re-stowed) project settings.
    if (cd "$DOTFILES_DIR" && pi update --all); then
        __print_success "pi and configured packages updated"
    else
        __print_error "Failed to update pi and configured packages"
        return 1
    fi
}

component_pi_check() {
    __doctor_check --hint "run: ${SCRIPT_NAME} init --only pi" "pi is installed" __command_exists pi
}
