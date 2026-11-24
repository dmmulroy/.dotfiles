# GNU Stow links home/ into ~ (home/.config/fish -> ~/.config/fish, ...).
__define_component stow all required "Stow dotfiles"

# Directories other programs write to as well. They must be real directories
# in ~ so stow links the entries inside them; on a fresh machine stow would
# otherwise link the whole directory (~/.config -> repo) and every app's config
# would land in this repo.
STOW_SHARED_DIRECTORIES=(.config .local .local/bin .agents .agents/skills .pi .pi/agent)

component_stow_install() {
    __stow_dotfiles
}

component_stow_check() {
    __doctor_check --hint "install it with brew, apt, or pacman" "GNU Stow is installed" __command_exists stow || return 1
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} stow" "${HOME}/.config/fish is stowed" __path_is_stowed .config/fish
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} stow" \
        "Shared directories (${STOW_SHARED_DIRECTORIES[*]}) are real directories, not links into the repo" \
        __shared_stow_directories_are_real

    local broken_links=0 link
    while IFS= read -r -d '' link; do
        [[ -e "$link" ]] || ((++broken_links))
    done < <(find "$HOME" -maxdepth 3 -type l -print0 2>/dev/null)
    if [[ $broken_links -eq 0 ]]; then
        __print_success "No broken symlinks in ~ (depth 3)"
    else
        __print_warning "Found ${broken_links} broken symlinks in ~ (depth 3)"
    fi

    # Installers that edit shell or tool config can write through stow symlinks
    # into this repo (Vite+ once replaced conf.d/vite-plus.fish).
    local dirty_home
    dirty_home="$(git -C "$DOTFILES_DIR" status --porcelain -- home 2>/dev/null || true)"
    if [[ -n "$dirty_home" ]]; then
        __print_warning "Uncommitted changes under home/ (an installer may have rewritten a stowed file):"
        sed 's/^/    /' <<< "$dirty_home"
    else
        __print_success "No uncommitted changes under home/"
    fi
}

# Move files that block stow (targets stow does not own, e.g. ~/.pi/AGENTS.md
# shipped by the exe.dev exeuntu image) to ~/.dot-backup/<timestamp>/.
__backup_stow_conflicts() {
    local conflicts
    # Stow 2.3 (Ubuntu 24.04) and 2.4 (Homebrew) word the plain-file conflict differently.
    conflicts="$(stow -n -R -v -d "$DOTFILES_DIR" -t "$HOME" home 2>&1 \
        | sed -n -e 's/.*existing target is not owned by stow: //p' \
                 -e 's/.*existing target is neither a link nor a directory: //p' \
                 -e 's/.*over existing target \(.*\) since neither a link nor a directory.*/\1/p' \
        | sort -u)"
    [[ -z "$conflicts" ]] && return 0

    __print_warning "These files block stow:"
    sed 's|^|    ~/|' <<< "$conflicts"
    if ! __confirm "Move them to ~/.dot-backup/ and continue?" "y"; then
        return 1
    fi

    local backup_dir
    backup_dir="${HOME}/.dot-backup/$(date +%Y%m%d-%H%M%S)"
    local target
    while IFS= read -r target; do
        mkdir -p "${backup_dir}/$(dirname "$target")"
        mv "${HOME}/${target}" "${backup_dir}/${target}" || return 1
    done <<< "$conflicts"
    __print_info "Backed up stow conflicts to ${backup_dir}"
}

# True when ~/<path> resolves into the repo's home/<path> (a link there, or
# inside a linked directory).
__path_is_stowed() {
    local relative_path="$1"
    [[ -e "${HOME}/${relative_path}" ]] || return 1
    [[ "$(cd -P "${HOME}/${relative_path}" 2>/dev/null && pwd)" == "$(cd -P "${HOME_DIR}/${relative_path}" && pwd)" ]]
}

__shared_stow_directories_are_real() {
    local shared_directory
    for shared_directory in "${STOW_SHARED_DIRECTORIES[@]}"; do
        [[ -e "${HOME_DIR}/${shared_directory}" ]] || continue
        [[ -d "${HOME}/${shared_directory}" && ! -L "${HOME}/${shared_directory}" ]] || return 1
    done
}

# Make every STOW_SHARED_DIRECTORIES entry a real directory in ~. When stow
# already linked one into the repo (fresh machines before this existed),
# unstow first so stow re-links the entries inside it.
__create_shared_stow_directories() {
    local shared_directory needs_unstow=false
    for shared_directory in "${STOW_SHARED_DIRECTORIES[@]}"; do
        [[ -e "${HOME_DIR}/${shared_directory}" ]] || continue
        if [[ -L "${HOME}/${shared_directory}" ]] && __path_is_stowed "$shared_directory"; then
            needs_unstow=true
        fi
    done
    if [[ "$needs_unstow" == true ]]; then
        __print_warning "Stow linked a shared directory into the repo; re-linking its entries instead"
        __print_info "Files apps wrote there are now in ${HOME_DIR} (see: git -C ${DOTFILES_DIR} status home)"
        stow -D -d "$DOTFILES_DIR" -t "$HOME" home || return 1
    fi
    for shared_directory in "${STOW_SHARED_DIRECTORIES[@]}"; do
        [[ -e "${HOME_DIR}/${shared_directory}" ]] || continue
        mkdir -p "${HOME}/${shared_directory}" || return 1
    done
}

__stow_dotfiles() {
    if ! __command_exists stow; then
        __print_error "GNU Stow is not installed (install it with brew, apt, or pacman)"
        return 1
    fi

    if ! __create_shared_stow_directories; then
        __print_error "Failed to create shared directories for stow in ${HOME}"
        return 1
    fi
    __print_info "Stowing files from ${HOME_DIR} to ${HOME}..."
    if ! __backup_stow_conflicts; then
        __print_error "Failed to stow dotfiles: files block stow"
        return 1
    fi
    if stow -R -v -d "$DOTFILES_DIR" -t "$HOME" home; then
        __print_success "Dotfiles stowed"
    else
        __print_error "Failed to stow dotfiles"
        return 1
    fi
}
