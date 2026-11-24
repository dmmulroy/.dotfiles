# Terminal output for dot: colored status lines, yes/no prompts, and the
# small wrappers (__try, __doctor_check) that print one line per outcome.

# Colors only on a terminal, and never with NO_COLOR (logs, CI, bats).
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' RESET=''
fi

# Warnings printed in this shell; the component runner diffs it per step to
# mark steps that succeeded with warnings. Subshells do not add to it.
DOT_WARNING_COUNT=0

__print_header() {
    echo -e "\n${BOLD}${BLUE}==>${RESET} ${BOLD}$1${RESET}"
}

__print_success() {
    echo -e "${GREEN}✓${RESET} $1"
}

__print_error() {
    echo -e "${RED}✗${RESET} $1" >&2
}

__print_warning() {
    ((++DOT_WARNING_COUNT))
    echo -e "${YELLOW}⚠${RESET} $1"
}

__print_info() {
    echo -e "${CYAN}ℹ${RESET} $1"
}

__command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# True when the newline-separated list $2 contains the exact line $1.
__list_contains() {
    local needle="$1"
    local values="$2"
    grep -Fqx -- "$needle" <<< "$values"
}

# Yes/no prompt. Headless runs (exe.dev first boot) and non-tty stdin take the default.
__confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-n}"
    local response=""

    if [[ "$default" == "y" ]]; then
        prompt="$prompt [Y/n]: "
    else
        prompt="$prompt [y/N]: "
    fi

    if [[ "${DOT_HEADLESS:-false}" == "true" || ! -t 0 ]]; then
        __print_info "${prompt}${default} (non-interactive)"
        [[ "$default" == "y" ]]
        return
    fi

    read -r -p "$prompt" response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        [nN][oO]|[nN]) return 1 ;;
        "") [[ "$default" == "y" ]] ;;
        *) return 1 ;;
    esac
}

__require_no_args() {
    local command_name="$1"
    shift
    if [[ $# -gt 0 ]]; then
        __print_error "Unexpected argument for '$command_name': $1"
        __print_info "Run '${SCRIPT_NAME} ${command_name} --help' for usage"
        return 1
    fi
}

# Run one sub-step of a component and keep going when it fails:
#   __try "Rex config reload" __reload_rex_config || status=1
# Prints "<description> failed; continuing" and returns the command's failure.
__try() {
    local description="$1"
    shift
    if "$@"; then
        return 0
    fi
    __print_warning "${description} failed; continuing"
    return 1
}

# One doctor check line. Runs the command quietly and prints ✓ LABEL, or
# ✗ LABEL (returns 1). With --warn a failure prints ⚠ and still returns 0, so
# only real problems fail a component's check. --hint adds how to fix it.
#   __doctor_check "Homebrew is installed" __command_exists brew
#   __doctor_check --warn --hint "run: dot init --only font" "MonoLisa is installed" __font_installed
__doctor_check() {
    local severity="error"
    local hint=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --warn) severity="warning"; shift ;;
            --hint) hint="$2"; shift 2 ;;
            *) break ;;
        esac
    done
    local label="$1"
    shift

    if "$@" >/dev/null 2>&1; then
        __print_success "$label"
        return 0
    fi
    if [[ "$severity" == "warning" ]]; then
        __print_warning "Check failed: ${label}${hint:+ ($hint)}"
        return 0
    fi
    __print_error "Check failed: ${label}${hint:+ ($hint)}"
    return 1
}
