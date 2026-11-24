# dot components: list the registry (dot/lib/component-registry.sh).

cmd_components_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} components [--names]

List every component in run order: platform, whether it is required, whether
it has its own update step (otherwise update reruns install), and whether it
runs on this machine. --names prints only the names (for completions).
EOF
}

cmd_components() {
    local names_only=false
    case "${1:-}" in
        "") ;;
        --names) names_only=true ;;
        *)
            __print_error "Unknown components option: $1"
            return 1
            ;;
    esac

    local name
    if [[ "$names_only" == true ]]; then
        for name in "${DOT_COMPONENTS[@]}"; do
            echo "$name"
        done
        return 0
    fi

    printf "${BOLD}%-16s %-7s %-9s %-8s %-5s %s${RESET}\n" "COMPONENT" "OS" "REQUIRED" "UPDATE" "HERE" "TITLE"
    local requirement update_step here
    for name in "${DOT_COMPONENTS[@]}"; do
        requirement="optional"
        __component_is_required "$name" && requirement="required"
        update_step="install"
        declare -F "component_${name}_update" >/dev/null && update_step="own"
        here="no"
        __component_is_selected "$name" && here="yes"
        printf "%-16s %-7s %-9s %-8s %-5s %s\n" "$name" "$(__component_os "$name")" "$requirement" "$update_step" "$here" "$(__component_title "$name")"
    done
}
