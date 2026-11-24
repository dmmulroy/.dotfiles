# dot gen-ssh-key: generate an Ed25519 key for any email, add it to ssh-agent,
# and copy the public key. (The GitHub key dot init makes is the ssh_key component.)

cmd_gen_ssh_key_usage() {
    cat << USAGE
USAGE:
    ${SCRIPT_NAME} gen-ssh-key [EMAIL]

Generate ~/.ssh/id_ed25519_<email domain>, add it to ssh-agent, and copy the
public key to the clipboard. Prompts for EMAIL when omitted.
USAGE
}

cmd_gen_ssh_key() {
    __print_header "Generating SSH key for GitHub"

    # Parse options
    local email=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                cmd_gen_ssh_key_usage
                return 0
                ;;
            *)
                email="$1"
                shift
                ;;
        esac
    done

    # Get email if not provided
    if [[ -z "$email" ]]; then
        read -r -p "Enter email address for SSH key: " email
        if [[ -z "$email" ]]; then
            __print_error "Email is required"
            return 1
        fi
    fi

    # Validate email format (basic check)
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        __print_error "Invalid email format: $email"
        return 1
    fi

    # Extract domain from email for key naming
    local domain
    domain=$(echo "$email" | sed 's/.*@//' | sed 's/\..*//')
    if [[ -z "$domain" ]]; then
        domain="key"
    fi

    # Sanitize domain name (remove special characters)
    domain=$(echo "$domain" | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')

    # Set key path
    local key_name="id_ed25519_${domain}"
    local key_path="${HOME}/.ssh/${key_name}"

    __print_info "Key will be created at: $key_path"

    # Check if key already exists
    if [[ -f "$key_path" ]]; then
        __print_warning "SSH key already exists at $key_path"
        if ! __confirm "Overwrite existing key?" "n"; then
            __print_info "Key generation cancelled"
            return 0
        fi

        # Backup existing key
        local backup_path
        backup_path="${key_path}.backup.$(date +%Y%m%d_%H%M%S)"
        __print_info "Backing up existing key to $(basename "$backup_path")"
        cp "$key_path" "$backup_path"
        cp "${key_path}.pub" "${backup_path}.pub" 2>/dev/null || true
    fi

    # Ensure .ssh directory exists with correct permissions
    mkdir -p "${HOME}/.ssh"
    chmod 700 "${HOME}/.ssh"

    # Generate SSH key
    __print_info "Generating SSH key..."
    if ssh-keygen -t ed25519 -C "$email" -f "$key_path" -N ""; then
        __print_success "SSH key generated successfully"
    else
        __print_error "Failed to generate SSH key"
        return 1
    fi

    # Add key to ssh-agent
    __print_info "Adding key to ssh-agent..."

    # Start ssh-agent if not running
    if ! pgrep -u "$USER" ssh-agent > /dev/null 2>&1; then
        __print_info "Starting ssh-agent..."
        eval "$(ssh-agent -s)" > /dev/null
    fi

    if ssh-add "$key_path" 2>/dev/null; then
        __print_success "Key added to ssh-agent"
    else
        __print_warning "Failed to add key to ssh-agent (you may need to start ssh-agent)"
    fi

    # Copy public key to clipboard
    if __command_exists pbcopy; then
        pbcopy < "${key_path}.pub"
        __print_success "Public key copied to clipboard!"
    elif [[ -n "${WAYLAND_DISPLAY:-}" ]] && __command_exists wl-copy; then
        wl-copy < "${key_path}.pub"
        __print_success "Public key copied to clipboard!"
    elif [[ -n "${DISPLAY:-}" ]] && __command_exists xclip; then
        xclip -selection clipboard < "${key_path}.pub"
        __print_success "Public key copied to clipboard!"
    else
        __print_warning "No clipboard tool available, skipping clipboard copy"
    fi

    # Display instructions
    echo ""
    __print_info "Next steps:"
    echo "  1. The public key has been copied to your clipboard"
    echo "  2. Go to your Git service (GitHub, GitLab, etc.):"
    echo "     - GitHub: Settings > SSH and GPG keys > New SSH key"
    echo "     - GitLab: Preferences > SSH Keys"
    echo "  3. Paste the key and save"
    echo ""
    __print_info "Key details:"
    echo "  Private key: $key_path"
    echo "  Public key:  ${key_path}.pub"
    echo "  Email:       $email"
    echo ""

    # Show public key
    __print_info "Public key contents:"
    cat "${key_path}.pub"
    echo ""

    __print_success "SSH key generation complete!"
}
