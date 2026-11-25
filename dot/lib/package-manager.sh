# Package manager adapter: one set of verbs over Homebrew, apt, and pacman.
# Every verb takes a package type (brew, cask, apt, pacman), so commands and
# components never branch on the OS to install, upgrade, or list packages.

# Packages that failed during this run, as "<type>:<name>"; see __save_failed_packages.
DOT_FAILED_PACKAGES=()

# Print the package types this machine installs, one per line.
__package_types() {
    case "$DOT_PACKAGE_MANAGER" in
        brew) printf '%s\n' brew cask ;;
        apt|pacman) printf '%s\n' "$DOT_PACKAGE_MANAGER" ;;
    esac
}

# Fail with a message unless this machine has a supported, installed package manager.
__require_package_manager() {
    case "$DOT_PACKAGE_MANAGER" in
        brew)
            if ! __command_exists brew; then
                __print_error "Homebrew is not installed (run: ${SCRIPT_NAME} init --only homebrew)"
                return 1
            fi
            ;;
        apt|pacman) ;;
        *)
            __print_error "Unsupported platform: expected macOS (Homebrew), Debian/Ubuntu (apt), or Arch (pacman)"
            return 1
            ;;
    esac
}

__unknown_package_type() {
    __print_error "Unknown package type '$1': expected brew, cask, apt, or pacman"
    return 1
}

# Install packages of one type: __package_install brew git fd
__package_install() {
    local package_type="$1"
    shift
    case "$package_type" in
        brew) brew install "$@" ;;
        cask) brew install --cask "$@" ;;
        apt) sudo apt-get install -y "$@" ;;
        pacman) sudo pacman -S --needed --noconfirm "$@" ;;
        *) __unknown_package_type "$package_type" ;;
    esac
}

# Upgrade installed packages of one type to their newest version.
__package_upgrade() {
    local package_type="$1"
    shift
    case "$package_type" in
        brew) brew upgrade "$@" ;;
        cask) brew upgrade --cask "$@" ;;
        apt) sudo apt-get install --only-upgrade -y "$@" ;;
        pacman) sudo pacman -S --needed --noconfirm "$@" ;;
        *) __unknown_package_type "$package_type" ;;
    esac
}

# Uninstall packages of one type.
__package_uninstall() {
    local package_type="$1"
    shift
    case "$package_type" in
        brew) brew uninstall "$@" ;;
        cask) brew uninstall --cask "$@" ;;
        apt) sudo apt-get remove -y "$@" ;;
        pacman) sudo pacman -R --noconfirm "$@" ;;
        *) __unknown_package_type "$package_type" ;;
    esac
}

# Print installed package names of one type, one per line.
__package_installed_names() {
    case "$1" in
        brew) brew list --formula -1 ;;
        cask) brew list --cask -1 ;;
        apt) dpkg-query -W -f='${db:Status-Status} ${Package}\n' | awk '$1 == "installed" { print $2 }' ;;
        pacman) pacman -Qq ;;
        *) __unknown_package_type "$1" ;;
    esac
}

# Print installed packages of one type that have a newer version, one per line.
__package_outdated_names() {
    case "$1" in
        brew) brew outdated --formula --quiet ;;
        cask) brew outdated --cask --quiet ;;
        apt) apt list --upgradable 2>/dev/null | awk -F/ 'NR > 1 { print $1 }' ;;
        # pacman -Qu exits 1 when nothing is outdated.
        pacman) { pacman -Qu || true; } | awk '{ print $1 }' ;;
        *) __unknown_package_type "$1" ;;
    esac
}

# Print the package type for a name: Homebrew formula or cask by lookup,
# otherwise this machine's Linux package manager.
__package_detect_type() {
    local package_name="$1"
    if [[ "$DOT_PACKAGE_MANAGER" != "brew" ]]; then
        printf '%s\n' "$DOT_PACKAGE_MANAGER"
        return 0
    fi
    if brew info --json=v2 --formula "$package_name" >/dev/null 2>&1; then
        echo brew
    elif brew info --json=v2 --cask "$package_name" >/dev/null 2>&1; then
        echo cask
    else
        __print_warning "Package '${package_name}' is neither a formula nor a cask; assuming a formula"
        echo brew
    fi
}

# Refresh the package index (brew update, apt-get update, pacman -Sy).
__package_refresh_index() {
    case "$DOT_PACKAGE_MANAGER" in
        brew)
            # Cloudflare WARP's latency trips brew's curl speed limit while it
            # fetches the API files; fetch them first with retries.
            if pgrep -q "Cloudflare WARP"; then
                __print_info "Cloudflare WARP detected, pre-downloading the Homebrew API..."
                local api_cache="${HOME}/Library/Caches/Homebrew/api"
                mkdir -p "$api_cache"
                __download_url "https://formulae.brew.sh/api/formula.jws.json" "${api_cache}/formula.jws.json" || true
                __download_url "https://formulae.brew.sh/api/cask.jws.json" "${api_cache}/cask.jws.json" || true
            fi
            brew update
            ;;
        apt) sudo apt-get update ;;
        pacman) sudo pacman -Sy ;;
        *) __require_package_manager ;;
    esac
}

# Upgrade every installed package (brew upgrade, apt-get upgrade, pacman -Syu).
__package_upgrade_all() {
    case "$DOT_PACKAGE_MANAGER" in
        brew)
            local outdated
            outdated="$(brew outdated)" || return 1
            if [[ -z "$outdated" ]]; then
                __print_success "All Homebrew packages are up to date"
                return 0
            fi
            __print_info "Upgrading:"
            sed 's/^/  /' <<< "$outdated"
            brew upgrade --yes
            ;;
        apt) sudo apt-get upgrade -y ;;
        pacman) sudo pacman -Syu --noconfirm ;;
        *) __require_package_manager ;;
    esac
}

# Install every entry of a package list file in one batch; when the batch
# fails, retry one package at a time and record failures in DOT_FAILED_PACKAGES.
__install_package_list() {
    local list_file="$1"
    local list_label
    list_label="$(basename "$list_file")"

    if [[ ! -f "$list_file" ]]; then
        __print_error "Package list not found: ${list_file}"
        return 1
    fi

    local batch_ok=false
    if __package_list_is_brewfile "$list_file"; then
        brew bundle --file="$list_file" && batch_ok=true
    else
        local names=()
        local entry_type entry_name
        while IFS=$'\t' read -r entry_type entry_name; do
            names+=("$entry_name")
        done < <(__read_package_list "$list_file")
        __print_info "Installing ${#names[@]} ${DOT_PACKAGE_MANAGER} packages from ${list_label}..."
        if [[ ${#names[@]} -eq 0 ]] || __package_install "$DOT_PACKAGE_MANAGER" "${names[@]}"; then
            batch_ok=true
        fi
    fi

    if [[ "$batch_ok" == true ]]; then
        __print_success "All packages in ${list_label} are installed"
        return 0
    fi

    # One bad name fails the whole batch, so retry one at a time.
    __print_warning "Some packages in ${list_label} failed to install, trying individually..."
    local entry_type entry_name
    while IFS=$'\t' read -r entry_type entry_name; do
        if ! __package_install "$entry_type" "$entry_name" >/dev/null 2>&1; then
            __print_warning "Failed to install ${entry_type} package: ${entry_name}"
            DOT_FAILED_PACKAGES+=("${entry_type}:${entry_name}")
        fi
    done < <(__read_package_list "$list_file")
}

# Load the installed (or outdated) names of one package type into the cache
# variable DOT_PACKAGE_CACHE__<kind>__<type>, once per run.
__load_package_cache() {
    local kind="$1"
    local package_type="$2"
    local cache_var="DOT_PACKAGE_CACHE__${kind}__${package_type}"
    declare -p "$cache_var" >/dev/null 2>&1 && return 0

    local names
    if [[ "$kind" == "installed" ]]; then
        names="$(__package_installed_names "$package_type")" || {
            __print_error "Failed to list installed ${package_type} packages"
            return 1
        }
    else
        names="$(__package_outdated_names "$package_type")" || {
            __print_error "Failed to list outdated ${package_type} packages"
            return 1
        }
    fi
    printf -v "$cache_var" '%s' "$names"
}

# Forget cached installed/outdated names (after installs or upgrades).
__clear_package_cache() {
    local package_type
    for package_type in brew cask apt pacman; do
        unset "DOT_PACKAGE_CACHE__installed__${package_type}" "DOT_PACKAGE_CACHE__outdated__${package_type}"
    done
}

# Print the name a package manager lists a package under: brew list and
# brew outdated drop the tap from tap-qualified names (user/tap/name -> name).
__package_listed_name() {
    case "$1" in
        brew|cask) printf '%s\n' "${2##*/}" ;;
        *) printf '%s\n' "$2" ;;
    esac
}

# True when a package of a type is installed. Returns 2 when listing fails.
__package_is_installed() {
    __load_package_cache installed "$1" || return 2
    local cache_var="DOT_PACKAGE_CACHE__installed__$1"
    __list_contains "$(__package_listed_name "$1" "$2")" "${!cache_var}"
}

# True when an installed package of a type has a newer version. Returns 2 when listing fails.
__package_is_outdated() {
    __load_package_cache outdated "$1" || return 2
    local cache_var="DOT_PACKAGE_CACHE__outdated__$1"
    __list_contains "$(__package_listed_name "$1" "$2")" "${!cache_var}"
}

# Print the entries of a package list that are not installed, as "<type><TAB><name>".
__find_missing_packages() {
    local list_file="$1"
    local entries entry_type entry_name status
    entries="$(__read_package_list "$list_file")"
    [[ -n "$entries" ]] || return 0
    while IFS=$'\t' read -r entry_type entry_name; do
        status=0
        __package_is_installed "$entry_type" "$entry_name" || status=$?
        case "$status" in
            0) ;;
            1) printf '%s\t%s\n' "$entry_type" "$entry_name" ;;
            *) return 1 ;;
        esac
    done <<< "$entries"
}

# Write DOT_FAILED_PACKAGES to packages/failed_packages_<time>_<pid>.txt for
# `dot retry-failed`, and print them.
__save_failed_packages() {
    [[ ${#DOT_FAILED_PACKAGES[@]} -eq 0 ]] && return 0

    __print_warning "Failed to install ${#DOT_FAILED_PACKAGES[@]} package(s):"
    printf '  - %s\n' "${DOT_FAILED_PACKAGES[@]}"

    local failed_file
    failed_file="${PACKAGES_DIR}/failed_packages_$(date +%Y%m%d_%H%M%S)_$$.txt"
    printf '%s\n' "${DOT_FAILED_PACKAGES[@]}" | sort -u > "$failed_file"
    __print_info "Failed packages saved to: ${failed_file} (retry with: ${SCRIPT_NAME} retry-failed)"
}
