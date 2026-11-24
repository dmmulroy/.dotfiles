# Vite+ (`vp`): Node.js runtimes, npm, and global installs (pi comes from it).
__define_component vite_plus all required "Vite+ and Node.js"

component_vite_plus_install() {
    if __command_exists vp; then
        __print_success "Vite+ is already installed"
        return 0
    fi
    __print_info "Installing Vite+..."
    # Without VP_SELF_SETUP_NO_MODIFY_PATH the installer overwrites the stowed
    # conf.d/vite-plus.fish (writing into this repo) and edits ~/.bashrc/.profile.
    if VP_SELF_SETUP_NO_MODIFY_PATH=1 __run_remote_installer https://vite.plus bash; then
        # pi installs through `vp` in this same process. macOS installs to
        # ~/.vite-plus, Linux to the XDG data dir.
        export PATH="${HOME}/.vite-plus/bin:${XDG_DATA_HOME:-${HOME}/.local/share}/vite-plus/bin:${PATH}"
        __print_success "Vite+ installed"
    else
        __print_error "Failed to install Vite+"
        return 1
    fi
}

component_vite_plus_update() {
    if ! __command_exists vp; then
        component_vite_plus_install || return 1
    elif ! VP_SELF_SETUP_NO_MODIFY_PATH=1 vp upgrade; then
        __print_warning "vp upgrade failed"
    fi

    # Preinstall the newest Node releases (security patches) so the Vite+ shim
    # never has to download one the first time a project resolves to it.
    __print_info "Installing latest Node.js LTS and current releases..."
    if vp env install lts && vp env install latest && vp env default lts >/dev/null; then
        __print_success "Node.js runtimes up to date"
    else
        __print_warning "Failed to update Node.js runtimes"
    fi
}

component_vite_plus_check() {
    __doctor_check --hint "run: ${SCRIPT_NAME} init --only vite_plus" "Vite+ (vp) is installed" __command_exists vp || return 1
    __doctor_check --warn "node is available" __command_exists node
    __doctor_check --warn "npm is available" __command_exists npm
}
