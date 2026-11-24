# dot check-packages: which packages from the package lists are missing here.

cmd_check_packages_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} check-packages

Report installed and missing packages from this machine's package lists
(packages/bundle and bundle.work on macOS, packages/apt or packages/pacman on Linux).
EOF
}

cmd_check_packages() {
    __require_no_args check-packages "$@" || return 1
    __require_package_manager || return 1
    __print_header "Checking installed packages"

    local list_name list_file total missing missing_count all_missing=0
    for list_name in $(__package_list_names); do
        list_file="$(__package_list_file "$list_name")" || return 1
        if [[ "$list_name" == "work" ]]; then
            __validate_work_brewfile "$list_file" || return 1
        fi
        total="$(__read_package_list "$list_file" | grep -c . || true)"
        missing="$(__find_missing_packages "$list_file")" || return 1
        missing_count=0
        [[ -n "$missing" ]] && missing_count="$(grep -c . <<< "$missing")"
        all_missing=$((all_missing + missing_count))

        __print_success "$(basename "$list_file"): $((total - missing_count))/${total} installed"
        if [[ $missing_count -gt 0 ]]; then
            __print_warning "Missing from $(basename "$list_file") (${missing_count}):"
            tr '\t' ' ' <<< "$missing" | sed 's/^/  - /'
        fi
    done

    if [[ $all_missing -gt 0 ]]; then
        __print_info "Run '${SCRIPT_NAME} init --only packages' to install missing packages"
    else
        __print_success "All packages are installed!"
    fi
}
