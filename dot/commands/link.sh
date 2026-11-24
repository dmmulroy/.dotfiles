# dot link / dot unlink: a global `dot` symlink for shells that do not put
# dot/bin on PATH (Fish does, in conf.d/paths.fish).

cmd_link_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} link

Symlink ${DOT_ROOT}/bin/dot into /usr/local/bin, or ~/.local/bin when
/usr/local/bin is not writable.
EOF
}

cmd_unlink_usage() {
    cat << EOF
USAGE:
    ${SCRIPT_NAME} unlink

Remove the dot symlinks that '${SCRIPT_NAME} link' created.
EOF
}

cmd_link() {
    __require_no_args link "$@" || return 1
    __print_header "Creating symlink for dot command"

    local target_dir="/usr/local/bin"
    if [[ ! -w "$target_dir" ]]; then
        target_dir="${HOME}/.local/bin"
        mkdir -p "$target_dir"
        __print_info "/usr/local/bin is not writable; using ${target_dir}"
    fi
    local link_path="${target_dir}/dot"

    if [[ -e "$link_path" && ! -L "$link_path" ]]; then
        __print_error "Refusing to replace ${link_path}: it is not a symlink"
        return 1
    fi
    if ln -sfn "${DOT_ROOT}/bin/dot" "$link_path"; then
        __print_success "Created symlink at ${link_path}"
        __print_info "Make sure ${target_dir} is in your PATH"
    else
        __print_error "Failed to create symlink at ${link_path}"
        return 1
    fi
}

cmd_unlink() {
    __require_no_args unlink "$@" || return 1
    __print_header "Removing dot symlink"

    local found=false
    local link_path
    # dotfiles: the command's old name.
    for link_path in /usr/local/bin/dot "${HOME}/.local/bin/dot" /usr/local/bin/dotfiles "${HOME}/.local/bin/dotfiles"; do
        [[ -L "$link_path" ]] || continue
        if rm "$link_path"; then
            __print_success "Removed symlink at ${link_path}"
            found=true
        else
            __print_error "Failed to remove symlink at ${link_path}"
        fi
    done
    if [[ "$found" == false ]]; then
        __print_warning "No dot symlink found"
    fi
}
