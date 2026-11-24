# Component registry: everything dot installs is a component with a file in
# dot/lib/components/<name>.sh that calls __define_component and defines:
#   component_<name>_install   required; must be safe to run again
#   component_<name>_update    optional; `dot update` runs install when missing
#   component_<name>_check     required; what `dot doctor` runs
# `dot init`, `dot update`, and `dot doctor` all walk this one list
# (component-runner.sh), so a new tool is one file plus one line below.

# Run order for every phase. Later components may use what earlier ones installed.
DOT_COMPONENT_ORDER=(
    homebrew        # macOS package manager
    packages        # packages/bundle (+ bundle.work), packages/apt, packages/pacman
    linux_extras    # Neovim, tree-sitter, starship, herdr releases on Linux
    stow            # symlink home/ into ~
    bun
    herdr_plugins
    rex
    scroll_reverser
    vite_plus       # also Node.js runtimes and npm
    pi_extensions   # npm deps of home/.pi extensions
    pi
    claude_code
    pi_claude_cli
    ssh_key         # GitHub SSH key; moves the dotfiles remote to SSH
    tailnet_ssh     # ssh exe-dev-* over Tailscale
    font            # MonoLisa
    fish            # default shell + Fisher plugins
)

# Names defined so far, in definition order (the loader defines them in run order).
DOT_COMPONENTS=()
# Space-padded name lists set by --only and --skip (" a b ").
DOT_ONLY_COMPONENTS=""
DOT_SKIP_COMPONENTS=""

# Register a component. Called once at the top of its file:
#   __define_component rex all optional "Rex"
# os: all, darwin, or linux. required: init/update stop when its step fails,
# and doctor counts a failed check as critical; optional ones warn and continue.
__define_component() {
    local name="$1"
    local os="$2"
    local requirement="$3"
    local title="$4"

    if [[ ! "$name" =~ ^[a-z][a-z0-9_]*$ ]]; then
        __print_error "Invalid component name '${name}': use lowercase letters, digits, and _"
        return 1
    fi
    case "$os" in
        all|darwin|linux) ;;
        *) __print_error "Invalid os '${os}' for component ${name}: expected all, darwin, or linux"; return 1 ;;
    esac
    case "$requirement" in
        required|optional) ;;
        *) __print_error "Invalid requirement '${requirement}' for component ${name}: expected required or optional"; return 1 ;;
    esac
    if [[ -z "$title" ]]; then
        __print_error "Component ${name} needs a title"
        return 1
    fi

    printf -v "DOT_COMPONENT_OS__${name}" '%s' "$os"
    printf -v "DOT_COMPONENT_REQUIREMENT__${name}" '%s' "$requirement"
    printf -v "DOT_COMPONENT_TITLE__${name}" '%s' "$title"
    DOT_COMPONENTS+=("$name")
}

__component_is_defined() {
    local os_var="DOT_COMPONENT_OS__$1"
    [[ -n "${!os_var:-}" ]]
}

__component_os() {
    local os_var="DOT_COMPONENT_OS__$1"
    printf '%s\n' "${!os_var}"
}

__component_title() {
    local title_var="DOT_COMPONENT_TITLE__$1"
    printf '%s\n' "${!title_var}"
}

__component_is_required() {
    local requirement_var="DOT_COMPONENT_REQUIREMENT__$1"
    [[ "${!requirement_var}" == "required" ]]
}

# Print the function that runs a phase (install, update, check) for a
# component, or fail when it has none. update falls back to install, which
# every component keeps safe to rerun.
__component_phase_function() {
    local name="$1"
    local phase="$2"
    if declare -F "component_${name}_${phase}" >/dev/null; then
        printf '%s\n' "component_${name}_${phase}"
    elif [[ "$phase" == "update" ]] && declare -F "component_${name}_install" >/dev/null; then
        printf '%s\n' "component_${name}_install"
    else
        return 1
    fi
}

# Set which components run from comma-separated --only and --skip values.
# Unknown names fail, so a typo never silently runs everything.
# SKIP_SSH=true and SKIP_FONT=true (old flags) skip ssh_key and font.
__select_components() {
    local only_csv="$1"
    local skip_csv="$2"
    local name

    [[ "${SKIP_SSH:-false}" == "true" ]] && skip_csv="${skip_csv:+${skip_csv},}ssh_key"
    [[ "${SKIP_FONT:-false}" == "true" ]] && skip_csv="${skip_csv:+${skip_csv},}font"

    DOT_ONLY_COMPONENTS=" "
    DOT_SKIP_COMPONENTS=" "
    for name in ${only_csv//,/ }; do
        if ! __component_is_defined "$name"; then
            __print_error "Unknown component '${name}' in --only (list them with: ${SCRIPT_NAME} components)"
            return 1
        fi
        DOT_ONLY_COMPONENTS+="${name} "
    done
    for name in ${skip_csv//,/ }; do
        if ! __component_is_defined "$name"; then
            __print_error "Unknown component '${name}' in --skip (list them with: ${SCRIPT_NAME} components)"
            return 1
        fi
        DOT_SKIP_COMPONENTS+="${name} "
    done
    [[ "$DOT_ONLY_COMPONENTS" == " " ]] && DOT_ONLY_COMPONENTS=""
    [[ "$DOT_SKIP_COMPONENTS" == " " ]] && DOT_SKIP_COMPONENTS=""
    return 0
}

# Comma-separated --only/--skip values collected by __parse_component_option.
DOT_OPTION_ONLY=""
DOT_OPTION_SKIP=""
# Arguments the last __parse_component_option call consumed (0: not its option).
DOT_OPTION_SHIFT=0

# Parse one option shared by init, update, and doctor: --only LIST, --skip LIST
# (comma-separated component names, also --only=LIST), and --dry-run. Usage:
#   __parse_component_option "$@" || return 1
#   if (( DOT_OPTION_SHIFT > 0 )); then shift "$DOT_OPTION_SHIFT"; continue; fi
__parse_component_option() {
    DOT_OPTION_SHIFT=0
    case "${1:-}" in
        --dry-run)
            DOT_DRY_RUN=true
            DOT_OPTION_SHIFT=1
            ;;
        --only|--skip)
            if [[ $# -lt 2 || -z "$2" ]]; then
                __print_error "Option $1 needs a comma-separated list of components"
                return 1
            fi
            __append_component_option "$1" "$2"
            DOT_OPTION_SHIFT=2
            ;;
        --only=*|--skip=*)
            __append_component_option "${1%%=*}" "${1#*=}"
            DOT_OPTION_SHIFT=1
            ;;
    esac
}

__append_component_option() {
    if [[ "$1" == "--only" ]]; then
        DOT_OPTION_ONLY="${DOT_OPTION_ONLY:+${DOT_OPTION_ONLY},}$2"
    else
        DOT_OPTION_SKIP="${DOT_OPTION_SKIP:+${DOT_OPTION_SKIP},}$2"
    fi
}

# True when a component runs on this machine with the current --only/--skip.
__component_is_selected() {
    local name="$1"
    local os
    os="$(__component_os "$name")"
    [[ "$os" == "all" || "$os" == "$DOT_OS" ]] || return 1
    if [[ -n "$DOT_ONLY_COMPONENTS" && "$DOT_ONLY_COMPONENTS" != *" ${name} "* ]]; then
        return 1
    fi
    [[ "$DOT_SKIP_COMPONENTS" != *" ${name} "* ]]
}

# Source dot/lib/components/<name>.sh for every name in DOT_COMPONENT_ORDER and
# check that each file defined its component with install and check phases.
__load_components() {
    local name
    for name in "${DOT_COMPONENT_ORDER[@]}"; do
        # shellcheck source=/dev/null
        source "${DOT_LIB_DIR}/components/${name}.sh"
        if ! __component_is_defined "$name"; then
            __print_error "Component file components/${name}.sh did not call __define_component ${name}"
            return 1
        fi
        if ! declare -F "component_${name}_install" >/dev/null || ! declare -F "component_${name}_check" >/dev/null; then
            __print_error "Component ${name} must define component_${name}_install and component_${name}_check"
            return 1
        fi
    done
}
