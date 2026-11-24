#!/usr/bin/env bats
# Package list files: Brewfiles and one-name-per-line apt/pacman lists.

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
    BREWFILE="${DOT_PACKAGES_DIR}/bundle"
    cat > "$BREWFILE" << 'EOF'
tap "plannotator/tap"

# formulas
brew "btop"
brew "fd"
cask "ghostty"
cask "user/tap/zed"
EOF
    APT_LIST="${DOT_PACKAGES_DIR}/apt"
    cat > "$APT_LIST" << 'EOF'
# Debian/Ubuntu packages installed by `dot init` (one per line).
fish
git  # needed first
stow
EOF
}

teardown() {
    cleanup_dot_test
}

@test "__parse_brewfile_entry reads brew and cask lines and skips the rest" {
    [ "$(__parse_brewfile_entry 'brew "fd"')" = $'brew\tfd' ]
    [ "$(__parse_brewfile_entry '  cask "user/tap/zed"')" = $'cask\tuser/tap/zed' ]
    run __parse_brewfile_entry 'tap "plannotator/tap"'
    [ "$status" -eq 1 ]
    run __parse_brewfile_entry '# brew "commented"'
    [ "$status" -eq 1 ]
}

@test "__read_package_list prints typed entries for both formats" {
    [ "$(__read_package_list "$BREWFILE")" = $'brew\tbtop\nbrew\tfd\ncask\tghostty\ncask\tuser/tap/zed' ]
    [ "$(__read_package_list "$APT_LIST")" = $'apt\tfish\napt\tgit\napt\tstow' ]
}

@test "__package_list_add keeps formulas sorted and before casks" {
    __package_list_add "$BREWFILE" brew cmake
    __package_list_add "$BREWFILE" brew zoxide
    __package_list_add "$BREWFILE" cask alacritty
    [ "$(__read_package_list "$BREWFILE" | cut -f2 | tr '\n' ' ')" = "btop cmake fd zoxide alacritty ghostty user/tap/zed " ]
    grep -qx 'tap "plannotator/tap"' "$BREWFILE"
}

@test "__package_list_add keeps a plain list's comment header and sorts names" {
    __package_list_add "$APT_LIST" apt curl
    [ "$(head -1 "$APT_LIST")" = "# Debian/Ubuntu packages installed by \`dot init\` (one per line)." ]
    [ "$(__read_package_list "$APT_LIST" | cut -f2 | tr '\n' ' ')" = "curl fish git stow " ]
}

@test "__package_list_remove removes one entry and prints its type" {
    [ "$(__package_list_remove "$BREWFILE" ghostty)" = "cask" ]
    run __package_list_entry_type "$BREWFILE" ghostty
    [ "$status" -eq 1 ]
    __package_list_entry_type "$BREWFILE" fd

    [ "$(__package_list_remove "$APT_LIST" git)" = "apt" ]
    [ "$(__read_package_list "$APT_LIST" | cut -f2 | tr '\n' ' ')" = "fish stow " ]

    run __package_list_remove "$APT_LIST" not-there
    [ "$status" -eq 1 ]
}

@test "__validate_work_brewfile rejects casks" {
    printf 'brew "kubectl"\n' > "${DOT_PACKAGES_DIR}/bundle.work"
    __validate_work_brewfile "${DOT_PACKAGES_DIR}/bundle.work"
    printf 'cask "slack"\n' >> "${DOT_PACKAGES_DIR}/bundle.work"
    run __validate_work_brewfile "${DOT_PACKAGES_DIR}/bundle.work"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Work Brewfile contains cask 'slack'"* ]]
}

@test "__package_list_file maps list names per package manager" {
    DOT_PACKAGE_MANAGER=brew
    [ "$(__package_list_file base)" = "${DOT_PACKAGES_DIR}/bundle" ]
    [ "$(__package_list_file work)" = "${DOT_PACKAGES_DIR}/bundle.work" ]
    DOT_PACKAGE_MANAGER=pacman
    [ "$(__package_list_file base)" = "${DOT_PACKAGES_DIR}/pacman" ]
    run __package_list_file work
    [ "$status" -eq 1 ]
    run __package_list_file nightly
    [ "$status" -eq 1 ]
}
