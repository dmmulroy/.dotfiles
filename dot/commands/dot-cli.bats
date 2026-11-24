#!/usr/bin/env bats
# The dot command line, run as a real process (set -euo pipefail, like users).
# Only commands that change nothing: help, dry runs, components.

setup() {
    load "../tests/test-helpers"
    DOT_TEST_TMP="$(mktemp -d)"
    export DOT_RUN_LOCK_DIR="${DOT_TEST_TMP}/run.lock"
    export NO_COLOR=1
}

teardown() {
    rm -rf "$DOT_TEST_TMP"
}

@test "dot --version" {
    run "$DOT_TEST_BIN" --version
    [ "$status" -eq 0 ]
    [[ "$output" == "dot version "* ]]
}

@test "dot with no command shows help listing every command" {
    run "$DOT_TEST_BIN"
    [ "$status" -eq 0 ]
    [[ "$output" == *"init "*"update "*"doctor "*"components "* ]]
}

@test "every listed command has --help" {
    source "$DOT_TEST_BIN"
    local summary
    for summary in "${DOT_COMMAND_SUMMARIES[@]}"; do
        run "$DOT_TEST_BIN" "${summary%%|*}" --help
        [ "$status" -eq 0 ] || { echo "no help for ${summary%%|*}"; return 1; }
        [[ "$output" == *"USAGE:"* ]]
    done
}

@test "unknown commands and usage functions are not commands" {
    run "$DOT_TEST_BIN" bogus
    [ "$status" -eq 1 ]
    run "$DOT_TEST_BIN" init-usage
    [ "$status" -eq 1 ]
}

@test "init --dry-run plans every component for this machine and changes nothing" {
    run "$DOT_TEST_BIN" init --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"Would run component_stow_install"* ]]
    [[ "$output" == *"Dry run complete"* ]]
    [ ! -e "$DOT_RUN_LOCK_DIR" ]
}

@test "update --dry-run --only uses update steps, with install as the fallback" {
    run "$DOT_TEST_BIN" update --dry-run --only pi,stow
    [ "$status" -eq 0 ]
    [[ "$output" == *"Would run component_stow_install"* ]]
    [[ "$output" == *"Would run component_pi_update"* ]]
    [[ "$output" != *"component_rex"* ]]
}

@test "--headless skips the font" {
    run "$DOT_TEST_BIN" init --dry-run --headless
    [ "$status" -eq 0 ]
    [[ "$output" != *"component_font_install"* ]]
}

@test "unknown options and components fail before doing anything" {
    run "$DOT_TEST_BIN" init --frobnicate
    [ "$status" -eq 1 ]
    run "$DOT_TEST_BIN" update --dry-run --only stwo
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown component 'stwo'"* ]]
}

@test "components --names prints the registry in order" {
    run "$DOT_TEST_BIN" components --names
    [ "$status" -eq 0 ]
    [ "${lines[0]}" = "homebrew" ]
    [ "${lines[${#lines[@]}-1]}" = "fish" ]
}

@test "a symlinked dot finds its repo" {
    ln -s "$DOT_TEST_BIN" "${DOT_TEST_TMP}/dot"
    run "${DOT_TEST_TMP}/dot" help
    [ "$status" -eq 0 ]
    [[ "$output" == *"dot:       $(cd "$(dirname "$DOT_TEST_BIN")/.." && pwd)"* ]]
}

@test "generated Fish completions parse" {
    command -v fish >/dev/null || skip "fish not installed"
    source "$DOT_TEST_BIN"
    __write_fish_completions > "${DOT_TEST_TMP}/dot.fish"
    fish --no-execute "${DOT_TEST_TMP}/dot.fish"
}
