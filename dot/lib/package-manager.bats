#!/usr/bin/env bats
# Package manager adapter, with the package manager itself stubbed out.

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
    DOT_PACKAGE_MANAGER=brew
    # Stub what brew would report.
    __package_installed_names() {
        case "$1" in
            brew) printf '%s\n' btop fd ;;
            cask) printf '%s\n' zed ;;
        esac
    }
    __package_outdated_names() {
        case "$1" in
            brew) echo fd ;;
            cask) echo zed ;;
        esac
    }
    printf '%s\n' 'brew "btop"' 'brew "fd"' 'brew "ripgrep"' 'cask "ghostty"' 'cask "user/tap/zed"' > "${DOT_PACKAGES_DIR}/bundle"
}

teardown() {
    cleanup_dot_test
}

@test "__find_missing_packages lists entries that are not installed" {
    [ "$(__find_missing_packages "${DOT_PACKAGES_DIR}/bundle")" = $'brew\tripgrep\ncask\tghostty' ]
}

@test "tap-qualified names match the short names brew lists" {
    __package_is_installed cask user/tap/zed
    __package_is_outdated cask user/tap/zed
}

@test "__package_is_outdated reads the outdated list" {
    __package_is_outdated brew fd
    assert_fails __package_is_outdated brew btop
}

@test "a failing package listing returns 2, not 'missing'" {
    __package_installed_names() { return 1; }
    run __package_is_installed brew btop
    [ "$status" -eq 2 ]
    run __find_missing_packages "${DOT_PACKAGES_DIR}/bundle"
    [ "$status" -eq 1 ]
}

@test "__package_types follows the package manager" {
    [ "$(__package_types | tr '\n' ' ')" = "brew cask " ]
    DOT_PACKAGE_MANAGER=apt
    [ "$(__package_types)" = "apt" ]
    [ "$(__package_detect_type anything)" = "apt" ]
}

@test "unknown package types fail with a clear message" {
    run __package_install snap hello
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown package type 'snap'"* ]]
}

@test "__save_failed_packages writes a file retry-failed can read" {
    DOT_FAILED_PACKAGES=("brew:ripgrep" "cask:ghostty")
    run __save_failed_packages
    [ "$status" -eq 0 ]
    local saved
    saved="$(cat "${DOT_PACKAGES_DIR}"/failed_packages_*.txt)"
    [ "$saved" = $'brew:ripgrep\ncask:ghostty' ]
}
