#!/bin/bash
# exe.dev first-boot script: clone the dotfiles and run a headless `dot init`.
# exe.dev runs it once, as the VM's login user, when a new VM first boots.
#
# Make it the default for every new VM (run on your Mac):
#   ssh exe.dev defaults write dev.exe new.setup-script < ~/.dotfiles/exe/first-boot.sh
# Or for one VM:
#   ssh exe.dev new --name devbox --setup-script /dev/stdin < ~/.dotfiles/exe/first-boot.sh
#
# Progress: ~/dot-init.log on the VM. ~/dot-init.status says running/done/failed.
set -uo pipefail

: "${HOME:=$(getent passwd "$(id -un)" | cut -d: -f6)}"
repo="${DOTFILES_REPO:-https://github.com/dmmulroy/.dotfiles.git}"
dotfiles_dir="${HOME}/.dotfiles"
log_file="${HOME}/dot-init.log"
status_file="${HOME}/dot-init.status"

# Whatever ends this script (an error, a signal, a dropped session) leaves
# "failed" unless the init finished. Only SIGKILL can skip the trap.
result=failed
trap 'echo "$result" > "$status_file"' EXIT
trap 'exit 1' HUP INT TERM

echo running > "$status_file"
if (
    if [[ ! -d "${dotfiles_dir}/.git" ]]; then
        git clone "$repo" "$dotfiles_dir" || exit 1
    fi
    "${dotfiles_dir}/dot" init --headless
) > "$log_file" 2>&1 < /dev/null; then
    result=done
fi
