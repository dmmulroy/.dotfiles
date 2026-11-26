# Platform detection. One stow tree serves every OS; code branches at runtime
# on DOT_OS (darwin|linux|unknown) and DOT_PACKAGE_MANAGER (brew|apt|pacman|none).

# Set DOT_OS and DOT_PACKAGE_MANAGER. Arguments exist for tests:
#   __detect_platform [kernel-name] [os-release-file]
__detect_platform() {
    local kernel_name="${1:-$(uname -s)}"
    local os_release_file="${2:-/etc/os-release}"

    case "$kernel_name" in
        Darwin) DOT_OS="darwin" ;;
        Linux) DOT_OS="linux" ;;
        *) DOT_OS="unknown" ;;
    esac

    DOT_PACKAGE_MANAGER="none"
    if [[ "$DOT_OS" == "darwin" ]]; then
        DOT_PACKAGE_MANAGER="brew"
    elif [[ "$DOT_OS" == "linux" && -r "$os_release_file" ]]; then
        # Parse instead of sourcing: os-release sets VERSION and other globals.
        local os_release_ids
        os_release_ids="$(awk -F= '$1 == "ID" || $1 == "ID_LIKE" { gsub(/"/, "", $2); printf "%s ", $2 }' "$os_release_file")"
        case " $os_release_ids " in
            *" debian "*|*" ubuntu "*) DOT_PACKAGE_MANAGER="apt" ;;
            *" arch "*|*" archlinux "*) DOT_PACKAGE_MANAGER="pacman" ;;
        esac
    fi
}

# Pass the defaults explicitly: shellcheck 0.9 (Ubuntu/Debian apt) flags SC2120
# when a function reads arguments that no call passes.
__detect_platform "$(uname -s)" /etc/os-release
