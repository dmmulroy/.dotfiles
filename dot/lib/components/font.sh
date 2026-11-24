# MonoLisa, cloned from a private GitHub repo with the GitHub SSH key (ssh_key
# component) into ~/Library/Fonts or ~/.local/share/fonts. Asks first, so
# `dot update` only reports whether it is installed.
__define_component font all optional "MonoLisa font"

FONT_REPO_URL="git@github.com:dmmulroy/mono-lisa.git"

component_font_install() {
    __install_font
}

component_font_update() {
    if __font_installed; then
        __print_success "MonoLisa is installed"
    else
        __print_warning "MonoLisa is not installed (run: ${SCRIPT_NAME} init --only font)"
    fi
}

component_font_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only font" "MonoLisa is installed" __font_installed
}

__font_install_dir() {
    if [[ "$DOT_OS" == "linux" ]]; then
        printf '%s\n' "${HOME}/.local/share/fonts"
    else
        printf '%s\n' "${HOME}/Library/Fonts"
    fi
}

__font_installed() {
    local font_dir
    font_dir="$(__font_install_dir)"
    [[ -d "$font_dir" ]] && [[ -n "$(find "$font_dir" -maxdepth 3 -iname 'MonoLisa*' -print -quit 2>/dev/null)" ]]
}

__install_font() {
    if __font_installed; then
        __print_success "MonoLisa is already installed"
        return 0
    fi
    local github_private_key
    if ! github_private_key=$(__existing_github_private_key); then
        __print_warning "GitHub SSH key not found. Skipping font installation"
        return 0
    fi

    if ! __confirm "Have you added the SSH key to your GitHub account?" "n"; then
        __print_warning "Skipping font installation"
        return 0
    fi

    local font_temp_dir
    font_temp_dir=$(mktemp -d)
    local font_install_dir
    font_install_dir="$(__font_install_dir)"

    __print_info "Cloning font repository..."
    if GIT_SSH_COMMAND="ssh -i '$github_private_key' -o IdentitiesOnly=yes" git clone "$FONT_REPO_URL" "$font_temp_dir"; then
        __print_success "Repository cloned successfully"

        mkdir -p "$font_install_dir"
        __print_info "Installing font files..."

        local font_count=0
        while IFS= read -r -d '' font_file; do
            cp "$font_file" "$font_install_dir/"
            ((++font_count))
        done < <(find "$font_temp_dir" -type f \( -name '*.otf' -o -name '*.ttf' \) -print0)

        if [[ $font_count -gt 0 ]]; then
            if [[ "$DOT_OS" == "linux" ]] && __command_exists fc-cache; then
                fc-cache -f "$font_install_dir" >/dev/null
            fi
            __print_success "Installed $font_count font files"
        else
            __print_warning "No font files found in repository"
        fi
    else
        __print_error "Failed to clone font repository"
        rm -rf "$font_temp_dir"
        return 1
    fi

    rm -rf "$font_temp_dir"
}
