# npm dependencies of the local pi extensions (home/.pi is an npm workspace).
# Without them pi fails at startup: "Cannot find module 'mpl'" / 'effect'.
# Reinstalls only when package-lock.json changed since the last install.
__define_component pi_extensions all optional "pi extension dependencies"

PI_EXTENSIONS_WORKSPACE="${HOME_DIR}/.pi"
PI_EXTENSIONS_LOCKFILE="${PI_EXTENSIONS_WORKSPACE}/package-lock.json"
# cksum of the lockfile at the last successful install.
PI_EXTENSIONS_STAMP="${PI_EXTENSIONS_WORKSPACE}/node_modules/.dot-package-lock.cksum"

component_pi_extensions_install() {
    __install_pi_extension_deps
}

component_pi_extensions_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} update --only pi_extensions" \
        "pi extension dependencies match package-lock.json" __pi_extension_deps_current
}

__pi_extension_deps_current() {
    [[ -f "$PI_EXTENSIONS_STAMP" && "$(cat "$PI_EXTENSIONS_STAMP")" == "$(cksum < "$PI_EXTENSIONS_LOCKFILE")" ]]
}

__install_pi_extension_deps() {
    if [[ ! -f "$PI_EXTENSIONS_LOCKFILE" ]]; then
        __print_warning "No ${PI_EXTENSIONS_LOCKFILE}; skipping pi extension dependencies"
        return 0
    fi
    if ! __command_exists npm; then
        __print_error "npm not found (Vite+ provides it); can't install pi extension dependencies"
        return 1
    fi
    if __pi_extension_deps_current; then
        __print_success "pi extension dependencies are up to date"
        return 0
    fi

    local lock_cksum
    lock_cksum="$(cksum < "$PI_EXTENSIONS_LOCKFILE")"
    __print_info "Installing pi extension dependencies..."
    # The lockfile pins github dependencies (mpl) as git+ssh. They are public, so
    # fetch over https: a new machine has no GitHub SSH key yet during `dot init`.
    if (cd "$PI_EXTENSIONS_WORKSPACE" &&
        GIT_CONFIG_COUNT=2 \
        GIT_CONFIG_KEY_0="url.https://github.com/.insteadOf" GIT_CONFIG_VALUE_0="ssh://git@github.com/" \
        GIT_CONFIG_KEY_1="url.https://github.com/.insteadOf" GIT_CONFIG_VALUE_1="git@github.com:" \
        npm ci --no-audit --no-fund </dev/null); then
        printf '%s\n' "$lock_cksum" > "$PI_EXTENSIONS_STAMP"
        __print_success "pi extension dependencies installed"
    else
        __print_error "Failed to install pi extension dependencies (pi will not start until they are)"
        return 1
    fi
}
