#!/usr/bin/env bats
# Platform detection from the kernel name and /etc/os-release.

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
    OS_RELEASE="${DOT_TEST_TMP}/os-release"
}

teardown() {
    cleanup_dot_test
}

@test "macOS uses Homebrew" {
    __detect_platform Darwin "$OS_RELEASE"
    [ "$DOT_OS" = darwin ]
    [ "$DOT_PACKAGE_MANAGER" = brew ]
}

@test "Ubuntu uses apt (ID_LIKE debian)" {
    printf 'NAME="Ubuntu"\nVERSION="24.04 LTS"\nID=ubuntu\nID_LIKE=debian\n' > "$OS_RELEASE"
    __detect_platform Linux "$OS_RELEASE"
    [ "$DOT_OS" = linux ]
    [ "$DOT_PACKAGE_MANAGER" = apt ]
    # os-release is parsed, never sourced.
    [ "$DOT_VERSION" = "2.0.0" ]
}

@test "Arch uses pacman" {
    printf 'ID=arch\n' > "$OS_RELEASE"
    __detect_platform Linux "$OS_RELEASE"
    [ "$DOT_PACKAGE_MANAGER" = pacman ]
}

@test "other distros and kernels have no package manager" {
    printf 'ID="fedora"\n' > "$OS_RELEASE"
    __detect_platform Linux "$OS_RELEASE"
    [ "$DOT_PACKAGE_MANAGER" = none ]
    __detect_platform FreeBSD "$OS_RELEASE"
    [ "$DOT_OS" = unknown ]
}
