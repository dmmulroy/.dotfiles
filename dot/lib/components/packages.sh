# Packages from the package lists (package-lists.sh): packages/bundle and, when
# you confirm, packages/bundle.work on macOS; packages/apt or packages/pacman on Linux.
__define_component packages all required "Packages (Brewfile, apt, or pacman)"

component_packages_install() {
    __require_package_manager || return 1
    DOT_FAILED_PACKAGES=()

    if [[ "$DOT_PACKAGE_MANAGER" != "brew" ]]; then
        __package_refresh_index || return 1
    fi

    local base_list
    base_list="$(__package_list_file base)" || return 1
    __install_package_list "$base_list" || return 1

    local work_list="${PACKAGES_DIR}/bundle.work"
    if [[ "$DOT_PACKAGE_MANAGER" == "brew" && -f "$work_list" ]] && __confirm "Install work-specific packages?" "n"; then
        __validate_work_brewfile "$work_list" || return 1
        __install_package_list "$work_list" || return 1
    fi

    __save_failed_packages
}

component_packages_update() {
    __require_package_manager || return 1
    __print_info "Updating the ${DOT_PACKAGE_MANAGER} package index..."
    if ! __package_refresh_index; then
        __print_error "Failed to refresh the ${DOT_PACKAGE_MANAGER} package index"
        return 1
    fi
    if ! __package_upgrade_all; then
        __print_error "Failed to upgrade ${DOT_PACKAGE_MANAGER} packages"
        return 1
    fi
    __print_success "Packages are up to date"
}

component_packages_check() {
    __require_package_manager || return 1
    __doctor_check "git is installed" __command_exists git || return 1

    local list_name list_file missing
    for list_name in $(__package_list_names); do
        list_file="$(__package_list_file "$list_name")" || return 1
        if ! missing="$(__find_missing_packages "$list_file")"; then
            return 1
        fi
        if [[ -z "$missing" ]]; then
            __print_success "Every package in $(basename "$list_file") is installed"
        else
            __print_warning "Not installed from $(basename "$list_file") (run: ${SCRIPT_NAME} init --only packages):"
            tr '\t' ' ' <<< "$missing" | sed 's/^/    /'
        fi
    done
}
