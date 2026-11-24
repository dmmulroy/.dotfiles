# The GitHub SSH key (~/.ssh/id_ed25519_github): generated without prompts (so
# headless VMs get one too), registered with gh when it has the key scopes,
# and once GitHub accepts it, the dotfiles remote moves from HTTPS to SSH.
# Git signs commits with it too (home/.config/git/config).
# The iac repo's exe.dev first boot sources dot/bin/dot and calls
# __github_accepts_ssh_key and __use_ssh_remote_for_dotfiles; keep those names.
__define_component ssh_key all optional "GitHub SSH key"

GITHUB_EMAIL="dillon.mulroy@gmail.com"
GITHUB_PRIVATE_KEY_PATH="${HOME}/.ssh/id_ed25519_github"

component_ssh_key_install() {
    __generate_ssh_key
}

component_ssh_key_update() {
    if ! __existing_github_private_key >/dev/null; then
        __print_warning "No GitHub SSH key at ${GITHUB_PRIVATE_KEY_PATH} (run: ${SCRIPT_NAME} init --only ssh_key)"
        return 0
    fi
    __use_ssh_remote_for_dotfiles
}

component_ssh_key_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only ssh_key" \
        "GitHub SSH private key exists at ${GITHUB_PRIVATE_KEY_PATH}" test -f "$GITHUB_PRIVATE_KEY_PATH"
    __doctor_check --warn "GitHub SSH public key exists at ${GITHUB_PRIVATE_KEY_PATH}.pub" test -f "${GITHUB_PRIVATE_KEY_PATH}.pub"
}

__existing_github_private_key() {
    if [[ -f "$GITHUB_PRIVATE_KEY_PATH" ]]; then
        printf '%s\n' "$GITHUB_PRIVATE_KEY_PATH"
    else
        return 1
    fi
}

# ssh does not try id_ed25519_github by default; point github.com at it.
__ensure_github_ssh_config() {
    local ssh_config="${HOME}/.ssh/config"
    if [[ -f "$ssh_config" ]] && grep -qiE '^[[:space:]]*Host[[:space:]]+github\.com([[:space:]]|$)' "$ssh_config"; then
        return 0
    fi
    printf '\nHost github.com\n  AddKeysToAgent yes\n  IdentityFile %s\n' "$GITHUB_PRIVATE_KEY_PATH" >> "$ssh_config"
    chmod 600 "$ssh_config"
    __print_success "Added github.com to ${ssh_config}"
}

# Register a public key on GitHub as an authentication key (push/pull) and a
# signing key (Verified commits). Needs gh logged in with the key scopes:
#   gh auth refresh -h github.com -s admin:public_key,admin:ssh_signing_key
# Returns 1 without changing anything when gh or the scopes are missing.
__add_github_ssh_key_with_gh() {
    local pub_file="$1" title="$2" key_type out auth_status
    __command_exists gh || return 1
    auth_status="$(gh auth status -h github.com 2>&1)" || return 1
    if [[ "$auth_status" != *admin:public_key* || "$auth_status" != *admin:ssh_signing_key* ]]; then
        return 1
    fi
    for key_type in authentication signing; do
        if out="$(gh ssh-key add "$pub_file" --title "$title" --type "$key_type" 2>&1)"; then
            __print_success "Added the key to GitHub (${key_type}, ${title})"
        elif [[ "$out" == *"already"* ]]; then
            __print_success "The key is already on GitHub (${key_type})"
        else
            __print_warning "gh ssh-key add --type ${key_type} failed: ${out}"
            return 1
        fi
    done
}

__print_github_key_hint() {
    local pub_key="$1" title="$2"
    __print_info "Add this key to GitHub as an authentication key and a signing key (title: ${title}):"
    echo "  ${pub_key}"
    echo "  With gh: gh auth refresh -h github.com -s admin:public_key,admin:ssh_signing_key  (once),"
    echo "  then gh ssh-key add <file> --type authentication, and again with --type signing"
}

# True when GitHub accepts this machine's SSH key (ssh -T always exits 1 there).
__github_accepts_ssh_key() {
    local greeting
    # Not a pipe: under pipefail, ssh's exit 1 would fail it even on success.
    greeting="$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -T git@github.com </dev/null 2>&1 || true)"
    [[ "$greeting" == *"successfully authenticated"* ]]
}

# Switch the dotfiles remote from HTTPS to SSH once GitHub accepts this machine's key.
__use_ssh_remote_for_dotfiles() {
    local url
    url="$(git -C "$DOTFILES_DIR" remote get-url origin 2>/dev/null)" || return 0
    [[ "$url" == https://github.com/* ]] || return 0
    local ssh_url="git@github.com:${url#https://github.com/}"
    if __github_accepts_ssh_key; then
        git -C "$DOTFILES_DIR" remote set-url origin "$ssh_url"
        __print_success "Dotfiles remote now uses SSH (${ssh_url})"
    else
        __print_info "GitHub does not accept this machine's SSH key yet; the dotfiles remote stays on HTTPS"
    fi
}

# Generate the GitHub key (non-interactive, so headless runs do it too), register it
# with gh when possible, and move the dotfiles remote to SSH once it works.
__generate_ssh_key() {
    if __existing_github_private_key >/dev/null; then
        __print_success "SSH key already exists at $GITHUB_PRIVATE_KEY_PATH"
    else
        __print_info "Generating new SSH key..."
        mkdir -p "${HOME}/.ssh"
        chmod 700 "${HOME}/.ssh"
        if ssh-keygen -q -t ed25519 -C "$GITHUB_EMAIL" -f "$GITHUB_PRIVATE_KEY_PATH" -N ""; then
            __print_success "SSH key generated at $GITHUB_PRIVATE_KEY_PATH"
        else
            __print_error "Failed to generate SSH key"
            return 1
        fi
    fi
    __ensure_github_ssh_config

    local title
    title="$(hostname -s 2>/dev/null || hostname)"
    if __github_accepts_ssh_key; then
        __print_success "GitHub accepts this machine's SSH key"
    elif ! __add_github_ssh_key_with_gh "${GITHUB_PRIVATE_KEY_PATH}.pub" "$title"; then
        __print_github_key_hint "$(cat "${GITHUB_PRIVATE_KEY_PATH}.pub")" "$title"
    fi
    __use_ssh_remote_for_dotfiles
}
