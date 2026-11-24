# dot package: edit the package lists (dot/lib/package-lists.sh) and install,
# upgrade, or uninstall through the package manager adapter
# (dot/lib/package-manager.sh). Same commands on macOS and Linux.

cmd_package_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} package [list|add|remove|update|help] [ARGS]

SUBCOMMANDS:
    list [all|base|work]                  List packages and whether they are installed (default)
    add NAME [TYPE] [base|work]           Install a package and add it to a list
    remove NAME [base|work|auto]          Remove a package from lists; asks before uninstalling
    update [NAME|all] [all|base|work]     Upgrade one package, one list, or everything

TYPE is brew or cask on macOS (detected when omitted), apt or pacman on Linux.
Lists: base is packages/bundle on macOS and packages/apt or packages/pacman on
Linux; work is packages/bundle.work (macOS, formulas only).

EXAMPLES:
    ${SCRIPT_NAME} package add ripgrep
    ${SCRIPT_NAME} package add docker cask
    ${SCRIPT_NAME} package add kubectl brew work
    ${SCRIPT_NAME} package remove docker base
    ${SCRIPT_NAME} package update all base
EOF
}

cmd_package() {
    local subcommand="${1:-list}"
    shift || true

    local argument
    for argument in "$@"; do
        if [[ "$argument" == "-h" || "$argument" == "--help" ]]; then
            cmd_package_usage
            return 0
        fi
    done

    case "$subcommand" in
        add) __package_command_add "$@" ;;
        remove) __package_command_remove "$@" ;;
        update) __package_command_update "$@" ;;
        list) __package_command_list "$@" ;;
        help|-h|--help) cmd_package_usage ;;
        *)
            __print_error "Unknown package subcommand: ${subcommand}"
            __print_info "Run '${SCRIPT_NAME} package help' for usage"
            return 1
            ;;
    esac
}

# Print the list names a list argument selects: all -> every list here.
__selected_package_list_names() {
    case "$1" in
        all|auto) __package_list_names ;;
        base|work) echo "$1" ;;
        *)
            __print_error "Unknown package list '$1': expected all, base, or work"
            return 1
            ;;
    esac
}

__package_type_is_supported() {
    __list_contains "$1" "$(__package_types)"
}

__package_command_add() {
    local package_name="${1:-}"
    if [[ -z "$package_name" || "$package_name" == -* ]]; then
        __print_error "Package name required"
        __print_info "Usage: ${SCRIPT_NAME} package add NAME [TYPE] [base|work]"
        return 1
    fi
    shift
    local package_type="auto"
    local list_name="base"
    local argument
    for argument in "$@"; do
        case "$argument" in
            base|work) list_name="$argument" ;;
            auto|brew|cask|apt|pacman) package_type="$argument" ;;
            *)
                __print_error "Unexpected argument for package add: ${argument}"
                return 1
                ;;
        esac
    done

    __require_package_manager || return 1
    local list_file
    list_file="$(__package_list_file "$list_name")" || return 1

    if [[ "$package_type" == "auto" ]]; then
        package_type="$(__package_detect_type "$package_name")"
    fi
    if ! __package_type_is_supported "$package_type"; then
        __print_error "Package type '${package_type}' does not work here; expected: $(__package_types | tr '\n' ' ')"
        return 1
    fi
    if [[ "$package_type" == "cask" && "$list_name" == "work" ]]; then
        __print_error "Casks must be added to the base list (packages/bundle)"
        return 1
    fi
    if __package_list_entry_type "$list_file" "$package_name" >/dev/null; then
        __print_warning "Package '${package_name}' is already in $(basename "$list_file")"
        return 0
    fi

    __print_header "Adding ${package_type} package: ${package_name}"
    if ! __package_install "$package_type" "$package_name"; then
        __print_error "Failed to install ${package_name}; $(basename "$list_file") is unchanged"
        return 1
    fi
    __package_list_add "$list_file" "$package_type" "$package_name" || return 1
    __print_success "Added '${package_name}' to $(basename "$list_file")"
}

__package_command_remove() {
    local package_name="${1:-}"
    local list_argument="${2:-auto}"
    if [[ -z "$package_name" ]]; then
        __print_error "Package name required"
        __print_info "Usage: ${SCRIPT_NAME} package remove NAME [base|work|auto]"
        return 1
    fi
    if [[ $# -gt 2 ]]; then
        __print_error "Too many arguments for package remove"
        return 1
    fi

    __print_header "Removing package: ${package_name}"
    local list_names list_name list_file removed_type=""
    list_names="$(__selected_package_list_names "$list_argument")" || return 1
    for list_name in $list_names; do
        list_file="$(__package_list_file "$list_name")" || return 1
        local entry_type
        if entry_type="$(__package_list_remove "$list_file" "$package_name")"; then
            removed_type="$entry_type"
            __print_success "Removed '${package_name}' from $(basename "$list_file")"
        fi
    done

    if [[ -z "$removed_type" ]]; then
        __print_warning "Package '${package_name}' is not in any package list"
        return 0
    fi
    if __confirm "Uninstall '${package_name}' from this machine?" "n"; then
        if __package_uninstall "$removed_type" "$package_name"; then
            __print_success "Uninstalled ${package_name}"
        else
            __print_warning "Failed to uninstall ${package_name} (something may depend on it)"
        fi
    else
        __print_info "Removed from the package list but left installed"
    fi
}

__package_command_update() {
    local package_name="${1:-all}"
    local list_argument="${2:-all}"
    if [[ $# -gt 2 ]]; then
        __print_error "Too many arguments for package update"
        return 1
    fi
    __require_package_manager || return 1
    local list_names
    list_names="$(__selected_package_list_names "$list_argument")" || return 1

    __print_header "Updating packages"
    if [[ "$package_name" != "all" ]]; then
        __update_one_package "$package_name" "$list_argument" "$list_names"
        return
    fi

    __print_info "Refreshing the ${DOT_PACKAGE_MANAGER} package index..."
    __package_refresh_index || return 1

    if [[ "$list_argument" == "all" ]]; then
        __package_upgrade_all || return 1
        if [[ "$DOT_PACKAGE_MANAGER" == "brew" ]] && __confirm "Clean up old versions?" "y"; then
            brew cleanup
        fi
        return 0
    fi

    local list_name list_file entry_type entry_name status
    local updated=() failed=()
    for list_name in $list_names; do
        list_file="$(__package_list_file "$list_name")" || return 1
        if [[ "$list_name" == "work" ]]; then
            __validate_work_brewfile "$list_file" || return 1
        fi
        while IFS=$'\t' read -r entry_type entry_name; do
            [[ -n "$entry_name" ]] || continue
            status=0
            __package_is_installed "$entry_type" "$entry_name" || status=$?
            [[ $status -eq 2 ]] && return 1
            if [[ $status -ne 0 ]]; then
                __print_warning "${entry_type} package ${entry_name} is not installed, skipping"
                continue
            fi
            status=0
            __package_is_outdated "$entry_type" "$entry_name" || status=$?
            [[ $status -eq 2 ]] && return 1
            [[ $status -eq 0 ]] || continue

            __print_info "Upgrading ${entry_type} package: ${entry_name}"
            if __package_upgrade "$entry_type" "$entry_name"; then
                updated+=("${entry_name} (${entry_type})")
            else
                failed+=("${entry_name} (${entry_type})")
            fi
        done <<< "$(__read_package_list "$list_file")"
    done

    if [[ ${#updated[@]} -gt 0 ]]; then
        __print_success "Upgraded ${#updated[@]} package(s):"
        printf '  - %s\n' "${updated[@]}"
    elif [[ ${#failed[@]} -eq 0 ]]; then
        __print_success "Every package in the ${list_argument} list is up to date"
    fi
    if [[ ${#failed[@]} -gt 0 ]]; then
        __print_error "Failed to upgrade ${#failed[@]} package(s):"
        printf '  - %s\n' "${failed[@]}"
        return 1
    fi
}

# Upgrade one installed package; with a list other than all, it must be in that list.
__update_one_package() {
    local package_name="$1"
    local list_argument="$2"
    local list_names="$3"

    local package_type="" candidate status
    for candidate in $(__package_types); do
        status=0
        __package_is_installed "$candidate" "$package_name" || status=$?
        [[ $status -eq 2 ]] && return 1
        if [[ $status -eq 0 ]]; then
            package_type="$candidate"
            break
        fi
    done
    if [[ -z "$package_type" ]]; then
        __print_error "Package '${package_name}' is not installed"
        return 1
    fi

    if [[ "$list_argument" != "all" ]]; then
        local list_name list_file in_list=false
        for list_name in $list_names; do
            list_file="$(__package_list_file "$list_name")" || return 1
            __package_list_entry_type "$list_file" "$package_name" >/dev/null && in_list=true
        done
        if [[ "$in_list" == false ]]; then
            __print_error "Package '${package_name}' is not in the ${list_argument} list"
            return 1
        fi
    fi

    status=0
    __package_is_outdated "$package_type" "$package_name" || status=$?
    [[ $status -eq 2 ]] && return 1
    if [[ $status -ne 0 ]]; then
        __print_success "${package_name} is already up to date"
        return 0
    fi
    __print_info "Upgrading ${package_type} package: ${package_name}"
    if __package_upgrade "$package_type" "$package_name"; then
        __print_success "Upgraded ${package_name}"
    else
        __print_error "Failed to upgrade ${package_name}"
        return 1
    fi
}

__package_command_list() {
    local list_argument="${1:-all}"
    if [[ $# -gt 1 ]]; then
        __print_error "Too many arguments for package list"
        return 1
    fi
    __require_package_manager || return 1
    local list_names
    list_names="$(__selected_package_list_names "$list_argument")" || return 1

    local list_name list_file entries entry_type entry_name status
    for list_name in $list_names; do
        list_file="$(__package_list_file "$list_name")" || return 1
        if [[ ! -f "$list_file" ]]; then
            __print_error "Package list not found: ${list_file}"
            return 1
        fi
        echo -e "\n${BOLD}${list_name} packages ($(basename "$list_file")):${RESET}"
        entries="$(__read_package_list "$list_file")"
        if [[ -z "$entries" ]]; then
            __print_info "  No packages"
            continue
        fi
        while IFS=$'\t' read -r entry_type entry_name; do
            status=0
            __package_is_installed "$entry_type" "$entry_name" || status=$?
            case "$status" in
                0) __print_success "  ${entry_name} ${CYAN}(${entry_type})${RESET}" ;;
                1) __print_error "  ${entry_name} ${CYAN}(${entry_type})${RESET} not installed" ;;
                *) return 1 ;;
            esac
        done <<< "$entries"
    done
}
