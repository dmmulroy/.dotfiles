# dot doctor: run every component's check step and report problems.

cmd_doctor_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} doctor [--only LIST] [--skip LIST]

Check every component on this machine. Exits 1 when a required component's
check fails; optional components only report.
EOF
}

cmd_doctor() {
    DOT_OPTION_ONLY=""
    DOT_OPTION_SKIP=""
    while [[ $# -gt 0 ]]; do
        __parse_component_option "$@" || return 1
        if (( DOT_OPTION_SHIFT > 0 )); then
            shift "$DOT_OPTION_SHIFT"
            continue
        fi
        __print_error "Unknown doctor option: $1"
        __print_info "Run '${SCRIPT_NAME} doctor --help' for usage"
        return 1
    done
    # doctor never changes anything, so --dry-run is the same as a normal run.
    DOT_DRY_RUN=false
    __select_components "$DOT_OPTION_ONLY" "$DOT_OPTION_SKIP" || return 1

    __print_header "Running diagnostics"
    __print_info "Platform: ${DOT_OS} (package manager: ${DOT_PACKAGE_MANAGER})"
    __doctor_check --warn --hint "$(__dot_path_hint)" "dot is on PATH" __command_exists dot

    if __run_component_phase check; then
        __print_header "All critical checks passed! ✨"
    else
        __print_header "Critical checks failed (required components marked ✗ above)"
        return 1
    fi
}

__dot_path_hint() {
    if [[ "${SHELL:-}" == *fish* ]]; then
        echo "restart Fish; conf.d/paths.fish adds ${DOT_ROOT}/bin"
    else
        echo "add ${DOT_ROOT}/bin to PATH, or run: ${DOT_ROOT}/bin/dot link"
    fi
}
