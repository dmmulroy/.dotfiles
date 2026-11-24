# Fish as the default shell, Fisher, and the plugins in fish_plugins (their
# files are gitignored; `fisher update` restores any a pull deleted).
__define_component fish all optional "Fish shell"

# Pinned Fisher release, fetched only where no package manager provides Fisher (apt).
FISHER_RELEASE_VERSION="4.4.8"

component_fish_install() {
    __setup_fish_shell
}

component_fish_update() {
    __update_fish_plugins
}

component_fish_check() {
    __doctor_check --hint "install it with brew, apt, or pacman" "Fish is installed" __command_exists fish || return 1
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only fish" "Fish is the default shell" __fish_is_default_shell
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only fish" "Fisher (Fish plugin manager) is installed" fish -c "type -q fisher"
}

# Resolve both paths: on merged-/usr distros /bin/fish and /usr/bin/fish are one file.
__fish_is_default_shell() {
    local fish_path shell_path
    fish_path="$(command -v fish)" || return 1
    shell_path="$(readlink -f "$SHELL" 2>/dev/null || echo "$SHELL")"
    [[ "$shell_path" == "$(readlink -f "$fish_path" 2>/dev/null || echo "$fish_path")" ]]
}

__setup_fish_shell() {
    
    if ! __command_exists fish; then
        __print_error "Fish shell is not installed"
        return 1
    fi
    
    local fish_path
    fish_path=$(command -v fish)
    
    # Add fish to /etc/shells if needed
    if ! grep -q "$fish_path" /etc/shells; then
        __print_info "Adding Fish to /etc/shells..."
        echo "$fish_path" | sudo tee -a /etc/shells >/dev/null
        __print_success "Fish added to /etc/shells"
    fi
    
    # Set fish as default shell; a failure here still installs plugins below.
    local default_shell_failed=false
    if [[ "$SHELL" != "$fish_path" ]]; then
        __print_info "Setting Fish as default shell..."
        # Linux: sudo chsh avoids chsh's own password prompt (passwordless sudo on VMs).
        local chsh_command=(chsh -s "$fish_path")
        if [[ "$DOT_OS" == "linux" ]]; then
            chsh_command=(sudo chsh -s "$fish_path" "$(id -un)")
        fi
        if "${chsh_command[@]}"; then
            __print_success "Default shell changed to Fish"
            __print_info "Please log out and back in for changes to take effect"
        else
            __print_error "Failed to change default shell"
            default_shell_failed=true
        fi
    else
        __print_success "Fish is already the default shell"
    fi
    
    # Fisher comes from Homebrew/pacman. Elsewhere (apt) fetch its function file;
    # this runs after stow so it cannot block stowing ~/.config/fish.
    if ! fish -c "type -q fisher" 2>/dev/null; then
        __print_info "Installing Fisher..."
        mkdir -p "${HOME}/.config/fish/functions"
        if __download_url "https://raw.githubusercontent.com/jorgebucaran/fisher/${FISHER_RELEASE_VERSION}/functions/fisher.fish" \
            "${HOME}/.config/fish/functions/fisher.fish"; then
            __print_success "Fisher installed"
        else
            __print_warning "Failed to install Fisher"
        fi
    fi

    __update_fish_plugins

    [[ "$default_shell_failed" == false ]]
}

# Install/update the plugins listed in fish_plugins. Their files are gitignored,
# so a pull that untracks a plugin file deletes it; `fisher update` restores them.
__update_fish_plugins() {
    if ! __command_exists fish || ! fish -c "type -q fisher" 2>/dev/null; then
        __print_warning "Fisher not installed; skipping Fish plugins (run: dot init)"
        return 0
    fi
    __print_info "Installing Fish plugins from fish_plugins..."
    if fish -c "fisher update" >/dev/null; then
        __print_success "Fish plugins installed"
    else
        __print_warning "Failed to install some Fish plugins"
    fi
}

