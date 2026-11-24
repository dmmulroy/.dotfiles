# Network downloads for dot. Every download retries, and remote install
# scripts are saved in full before they run, so a dropped connection can never
# execute half a script (which `curl | bash` does).

# Download a URL to a file, or to stdout when the destination is "-".
#   __download_url https://example.com/install.sh "$tmp"
__download_url() {
    local url="$1"
    local destination="$2"
    local output_args=(-o "$destination")
    [[ "$destination" == "-" ]] && output_args=()

    curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors --connect-timeout 20 \
        ${output_args[@]+"${output_args[@]}"} "$url"
}

# Download an install script, then run it with an interpreter and arguments.
# Environment assignments in front of the call reach the script:
#   VP_SELF_SETUP_NO_MODIFY_PATH=1 __run_remote_installer https://vite.plus bash
#   __run_remote_installer https://starship.rs/install.sh sh -y -b "$HOME/.local/bin"
__run_remote_installer() {
    local url="$1"
    local interpreter="$2"
    shift 2

    local script
    script="$(mktemp)" || return 1
    if ! __download_url "$url" "$script"; then
        __print_error "Remote installer download failed: ${url}"
        rm -f "$script"
        return 1
    fi

    local status=0
    "$interpreter" "$script" "$@" || status=$?
    rm -f "$script"
    return "$status"
}
