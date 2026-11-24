# Herdr plugins listed in home/.config/herdr/plugins.txt (GitHub sources);
# installing again refreshes existing managed checkouts.
__define_component herdr_plugins all required "Herdr plugins"

HERDR_PLUGIN_SOURCES_FILE="${HOME_DIR}/.config/herdr/plugins.txt"

component_herdr_plugins_install() {
    __sync_herdr_plugins
}

component_herdr_plugins_check() {
    __doctor_check "herdr is installed" __command_exists herdr || return 1
    __doctor_check "Herdr plugin list exists" test -f "$HERDR_PLUGIN_SOURCES_FILE"
}

__sync_herdr_plugins() {
    if ! __command_exists herdr; then
        __print_error "Herdr is not installed"
        return 1
    fi
    if [[ ! -f "$HERDR_PLUGIN_SOURCES_FILE" ]]; then
        __print_error "Herdr plugin source list not found: ${HERDR_PLUGIN_SOURCES_FILE}"
        return 1
    fi

    local plugin_source
    local failed_plugins=()
    __print_info "Installing and updating Herdr plugins..."
    while IFS= read -r plugin_source || [[ -n "$plugin_source" ]]; do
        plugin_source="${plugin_source%%#*}"
        plugin_source="${plugin_source//[[:space:]]/}"
        [[ -z "$plugin_source" ]] && continue

        __print_info "Syncing Herdr plugin: ${plugin_source}"
        if herdr plugin install "$plugin_source" --yes; then
            __print_success "Herdr plugin synced: ${plugin_source}"
        else
            failed_plugins+=("$plugin_source")
        fi
    done < "$HERDR_PLUGIN_SOURCES_FILE"

    if [[ ${#failed_plugins[@]} -gt 0 ]]; then
        __print_error "Failed to sync Herdr plugins: ${failed_plugins[*]}"
        return 1
    fi
    if herdr status server >/dev/null 2>&1; then
        herdr server reload-config >/dev/null
    fi
    __print_success "Herdr plugins are up to date"
}
