# Rex, the terminal multiplexer. macOS: the app (Sparkle appcast, not
# Homebrew), its macOS-defaults settings, theme, and twitch-lua rocks.
# Linux: the server package (pkgs.superlogical.com) and a personal server
# that Rex for Mac reaches over ssh://<host>. Both: stowed config, terminfo,
# and the agent skill + hooks.
__define_component rex all optional "Rex"

# The app is found by bundle ID, never by name: it has shipped as "Rex Beta.app"
# and "Rex.app", and a user may rename it. Fresh installs go to the first
# REX_APP_DIRS entry under the name the disk image uses.
REX_BUNDLE_ID="com.superlogical.rex"
REX_APP_DIRS=("/Applications" "${HOME}/Applications")
# Updates follow the installed app's own Sparkle feed (SUFeedURL), as Sparkle
# does. Without an app: ${REX_APPCAST_BASE_URL}/${REX_APPCAST_CHANNEL}-<arch>/appcast.xml.
REX_APPCAST_BASE_URL="https://blob.superlogical.com/public/rex-app"
REX_APPCAST_CHANNEL="preview"
REX_TEAM_ID="AG92C3PT77"
REX_BUNDLED_CLI="${HOME}/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex"
# Rex app settings (fonts, keyboard, tabs) live in macOS defaults, not init.lua.
REX_DEFAULTS_DOMAIN="$REX_BUNDLE_ID"
REX_APP_SETTINGS_FILE="${HOME_DIR}/.config/rex/macos-defaults.conf"
REX_THEME_NAME="catppuccin-macchiato"
REX_THEME_IMPORT_ACTION="import_catppuccin_macchiato"
# Lua rocks for the Rex config (Lua 5.1), in a tree of their own. The config puts
# ${REX_LUA_ROCKS_TREE}/share/lua/5.1 on package.path (rex/dmmulroy/twitch_chat/shared.lua).
# REX_LUA_ROCKS_SERVER (optional) adds a server, e.g. file:// of a local
# distilled-lua scripts/build_rocks.sh output, before the rocks are published.
REX_LUA_ROCKS_TREE="${REX_LUA_ROCKS_TREE:-${HOME}/.local/share/rex/rocks}"
REX_LUA_ROCKS=(twitch-lua)
# Linux: Rex's server package (apt/dnf/pacman repo or tarball, picked by the
# script). Re-running the script upgrades Rex and keeps the channel.
REX_LINUX_INSTALL_URL="https://pkgs.superlogical.com/rex/install.sh"
REX_LINUX_CHANNEL="preview"

component_rex_install() {
    if [[ "$DOT_OS" == "linux" ]]; then
        __install_rex_linux || return 1
        __export_rex_runtime_dir
        __setup_rex_server_linux
    else
        __update_rex_app || return 1
        __apply_rex_app_settings
        __install_rex_lua_rocks || true
    fi
    local status=0
    __try "Rex config reload" __reload_rex_config || status=1
    if [[ "$DOT_OS" == "darwin" ]]; then
        __import_rex_theme
    fi
    __try "Rex terminfo setup" __setup_rex_terminfo || status=1
    __setup_rex_agents
    return "$status"
}

component_rex_update() {
    local status=0
    if [[ "$DOT_OS" == "linux" ]]; then
        __try "Rex update" __update_rex_linux || status=1
        __export_rex_runtime_dir
        __try "Rex config reload" __reload_rex_config || status=1
        return "$status"
    fi
    __try "Rex update" __update_rex_app || status=1
    __try "Rex Lua rocks" __install_rex_lua_rocks || status=1
    __try "Rex config reload" __reload_rex_config || status=1
    __try "Rex app settings" __apply_rex_app_settings || status=1
    __import_rex_theme
    return "$status"
}

component_rex_check() {
    local rex_bin
    if [[ "$DOT_OS" == "linux" ]]; then
        __export_rex_runtime_dir
        __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only rex" "Rex is installed" __rex_linux_installed
        __doctor_check --warn --hint "run: rex server install" "Rex server is installed (rex.socket)" \
            systemctl --user is-enabled rex.socket
    else
        __doctor_check --warn --hint "run: ${SCRIPT_NAME} init --only rex" "Rex is installed" __rex_app_path
        __doctor_check --warn --hint "remove the extra copies dot does not update (see: ${SCRIPT_NAME} update --only rex)" \
            "Only one Rex app is installed" __rex_single_app
        if __command_exists luarocks; then
            local rock
            for rock in "${REX_LUA_ROCKS[@]}"; do
                __doctor_check --warn --hint "run: ${SCRIPT_NAME} update --only rex" \
                    "Rex Lua rock ${rock} is installed" __rex_luarocks show "$rock"
            done
        else
            __print_warning "luarocks not found (brew \"luarocks\" in packages/bundle)"
        fi
    fi
    __doctor_check --warn --hint "run: ${SCRIPT_NAME} stow" "Rex config is stowed" __path_is_stowed .config/rex
    if rex_bin="$(__rex_cli)"; then
        __doctor_check --warn --hint "run: rex config check" "Rex config loads without errors" "$rex_bin" config check
    else
        __print_warning "rex CLI not found (launch Rex once on macOS, or run: ${SCRIPT_NAME} init --only rex)"
    fi
}

# True when the Rex server package is installed. Ubuntu also has an unrelated
# "rex" package, so only a rex that reports "rex 0.x" counts.
__rex_linux_installed() {
    __command_exists rex && rex version 2>/dev/null | grep -q '^rex 0\.'
}

# Print the rex CLI path: $REX_BIN_DIR inside Rex terminals, then PATH, then
# the copy bundled with the app's server.
__rex_cli() {
    if [[ -n "${REX_BIN_DIR:-}" && -x "${REX_BIN_DIR}/rex" ]]; then
        echo "${REX_BIN_DIR}/rex"
    elif [[ -x "$REX_BUNDLED_CLI" ]]; then
        echo "$REX_BUNDLED_CLI"
    elif __command_exists rex && rex version 2>/dev/null | grep -q '^rex 0\.'; then
        command -v rex
    else
        return 1
    fi
}

# Print one Info.plist value of an app bundle.
__rex_app_info() {
    local app="$1" key="$2"
    defaults read "${app}/Contents/Info" "$key" 2>/dev/null
}

# Print every installed Rex app bundle in REX_APP_DIRS, one per line.
__rex_app_bundles() {
    local dir app
    for dir in "${REX_APP_DIRS[@]}"; do
        for app in "$dir"/*.app; do
            [[ -d "$app" ]] || continue
            if [[ "$(__rex_app_info "$app" CFBundleIdentifier)" == "$REX_BUNDLE_ID" ]]; then
                echo "$app"
            fi
        done
    done
}

# Print the bundle path of the running Rex app; fail when it is not running.
# Asks Launch Services by bundle ID, then falls back to pgrep per bundle.
__rex_running_app() {
    local app
    app="$(lsappinfo info -only bundlepath -app "$REX_BUNDLE_ID" 2>/dev/null \
        | sed -n 's/^"LSBundlePath"="\(.*\)"$/\1/p')" || true
    if [[ -n "$app" && -d "$app" ]]; then
        echo "$app"
        return 0
    fi
    while IFS= read -r app; do
        if pgrep -qf "${app}/Contents/MacOS/"; then
            echo "$app"
            return 0
        fi
    done < <(__rex_app_bundles)
    return 1
}

# Print the Rex app dot manages: the running one, else the installed copy with
# the highest build. Fails when Rex is not installed.
__rex_app_path() {
    if __rex_running_app; then
        return 0
    fi
    local app build best="" best_build=-1
    while IFS= read -r app; do
        build="$(__rex_app_info "$app" CFBundleVersion)"
        [[ "$build" =~ ^[0-9]+$ ]] || build=0
        if (( build > best_build )); then
            best="$app"
            best_build="$build"
        fi
    done < <(__rex_app_bundles)
    [[ -n "$best" ]] && echo "$best"
}

# True unless more than one Rex app is installed.
__rex_single_app() {
    (( $(__rex_app_bundles | grep -c .) <= 1 ))
}

# Warn about Rex copies other than the managed one: dot and Sparkle never
# update them, and Launch Services may open them instead.
__warn_extra_rex_apps() {
    local managed="$1" app
    while IFS= read -r app; do
        [[ "$app" == "$managed" ]] && continue
        __print_warning "Extra Rex app at ${app} is not updated; remove it: rm -rf \"${app}\""
    done < <(__rex_app_bundles)
}

# Print the appcast URL: the installed app's own feed, else the default
# channel for this Mac's architecture.
__rex_appcast_url() {
    local app="${1:-}" feed=""
    [[ -n "$app" ]] && feed="$(__rex_app_info "$app" SUFeedURL)"
    if [[ "$feed" == https://* ]]; then
        echo "$feed"
    else
        echo "${REX_APPCAST_BASE_URL}/${REX_APPCAST_CHANNEL}-$(uname -m)/appcast.xml"
    fi
}

# Print "<build> <dmg-url>" for the newest entry of an appcast.
__rex_latest_release() {
    local appcast_url="$1" appcast
    appcast="$(__download_url "$appcast_url" -)" || return 1
    awk '
        /<sparkle:version>/ { gsub(/.*<sparkle:version>|<\/sparkle:version>.*/, ""); build = $0 }
        /<enclosure / && build != "" {
            match($0, /url="[^"]+"/)
            url = substr($0, RSTART + 5, RLENGTH - 6)
            if (best == "" || build + 0 > best + 0) { best = build; best_url = url }
            build = ""
        }
        END { if (best != "") print best, best_url }
    ' <<< "$appcast"
}

# Install Rex from a DMG after checking its Developer ID team. Only used when
# the app is not running; a running app updates through Sparkle instead.
# Replaces the app at <target> when given (an update keeps the bundle where
# it is), else installs into the first REX_APP_DIRS entry under the DMG's name.
__install_rex_dmg() {
    local url="$1" target="${2:-}"
    local work mount app
    work="$(mktemp -d)" || return 1
    mount="${work}/mount"

    __print_info "Downloading ${url##*/}..."
    if ! __download_url "$url" "${work}/rex.dmg"; then
        rm -rf "$work"
        return 1
    fi
    if ! hdiutil attach -nobrowse -readonly -quiet -mountpoint "$mount" "${work}/rex.dmg"; then
        rm -rf "$work"
        return 1
    fi

    app="$(find "$mount" -maxdepth 1 -name '*.app' -print -quit)"
    [[ -z "$target" && -n "$app" ]] && target="${REX_APP_DIRS[0]}/${app##*/}"
    local status=1
    if [[ -z "$app" ]]; then
        __print_error "No app found in the Rex disk image"
    elif [[ "$(__rex_app_info "$app" CFBundleIdentifier)" != "$REX_BUNDLE_ID" ]]; then
        __print_error "Rex disk image holds an app that is not ${REX_BUNDLE_ID}; not installing"
    elif ! codesign --verify --deep --strict "$app" 2>/dev/null \
        || ! codesign -dv "$app" 2>&1 | grep -q "^TeamIdentifier=${REX_TEAM_ID}$"; then
        __print_error "Rex disk image failed signature verification; not installing"
    elif ditto "$app" "${target}.new" \
        && rm -rf "$target" \
        && mv "${target}.new" "$target"; then
        status=0
    fi

    hdiutil detach -quiet "$mount" || true
    rm -rf "$work"
    [[ -n "$target" ]] && rm -rf "${target}.new"
    return "$status"
}

# Install Rex if missing, or update it when the appcast has a newer build.
__update_rex_app() {
    local app="" running="" installed="" appcast_url release latest url
    if running="$(__rex_running_app)"; then
        app="$running"
    else
        app="$(__rex_app_path || true)"
    fi
    if [[ -n "$app" ]]; then
        installed="$(__rex_app_info "$app" CFBundleVersion || true)"
        __warn_extra_rex_apps "$app"
    fi

    appcast_url="$(__rex_appcast_url "$app")"
    if ! release="$(__rex_latest_release "$appcast_url")" || [[ -z "$release" ]]; then
        __print_warning "Could not read the Rex appcast (${appcast_url}); skipping Rex update"
        return 1
    fi
    read -r latest url <<< "$release"
    if [[ ! "$latest" =~ ^[0-9]+$ || -z "$url" ]]; then
        __print_warning "Rex appcast (${appcast_url}) has no usable release; skipping Rex update"
        return 1
    fi

    if [[ "$installed" =~ ^[0-9]+$ ]] && (( installed >= latest )); then
        __print_success "Rex is up to date (build ${installed}, ${app})"
        return 0
    fi

    if [[ -n "$running" ]]; then
        # Replacing a running app bundle is unsafe; let Sparkle do it. The app
        # relaunches, and sessions survive because they live in the server.
        __print_info "Rex build ${latest} is available (installed: ${installed}); asking the app to install it..."
        local rex_bin
        if rex_bin="$(__rex_cli)" && "$rex_bin" "do" client.update.accept >/dev/null 2>&1; then
            __print_success "Rex is installing build ${latest} and will relaunch"
        else
            __print_warning "Rex could not start the update; use Rex > Install Update, or quit Rex and rerun '${SCRIPT_NAME} update'"
        fi
        return 0
    fi

    __print_info "Installing Rex build ${latest}..."
    if __install_rex_dmg "$url" "$app"; then
        __print_success "Rex build ${latest} installed ($(__rex_app_path))"
    else
        __print_error "Failed to install Rex"
        return 1
    fi
}

# Validate the stowed config and, when a server is running, reload it.
__reload_rex_config() {
    local rex_bin
    if ! rex_bin="$(__rex_cli)"; then
        __print_warning "rex CLI not found (launch Rex once to install its server); skipping config reload"
        return 0
    fi
    if ! "$rex_bin" config check >/dev/null; then
        __print_error "Rex config has errors; run 'rex config check'"
        return 1
    fi
    if "$rex_bin" --autostart=false server status >/dev/null 2>&1; then
        "$rex_bin" --autostart=false config reload >/dev/null && __print_success "Rex config reloaded"
    else
        __print_success "Rex config is valid"
    fi
}

# Write the Rex app settings tracked in macos-defaults.conf. Rex reads most of
# them only at launch, so a running app needs a relaunch to show changes.
__apply_rex_app_settings() {
    if [[ ! -f "$REX_APP_SETTINGS_FILE" ]]; then
        __print_warning "Rex app settings file not found: ${REX_APP_SETTINGS_FILE}"
        return 0
    fi

    local key type value current expected changed=0
    while read -r key type value; do
        [[ -z "$key" || "$key" == \#* ]] && continue
        current="$(defaults read "$REX_DEFAULTS_DOMAIN" "$key" 2>/dev/null || true)"
        expected="$value"
        if [[ "$type" == "bool" ]]; then
            [[ "$value" == "true" ]] && expected="1" || expected="0"
        fi
        [[ "$current" == "$expected" ]] && continue
        if defaults write "$REX_DEFAULTS_DOMAIN" "$key" "-${type}" "$value"; then
            changed=$((changed + 1))
        else
            __print_error "Failed to write Rex setting ${key}"
            return 1
        fi
    done < "$REX_APP_SETTINGS_FILE"

    if (( changed == 0 )); then
        __print_success "Rex app settings are up to date"
    elif __rex_running_app >/dev/null; then
        __print_success "Wrote ${changed} Rex app setting(s); relaunch Rex to apply them"
    else
        __print_success "Wrote ${changed} Rex app setting(s)"
    fi
}

# True when the tracked theme is among the app's imported custom themes.
__rex_theme_imported() {
    defaults export "$REX_DEFAULTS_DOMAIN" - 2>/dev/null \
        | plutil -convert xml1 -o - - 2>/dev/null \
        | awk '/<key>Workspace.customThemes<\/key>/{f=1; next} f&&/<\/data>/{exit} f&&!/<data>/{print}' \
        | base64 -D 2>/dev/null \
        | grep -q "\"name\":\"${REX_THEME_NAME}\""
}

# Import the tracked theme through the init.lua action when the app lacks it.
# Needs a running app with Remote Control on (set by macos-defaults.conf).
__import_rex_theme() {
    if __rex_theme_imported; then
        __print_success "Rex theme ${REX_THEME_NAME} is imported"
        return 0
    fi
    local rex_bin
    if ! __rex_running_app >/dev/null; then
        __print_warning "Rex is not running; launch it and rerun '${SCRIPT_NAME} update' to import the ${REX_THEME_NAME} theme"
        return 0
    fi
    if ! rex_bin="$(__rex_cli)"; then
        __print_warning "rex CLI not found; rerun '${SCRIPT_NAME} update' once Rex has installed its server to import the ${REX_THEME_NAME} theme"
        return 0
    fi
    if "$rex_bin" "do" "$REX_THEME_IMPORT_ACTION" >/dev/null 2>&1; then
        __print_success "Imported Rex theme ${REX_THEME_NAME}"
    else
        __print_warning "Could not import the Rex theme; run 'Import Catppuccin Macchiato Theme' from the Rex palette"
    fi
}

# Install Rex's xterm-rex terminfo entry (~/.terminfo) and its ssh guard
# (~/.config/rex/ssh_config + an Include in ~/.ssh/config, so remote hosts get
# xterm-256color). Both hold machine paths, so Rex writes them, not stow.
# "Ready:" is the verdict line of `rex terminfo status`. On Linux the package
# installs the ssh guard system-wide (/etc/ssh/ssh_config.d/50-rex.conf), so
# the per-user guard it reports "missing" is not needed there.
__setup_rex_terminfo() {
    local rex_cli
    rex_cli="$(__rex_cli)" || {
        __print_warning "rex CLI not found; skipping Rex terminfo setup"
        return 0
    }
    if "$rex_cli" terminfo status 2>/dev/null | grep -q '^Ready:'; then
        __print_success "Rex terminfo is set up"
    elif "$rex_cli" terminfo setup >/dev/null; then
        __print_success "Installed Rex terminfo (xterm-rex) and ssh guard"
    else
        __print_error "rex terminfo setup failed"
        return 1
    fi
}

# Rex agent skill + hooks. The shared skill (~/.agents/skills/rex) is tracked
# in home/.agents/skills/rex; setup refreshes it through the stow symlink and
# adds hooks to Claude Code / Codex settings.
__setup_rex_agents() {
    local rex_cli
    rex_cli="$(__rex_cli)" || return 0
    if "$rex_cli" skill setup >/dev/null; then
        __print_success "Rex agent skill and hooks are set up"
    else
        __print_warning "rex skill setup failed; run it by hand to see why"
    fi
}

# luarocks for Rex's tree: Lua 5.1 (LuaJIT from Homebrew), never the system tree.
__rex_luarocks() {
    local server_args=()
    if [[ -n "${REX_LUA_ROCKS_SERVER:-}" ]]; then
        server_args=(--server "$REX_LUA_ROCKS_SERVER")
    fi
    luarocks --lua-version 5.1 --tree "$REX_LUA_ROCKS_TREE" ${server_args[@]+"${server_args[@]}"} "$@"
}

# Install or upgrade the Rex config's rocks (twitch-lua and what it depends on).
# `luarocks install` keeps an installed rock unless a newer version is published.
# Failures only warn: the config skips twitch-lua (falls back to twt) without it.
__install_rex_lua_rocks() {
    if ! __command_exists luarocks; then
        __print_warning "luarocks not found (brew \"luarocks\" in packages/bundle); skipping Rex Lua rocks"
        return 0
    fi
    local rock failed=0
    for rock in "${REX_LUA_ROCKS[@]}"; do
        if __rex_luarocks install "$rock" >/dev/null 2>&1; then
            __print_success "Rex Lua rock ${rock} is installed ($(__rex_luarocks show --mversion "$rock" 2>/dev/null))"
        else
            __print_warning "Could not install Rex Lua rock ${rock}; run: luarocks --lua-version 5.1 --tree ${REX_LUA_ROCKS_TREE} install ${rock}"
            failed=1
        fi
    done
    return "$failed"
}

# Install (or, with "update", upgrade) Rex's Linux server package.
__install_rex_linux() {
    local mode="${1:-install}"
    if [[ "$mode" != "update" ]] && __rex_linux_installed; then
        __print_success "Rex is installed ($(rex version | head -1))"
        return 0
    fi
    __print_info "Installing Rex from the ${REX_LINUX_CHANNEL} channel..."
    if __run_remote_installer "$REX_LINUX_INSTALL_URL" sh --channel "$REX_LINUX_CHANNEL"; then
        hash -r
        __print_success "Rex installed ($(rex version | head -1))"
    else
        __print_error "Failed to install Rex"
        return 1
    fi
}

# True when apt or pacman owns the rex binary; their upgrades then update Rex too.
__rex_package_managed() {
    local rex_bin
    rex_bin="$(command -v rex)" || return 1
    rex_bin="$(readlink -f "$rex_bin")"
    case "$DOT_PACKAGE_MANAGER" in
        apt) dpkg -S "$rex_bin" >/dev/null 2>&1 ;;
        pacman) pacman -Qo "$rex_bin" >/dev/null 2>&1 ;;
        *) return 1 ;;
    esac
}

__update_rex_linux() {
    if __rex_package_managed; then
        __print_success "Rex is updated by ${DOT_PACKAGE_MANAGER} ($(rex version | head -1))"
        return 0
    fi
    __install_rex_linux update
}

# exe.dev SSH sessions may lack XDG_RUNTIME_DIR, which rex and systemctl --user need.
__export_rex_runtime_dir() {
    if [[ -z "${XDG_RUNTIME_DIR:-}" && -d "/run/user/$(id -u)" ]]; then
        XDG_RUNTIME_DIR="/run/user/$(id -u)"
        export XDG_RUNTIME_DIR
    fi
}

# Personal Rex server (systemd user units, socket-activated) running as this
# account; this is the server Rex for Mac finds over ssh://<host>.
__setup_rex_server_linux() {
    if ! __command_exists systemctl || [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
        __print_warning "No systemd user session; skipping Rex server (run 'rex server install' later)"
        return 0
    fi
    if systemctl --user is-enabled rex.socket >/dev/null 2>&1; then
        __print_success "Rex server is installed (rex.socket)"
    elif rex server install >/dev/null; then
        __print_success "Rex server installed; it starts at boot and on the first rex command"
    else
        __print_warning "rex server install failed; run it by hand to see why"
    fi
}

__setup_rex_linux() {
    __install_rex_linux || return 1
    __export_rex_runtime_dir
    __setup_rex_server_linux
    __reload_rex_config
    __setup_rex_terminfo
    __setup_rex_agents
}

