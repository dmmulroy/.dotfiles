# Linux tools the distro lacks or ships too old, installed into ~/.local:
# Neovim and tree-sitter at pinned releases, starship from its install script. Bump the pinned versions here to upgrade them.
__define_component linux_extras linux optional "Linux extras (Neovim, tree-sitter, starship)"

# Pinned so every VM gets the same build; Debian/Ubuntu's are too old for this config.
NEOVIM_RELEASE_VERSION="v0.12.6"
NEOVIM_MINIMUM_MINOR=11
# nvim-treesitter (main) builds parsers with the tree-sitter CLI and needs >= 0.26.1.
TREE_SITTER_RELEASE_VERSION="v0.27.2"
TREE_SITTER_MINIMUM_MINOR=26

LINUX_EXTRAS_OPT_DIR="${HOME}/.local/opt"
LINUX_EXTRAS_BIN_DIR="${HOME}/.local/bin"

component_linux_extras_install() {
    mkdir -p "$LINUX_EXTRAS_BIN_DIR"
    export PATH="${LINUX_EXTRAS_BIN_DIR}:${PATH}"
    local status=0

    __try "Neovim release install" __install_neovim_release || status=1
    if [[ "$DOT_PACKAGE_MANAGER" != "pacman" ]]; then
        __try "tree-sitter release install" __install_tree_sitter_release || status=1
    fi
    __try "starship install" __install_linux_tool_from_script starship \
        https://starship.rs/install.sh sh -y -b "$LINUX_EXTRAS_BIN_DIR" || status=1
    return "$status"
}

component_linux_extras_check() {
    __doctor_check "Neovim is installed" __command_exists nvim || return 1
    if [[ "$DOT_PACKAGE_MANAGER" != "pacman" ]]; then
        __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only linux_extras" \
            "tree-sitter CLI is installed" __command_exists tree-sitter
    fi
    __doctor_check --warn "starship is installed" __command_exists starship
}

# Print the Linux release architecture name a project uses for this machine.
#   __linux_release_arch x86_64 arm64   # Neovim's names
__linux_release_arch() {
    local x86_name="$1"
    local arm_name="$2"
    case "$(uname -m)" in
        x86_64|amd64) printf '%s\n' "$x86_name" ;;
        aarch64|arm64) printf '%s\n' "$arm_name" ;;
        *) return 1 ;;
    esac
}

# True when a version like 0.12 is at least 0.<minimum_minor>.
__version_at_least_minor() {
    local version="$1"
    local minimum_minor="$2"
    [[ "$version" =~ ^([0-9]+)\.([0-9]+) ]] || return 1
    [[ "${BASH_REMATCH[1]}" -gt 0 || "${BASH_REMATCH[2]}" -ge "$minimum_minor" ]]
}

# Neovim from its GitHub release at NEOVIM_RELEASE_VERSION, unpacked to
# ~/.local/opt/nvim-<version> with ~/.local/bin/nvim pointing into it.
# A distro Neovim that is new enough (Arch) is left alone.
__install_neovim_release() {
    local target_dir="${LINUX_EXTRAS_OPT_DIR}/nvim-${NEOVIM_RELEASE_VERSION}"
    local nvim_link="${LINUX_EXTRAS_BIN_DIR}/nvim"

    if [[ -x "${target_dir}/bin/nvim" && "$(readlink "${LINUX_EXTRAS_OPT_DIR}/nvim" 2>/dev/null)" == "$target_dir" ]]; then
        __print_success "Neovim ${NEOVIM_RELEASE_VERSION} is installed"
        return 0
    fi
    local current_path current_version
    if current_path="$(command -v nvim)" && [[ "$current_path" != "$nvim_link" ]] &&
        current_version="$(nvim --version | sed -nE '1s/^NVIM v([0-9]+\.[0-9]+).*/\1/p')" &&
        __version_at_least_minor "$current_version" "$NEOVIM_MINIMUM_MINOR"; then
        __print_success "Neovim ${current_version} from the distro is new enough"
        return 0
    fi

    local arch
    if ! arch="$(__linux_release_arch x86_64 arm64)"; then
        __print_error "No Neovim release for $(uname -m)"
        return 1
    fi

    __print_info "Installing Neovim ${NEOVIM_RELEASE_VERSION} (linux-${arch}) to ${target_dir}..."
    local work_dir
    work_dir="$(mktemp -d)" || return 1
    if __download_url "https://github.com/neovim/neovim/releases/download/${NEOVIM_RELEASE_VERSION}/nvim-linux-${arch}.tar.gz" "${work_dir}/nvim.tar.gz" &&
        tar -xzf "${work_dir}/nvim.tar.gz" -C "$work_dir"; then
        mkdir -p "$LINUX_EXTRAS_OPT_DIR" "$LINUX_EXTRAS_BIN_DIR"
        rm -rf "$target_dir"
        mv "${work_dir}/nvim-linux-${arch}" "$target_dir"
        ln -sfn "$target_dir" "${LINUX_EXTRAS_OPT_DIR}/nvim"
        ln -sfn "${LINUX_EXTRAS_OPT_DIR}/nvim/bin/nvim" "$nvim_link"
        # Older layouts: unversioned nvim-linux-<arch> and previous pins.
        find "$LINUX_EXTRAS_OPT_DIR" -maxdepth 1 \( -name 'nvim-linux-*' -o -name 'nvim-v*' \) \
            ! -path "$target_dir" -exec rm -rf {} +
        rm -rf "$work_dir"
        __print_success "Neovim ${NEOVIM_RELEASE_VERSION} installed"
    else
        rm -rf "$work_dir"
        __print_error "Failed to install Neovim ${NEOVIM_RELEASE_VERSION}"
        return 1
    fi
}

# tree-sitter CLI from its GitHub release at TREE_SITTER_RELEASE_VERSION, into
# ~/.local/bin. A distro tree-sitter that is new enough is left alone.
__install_tree_sitter_release() {
    local target="${LINUX_EXTRAS_BIN_DIR}/tree-sitter"
    local wanted_version="${TREE_SITTER_RELEASE_VERSION#v}"

    if [[ -x "$target" ]] && "$target" --version 2>/dev/null | grep -q "^tree-sitter ${wanted_version}\b"; then
        __print_success "tree-sitter ${wanted_version} is installed"
        return 0
    fi
    local current_path current_version
    if current_path="$(command -v tree-sitter)" && [[ "$current_path" != "$target" ]] &&
        current_version="$(tree-sitter --version | sed -nE 's/^tree-sitter ([0-9]+\.[0-9]+).*/\1/p')" &&
        __version_at_least_minor "$current_version" "$TREE_SITTER_MINIMUM_MINOR"; then
        __print_success "tree-sitter ${current_version} from the distro is new enough"
        return 0
    fi

    local arch
    if ! arch="$(__linux_release_arch x64 arm64)"; then
        __print_error "No tree-sitter release for $(uname -m)"
        return 1
    fi

    __print_info "Installing tree-sitter ${wanted_version} (linux-${arch}) to ${target}..."
    mkdir -p "$LINUX_EXTRAS_BIN_DIR"
    local archive="${target}.gz.tmp"
    if __download_url "https://github.com/tree-sitter/tree-sitter/releases/download/${TREE_SITTER_RELEASE_VERSION}/tree-sitter-linux-${arch}.gz" "$archive" &&
        gunzip -c "$archive" > "${target}.tmp" && chmod +x "${target}.tmp" && mv "${target}.tmp" "$target"; then
        rm -f "$archive"
        __print_success "tree-sitter ${wanted_version} installed"
    else
        rm -f "$archive" "${target}.tmp"
        __print_error "Failed to install tree-sitter ${wanted_version}"
        return 1
    fi
}

# Install a tool from its upstream install script when it is not on PATH:
#   __install_linux_tool_from_script starship https://starship.rs/install.sh sh -y -b ~/.local/bin
__install_linux_tool_from_script() {
    local tool_name="$1"
    shift
    if __command_exists "$tool_name"; then
        __print_success "${tool_name} is already installed"
        return 0
    fi
    __print_info "Installing ${tool_name}..."
    if __run_remote_installer "$@"; then
        __print_success "${tool_name} installed"
    else
        __print_error "Failed to install ${tool_name}"
        return 1
    fi
}
