# Homebrew, the macOS package manager. Its packages are the packages component;
# `brew update` runs there too, so this component has no update step of its own.
__define_component homebrew darwin required "Homebrew"

HOMEBREW_INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"

component_homebrew_install() {
    if __command_exists brew; then
        __print_success "Homebrew is already installed"
        return 0
    fi

    __print_info "Installing Homebrew (non-interactive)..."
    local log_file
    log_file="$(mktemp)"
    local status=0
    NONINTERACTIVE=1 __run_remote_installer "$HOMEBREW_INSTALL_SCRIPT_URL" /bin/bash > "$log_file" 2>&1 || status=$?

    if [[ $status -ne 0 ]]; then
        __print_error "Homebrew installation failed (exit code: ${status}); last lines of its output:"
        tail -20 "$log_file" | sed 's/^/  /'
        __print_info "Check disk space, admin rights, and the network, or run the installer by hand:"
        __print_info "  /bin/bash -c \"\$(curl -fsSL ${HOMEBREW_INSTALL_SCRIPT_URL})\""
        rm -f "$log_file"
        return 1
    fi
    rm -f "$log_file"

    # Later components in this run need brew before a new shell picks up PATH.
    if [[ "$(uname -m)" == "arm64" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        eval "$(/usr/local/bin/brew shellenv)"
    fi
    __print_success "Homebrew installed"
}

component_homebrew_update() {
    if ! __command_exists brew; then
        component_homebrew_install
        return
    fi
    __print_success "Homebrew is installed (the packages step runs brew update)"
}

component_homebrew_check() {
    __doctor_check "Homebrew is installed" __command_exists brew
}
