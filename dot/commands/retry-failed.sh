# dot retry-failed: retry packages recorded in packages/failed_packages_*.txt.

cmd_retry_failed_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} retry-failed

Retry every package a failed init recorded in packages/failed_packages_*.txt
(entries are <type>:<name>). Packages that still fail are written to a new file.
EOF
}

cmd_retry_failed() {
    __require_no_args retry-failed "$@" || return 1
    __print_header "Retrying failed package installations"

    local failed_files=()
    local failed_file
    while IFS= read -r failed_file; do
        failed_files+=("$failed_file")
    done < <(find "$PACKAGES_DIR" -name "failed_packages_*.txt" -type f 2>/dev/null | sort)

    if [[ ${#failed_files[@]} -eq 0 ]]; then
        __print_info "No failed packages file found"
        return 0
    fi
    __require_package_manager || return 1

    local entries
    entries="$(cat "${failed_files[@]}" | sort -u)"
    __print_info "Found ${#failed_files[@]} failed package file(s)"

    local retry_count=0 success_count=0
    local entry package_type package_name
    DOT_FAILED_PACKAGES=()
    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        ((++retry_count))
        package_type="${entry%%:*}"
        package_name="${entry#*:}"
        if [[ "$entry" != *:* ]] || ! __package_type_is_supported "$package_type"; then
            __print_warning "Cannot retry '${entry}' on this machine"
            DOT_FAILED_PACKAGES+=("$entry")
            continue
        fi
        __print_info "Retrying ${package_type} package: ${package_name}"
        if __package_install "$package_type" "$package_name" >/dev/null 2>&1; then
            __print_success "Installed ${package_name}"
            ((++success_count))
        else
            __print_warning "Still failing: ${package_name}"
            DOT_FAILED_PACKAGES+=("$entry")
        fi
    done <<< "$entries"

    rm -f "${failed_files[@]}"
    __print_info "Retry complete: ${success_count}/${retry_count} packages installed"
    if [[ ${#DOT_FAILED_PACKAGES[@]} -eq 0 ]]; then
        __print_success "All failed packages are now installed!"
        return 0
    fi
    __save_failed_packages
    return 1
}
