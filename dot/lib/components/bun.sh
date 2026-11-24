# Bun, from its install script; `bun upgrade` keeps it current.
__define_component bun all required "Bun"

component_bun_install() {
    if __command_exists bun; then
        __print_success "Bun is already installed"
        return 0
    fi
    __print_info "Installing Bun..."
    if __run_remote_installer https://bun.sh/install bash; then
        # Later components in this run need it before a new shell picks up PATH.
        export PATH="${HOME}/.bun/bin:${PATH}"
        __print_success "Bun installed"
    else
        __print_error "Failed to install Bun"
        return 1
    fi
}

component_bun_update() {
    if ! __command_exists bun; then
        component_bun_install
        return
    fi
    if bun upgrade; then
        __print_success "Bun is up to date ($(bun --version))"
    else
        __print_warning "bun upgrade failed"
    fi
}

component_bun_check() {
    __doctor_check --hint "run: ${SCRIPT_NAME} init --only bun" "Bun is installed" __command_exists bun
}
