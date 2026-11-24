# exe.dev VMs are declared and created in the iac repo (infra/exe-dev,
# IacExeDev Stack): their first boot runs `dot init --headless` and joins the
# tailnet with Tailscale SSH on, and the deploy registers each VM's GitHub key.
#
# This Mac reaches them over the tailnet with plain `ssh exe-dev-NAME`:
# Tailscale authenticates the connection (no SSH keys), and the host key comes
# from the tailnet (tailnet-ssh-known-hosts), so a rebuilt VM needs no setup
# here. VM names start with `exe-dev-` so the Host pattern below matches them.
# macOS only: VMs do not SSH to each other.
__define_component tailnet_ssh darwin optional "Tailscale SSH to exe.dev VMs"

TAILNET_SSH_CONFIG_MARKER="# Tailscale SSH to exe.dev VMs (managed by dot)"

component_tailnet_ssh_install() {
    __setup_tailnet_ssh
}

component_tailnet_ssh_check() {
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only tailnet_ssh" \
        "${HOME}/.ssh/config has the exe-dev-* Tailscale SSH block" grep -qxF -- "$TAILNET_SSH_CONFIG_MARKER" "${HOME}/.ssh/config"
}

# Add the `Host exe-dev-*` block to ~/.ssh/config once. macOS only: VMs do not
# SSH to each other.
__setup_tailnet_ssh() {
    local ssh_config="${HOME}/.ssh/config"
    if [[ -f "$ssh_config" ]] && grep -qxF -- "$TAILNET_SSH_CONFIG_MARKER" "$ssh_config"; then
        __print_success "Tailscale SSH config for exe-dev-* is in ${ssh_config}"
        return 0
    fi
    mkdir -p "${HOME}/.ssh"
    # ssh requires an absolute KnownHostsCommand path and checks it before expanding %d.
    cat >> "$ssh_config" << EOF

${TAILNET_SSH_CONFIG_MARKER}
# Host keys come from the tailnet, never from known_hosts, so rebuilt VMs just work.
# NAME.exe.xyz is excluded: that route goes through exe.dev and uses its own host key.
Host exe-dev-* !*.exe.xyz
  User exedev
  PubkeyAuthentication no
  StrictHostKeyChecking yes
  UserKnownHostsFile /dev/null
  GlobalKnownHostsFile /dev/null
  KnownHostsCommand ${HOME}/.local/bin/tailnet-ssh-known-hosts %H
EOF
    chmod 600 "$ssh_config"
    __print_success "Added Tailscale SSH config for exe-dev-* to ${ssh_config}"
}
