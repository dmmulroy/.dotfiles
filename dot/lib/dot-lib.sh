# Loads every dot library, component, and command, in dependency order.
# Expects DOT_ROOT (dot/) and DOTFILES_DIR (the repo) from dot/bin/dot.

SCRIPT_NAME="dot"
DOT_VERSION="2.0.0"
DOT_LIB_DIR="${DOT_ROOT}/lib"
DOT_COMMANDS_DIR="${DOT_ROOT}/commands"
# home/ mirrors ~ and is stowed there; packages/ holds the package lists.
HOME_DIR="${DOTFILES_DIR}/home"
PACKAGES_DIR="${DOT_PACKAGES_DIR:-${DOTFILES_DIR}/packages}"

# shellcheck source=terminal-output.sh
source "${DOT_LIB_DIR}/terminal-output.sh"
# shellcheck source=remote-download.sh
source "${DOT_LIB_DIR}/remote-download.sh"
# shellcheck source=run-lock.sh
source "${DOT_LIB_DIR}/run-lock.sh"
# shellcheck source=platform-detect.sh
source "${DOT_LIB_DIR}/platform-detect.sh"
# shellcheck source=package-lists.sh
source "${DOT_LIB_DIR}/package-lists.sh"
# shellcheck source=package-manager.sh
source "${DOT_LIB_DIR}/package-manager.sh"
# shellcheck source=component-registry.sh
source "${DOT_LIB_DIR}/component-registry.sh"
# shellcheck source=component-runner.sh
source "${DOT_LIB_DIR}/component-runner.sh"
# shellcheck source=dot-main.sh
source "${DOT_LIB_DIR}/dot-main.sh"

__load_components

# Each dot/commands/<command>.sh defines cmd_<command> (dashes become _).
for __dot_command_file in "${DOT_COMMANDS_DIR}"/*.sh; do
    # shellcheck source=/dev/null
    source "$__dot_command_file"
done
unset __dot_command_file
