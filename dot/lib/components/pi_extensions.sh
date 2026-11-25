# pi extensions: the npm dependencies of the local extensions (home/.pi is an
# npm workspace) and the pi packages a fresh machine needs (pi-claude-cli).
# Runs after the pi component: `pi install` needs pi. pi's package commands
# (install, list, update) do not load the local extensions, so they work
# before the npm dependencies are installed.
__define_component pi_extensions all optional "pi extensions (npm deps, pi-claude-cli)"

PI_EXTENSIONS_WORKSPACE="${HOME_DIR}/.pi"
PI_EXTENSIONS_LOCKFILE="${PI_EXTENSIONS_WORKSPACE}/package-lock.json"
# cksum of the lockfile at the last successful install.
PI_EXTENSIONS_STAMP="${PI_EXTENSIONS_WORKSPACE}/node_modules/.dot-package-lock.cksum"
# pi provider for the Claude subscription (through Claude Code). pi's
# settings.json is gitignored (private gateway), so fresh machines need it
# added explicitly; `pi update --all` (pi component) keeps it current.
PI_CLAUDE_CLI_SOURCE="git:github.com/dmmulroy/pi-claude-cli"

component_pi_extensions_install() {
    local status=0
    __try "pi extension dependencies" __install_pi_extension_deps || status=1
    __try "pi-claude-cli install" __install_pi_claude_cli || status=1
    return "$status"
}

component_pi_extensions_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} update --only pi_extensions" \
        "pi extension dependencies match package-lock.json" __pi_extension_deps_current
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only pi_extensions" \
        "pi-claude-cli is installed" __pi_claude_cli_installed
}

__pi_extension_deps_current() {
    [[ -f "$PI_EXTENSIONS_STAMP" && "$(cat "$PI_EXTENSIONS_STAMP")" == "$(cksum < "$PI_EXTENSIONS_LOCKFILE")" ]]
}

# Reinstalls only when package-lock.json changed since the last install.
# Without these pi fails at startup: "Cannot find module 'mpl'" / 'effect'.
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

__install_pi_claude_cli() {
    if ! __command_exists pi; then
        __print_error "pi is not installed; can't install pi-claude-cli"
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

__pi_claude_cli_installed() {
    local packages
    packages="$(pi list 2>/dev/null)" || return 1
    grep -Fqx "  ${PI_CLAUDE_CLI_SOURCE}" <<< "$packages"
}
