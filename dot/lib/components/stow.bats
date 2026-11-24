#!/usr/bin/env bats
# Stow component against a throwaway repo and HOME, with the real GNU Stow.

setup() {
    load "../../tests/test-helpers"
    load_dot_for_test
    command -v stow >/dev/null || skip "GNU Stow not installed"

    DOTFILES_DIR="${DOT_TEST_TMP}/repo"
    HOME_DIR="${DOTFILES_DIR}/home"
    mkdir -p "${HOME_DIR}/.config/app" "${HOME_DIR}/.plannotator"
    echo "setting" > "${HOME_DIR}/.config/app/config"
    echo "{}" > "${HOME_DIR}/.plannotator/state.json"
    STOW_SHARED_DIRECTORIES=(.config)
}

teardown() {
    cleanup_dot_test
}

@test "shared directories become real directories; other packages fold" {
    run __stow_dotfiles
    [ "$status" -eq 0 ]
    [ -d "${HOME}/.config" ] && [ ! -L "${HOME}/.config" ]
    [ -L "${HOME}/.config/app" ]
    [ -L "${HOME}/.plannotator" ]
    __path_is_stowed .config/app
    __shared_stow_directories_are_real
}

@test "a shared directory stow already linked into the repo is unfolded" {
    stow -d "$DOTFILES_DIR" -t "$HOME" home
    [ -L "${HOME}/.config" ]
    assert_fails __shared_stow_directories_are_real

    run __stow_dotfiles
    [ "$status" -eq 0 ]
    [ ! -L "${HOME}/.config" ]
    [ -L "${HOME}/.config/app" ]
    [ "$(cat "${HOME}/.config/app/config")" = "setting" ]
}

@test "a file that blocks stow is backed up (headless takes the default)" {
    mkdir -p "${HOME}/.config/app"
    echo "mine" > "${HOME}/.config/app/config"
    DOT_HEADLESS=true run __stow_dotfiles
    [ "$status" -eq 0 ]
    [ -L "${HOME}/.config/app" ] || [ -L "${HOME}/.config/app/config" ]
    [ "$(cat "${HOME}"/.dot-backup/*/.config/app/config)" = "mine" ]
}
