#!/usr/bin/env bats
# Rex app discovery on macOS: the app is found by bundle ID, whatever its name,
# and updates follow its own Sparkle feed. Fake bundles in a temp dir; Info.plist
# reads, lsappinfo, pgrep, and the appcast download are stubbed.

setup() {
    load "../../tests/test-helpers"
    load_dot_for_test

    APPS="${DOT_TEST_TMP}/Applications"
    mkdir -p "$APPS"
    REX_APP_DIRS=("$APPS" "${HOME}/Applications")
    RUNNING_APP=""

    # Info.plist values come from <bundle>/Contents/info.test (KEY=VALUE lines).
    __rex_app_info() {
        sed -n "s/^$2=//p" "$1/Contents/info.test" 2>/dev/null | grep .
    }
    lsappinfo() {
        [[ -n "$RUNNING_APP" ]] && printf '"LSBundlePath"="%s"\n' "$RUNNING_APP"
        return 0
    }
    pgrep() { return 1; }
}

teardown() {
    cleanup_dot_test
}

# make_app <path> <bundle-id> <build> [feed-url]
make_app() {
    mkdir -p "$1/Contents"
    {
        echo "CFBundleIdentifier=$2"
        echo "CFBundleVersion=$3"
        if [[ -n "${4:-}" ]]; then echo "SUFeedURL=$4"; fi
    } > "$1/Contents/info.test"
}

@test "finds Rex by bundle ID, whatever the app is named" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2147
    make_app "${APPS}/Other.app" com.example.other 9999

    run __rex_app_bundles
    [ "$status" -eq 0 ]
    [ "$output" = "${APPS}/Rex.app" ]
}

@test "the running app wins over a newer copy that is not running" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2100
    make_app "${APPS}/Rex Beta.app" com.superlogical.rex 2147
    RUNNING_APP="${APPS}/Rex.app"

    run __rex_app_path
    [ "$output" = "${APPS}/Rex.app" ]
}

@test "without a running app, the highest build wins" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2100
    make_app "${APPS}/Rex Beta.app" com.superlogical.rex 2147

    run __rex_app_path
    [ "$output" = "${APPS}/Rex Beta.app" ]
    assert_fails __rex_running_app
}

@test "pgrep finds a running app when Launch Services does not answer" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2147
    pgrep() { [[ "$2" == "${APPS}/Rex.app/Contents/MacOS/" ]]; }

    run __rex_running_app
    [ "$status" -eq 0 ]
    [ "$output" = "${APPS}/Rex.app" ]
}

@test "no Rex app: __rex_app_path fails" {
    assert_fails __rex_app_path
}

@test "extra copies are reported" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2147
    __rex_single_app
    make_app "${APPS}/Rex Beta.app" com.superlogical.rex 2147
    assert_fails __rex_single_app

    run __warn_extra_rex_apps "${APPS}/Rex.app"
    [[ "$output" == *"${APPS}/Rex Beta.app"* ]]
    [[ "$output" != *"${APPS}/Rex.app is"* ]]
}

@test "appcast follows the app's feed, else the channel for this architecture" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2147 https://example.test/feed/appcast.xml
    make_app "${APPS}/NoFeed.app" com.superlogical.rex 2147

    run __rex_appcast_url "${APPS}/Rex.app"
    [ "$output" = "https://example.test/feed/appcast.xml" ]

    run __rex_appcast_url "${APPS}/NoFeed.app"
    [ "$output" = "${REX_APPCAST_BASE_URL}/${REX_APPCAST_CHANNEL}-$(uname -m)/appcast.xml" ]

    run __rex_appcast_url ""
    [ "$output" = "${REX_APPCAST_BASE_URL}/${REX_APPCAST_CHANNEL}-$(uname -m)/appcast.xml" ]
}

@test "update asks a running app to update itself instead of installing a copy" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2100 https://example.test/appcast.xml
    RUNNING_APP="${APPS}/Rex.app"
    __rex_latest_release() { echo "2147 https://example.test/Rex-2147.dmg"; }
    __install_rex_dmg() { echo "INSTALLED $*"; }
    __rex_cli() { echo true; }

    run __update_rex_app
    [ "$status" -eq 0 ]
    [[ "$output" == *"Rex is installing build 2147"* ]]
    [[ "$output" != *INSTALLED* ]]
}

@test "update replaces a stopped app where it is, reading its own feed" {
    make_app "${APPS}/Rex Beta.app" com.superlogical.rex 2100 https://example.test/beta/appcast.xml
    __rex_latest_release() {
        [ "$1" = "https://example.test/beta/appcast.xml" ] || return 1
        echo "2147 https://example.test/Rex-2147.dmg"
    }
    __install_rex_dmg() { echo "INSTALLED $1 -> $2"; }

    run __update_rex_app
    [ "$status" -eq 0 ]
    [[ "$output" == *"INSTALLED https://example.test/Rex-2147.dmg -> ${APPS}/Rex Beta.app"* ]]
}

@test "update reports up to date with the app's path" {
    make_app "${APPS}/Rex.app" com.superlogical.rex 2147
    RUNNING_APP="${APPS}/Rex.app"
    __rex_latest_release() { echo "2147 https://example.test/Rex-2147.dmg"; }

    run __update_rex_app
    [ "$status" -eq 0 ]
    [[ "$output" == *"Rex is up to date (build 2147, ${APPS}/Rex.app)"* ]]
}

@test "the theme import says Rex is not running only when it is not" {
    __rex_theme_imported() { return 1; }
    __rex_cli() { echo true; }

    run __import_rex_theme
    [[ "$output" == *"Rex is not running"* ]]

    make_app "${APPS}/Rex.app" com.superlogical.rex 2147
    RUNNING_APP="${APPS}/Rex.app"
    run __import_rex_theme
    [[ "$output" == *"Imported Rex theme"* ]]
}

@test "Linux install, update, and check never touch the macOS app code" {
    DOT_OS=linux
    local fn
    for fn in __rex_app_bundles __rex_running_app __rex_app_path __rex_single_app \
        __rex_appcast_url __update_rex_app __install_rex_dmg __apply_rex_app_settings \
        __import_rex_theme __warn_extra_rex_apps; do
        eval "${fn}() { echo \"MACOS CODE: ${fn}\"; return 1; }"
    done
    lsappinfo() { echo "MACOS CODE: lsappinfo"; return 1; }
    defaults() { echo "MACOS CODE: defaults"; return 1; }
    __install_rex_linux() { return 0; }
    __update_rex_linux() { return 0; }
    __setup_rex_server_linux() { return 0; }
    __reload_rex_config() { return 0; }
    __setup_rex_terminfo() { return 0; }
    __setup_rex_agents() { return 0; }
    __rex_linux_installed() { return 0; }
    __rex_cli() { return 1; }
    systemctl() { return 0; }

    run component_rex_install
    [[ "$output" != *"MACOS CODE"* ]]
    run component_rex_update
    [[ "$output" != *"MACOS CODE"* ]]
    run component_rex_check
    [[ "$output" != *"MACOS CODE"* ]]
}
