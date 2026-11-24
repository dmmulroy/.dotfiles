# Component runner: walks the registry (component-registry.sh) and runs one
# phase for each selected component, then prints a summary table.
#   install  `dot init`    stops at the first failed required component
#   update   `dot update`  same; components without an update step run install
#   check    `dot doctor`  runs every check; failed required checks are critical

# true: print the plan (which function each component would run) and run nothing.
DOT_DRY_RUN=false

# One entry per component that ran, parallel arrays filled by __record_component_result.
DOT_RESULT_NAMES=()
DOT_RESULT_STATUSES=()
DOT_RESULT_SECONDS=()

__record_component_result() {
    DOT_RESULT_NAMES+=("$1")
    DOT_RESULT_STATUSES+=("$2")
    DOT_RESULT_SECONDS+=("$3")
}

# Run one phase for every selected component. Returns 1 when a required
# component failed (install/update stop there; check runs everything first).
__run_component_phase() {
    local phase="$1"
    case "$phase" in
        install|update|check) ;;
        *) __print_error "Unknown component phase '${phase}': expected install, update, or check"; return 1 ;;
    esac

    DOT_RESULT_NAMES=()
    DOT_RESULT_STATUSES=()
    DOT_RESULT_SECONDS=()

    local selected=()
    local name
    # The ${a[@]+...} form keeps bash 3.2 (fresh macOS) happy with empty arrays under set -u.
    for name in ${DOT_COMPONENTS[@]+"${DOT_COMPONENTS[@]}"}; do
        if __component_is_selected "$name"; then
            selected+=("$name")
        fi
    done
    if [[ ${#selected[@]} -eq 0 ]]; then
        __print_warning "No components selected for this machine"
        return 0
    fi

    local index=0
    local total="${#selected[@]}"
    local phase_function started warnings_before status
    local required_failed=false
    for name in "${selected[@]}"; do
        ((++index))
        echo -e "\n${BOLD}[${index}/${total}]${RESET} $(__component_title "$name") ${CYAN}(${name})${RESET}"

        if ! phase_function="$(__component_phase_function "$name" "$phase")"; then
            __print_info "No ${phase} step"
            __record_component_result "$name" "none" 0
            continue
        fi
        if [[ "$DOT_DRY_RUN" == true ]]; then
            __print_info "Would run ${phase_function}"
            __record_component_result "$name" "planned" 0
            continue
        fi

        started=$SECONDS
        warnings_before=$DOT_WARNING_COUNT
        if "$phase_function"; then
            status="ok"
            if (( DOT_WARNING_COUNT > warnings_before )); then
                status="warnings"
            fi
        else
            status="failed"
        fi
        __record_component_result "$name" "$status" $((SECONDS - started))

        if [[ "$status" == "failed" ]] && __component_is_required "$name"; then
            required_failed=true
            if [[ "$phase" != "check" ]]; then
                __print_error "Required component ${name} failed; stopping"
                break
            fi
        fi
    done

    __print_component_summary "$phase"
    [[ "$required_failed" == false ]]
}

# Print one line per component that ran: status, name, requirement, seconds.
__print_component_summary() {
    local phase="$1"
    __print_header "Summary (${phase})"
    [[ ${#DOT_RESULT_NAMES[@]} -gt 0 ]] || return 0

    local i name status mark requirement
    for i in "${!DOT_RESULT_NAMES[@]}"; do
        name="${DOT_RESULT_NAMES[$i]}"
        status="${DOT_RESULT_STATUSES[$i]}"
        case "$status" in
            ok) mark="${GREEN}✓${RESET}" ;;
            warnings) mark="${YELLOW}⚠${RESET}" ;;
            failed) mark="${RED}✗${RESET}" ;;
            *) mark="${CYAN}·${RESET}" ;;
        esac
        requirement="optional"
        __component_is_required "$name" && requirement="required"
        printf "  %b %-16s %-9s %-8s %3ss\n" "$mark" "$name" "$status" "$requirement" "${DOT_RESULT_SECONDS[$i]}"
    done
}
