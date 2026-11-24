#!/usr/bin/env bats
# Remote installers run only after a complete download (file:// URLs stand in
# for the network).

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
    INSTALLER="${DOT_TEST_TMP}/install.sh"
    printf 'echo "args:$* env:${INSTALLER_FLAG:-unset}" > "%s/ran"\n' "$DOT_TEST_TMP" > "$INSTALLER"
}

teardown() {
    cleanup_dot_test
}

@test "__run_remote_installer runs the script with arguments and environment" {
    INSTALLER_FLAG=1 __run_remote_installer "file://${INSTALLER}" bash -y --channel preview
    [ "$(cat "${DOT_TEST_TMP}/ran")" = "args:-y --channel preview env:1" ]
}

@test "a failed download runs nothing" {
    run __run_remote_installer "file://${DOT_TEST_TMP}/missing.sh" bash
    [ "$status" -eq 1 ]
    [[ "$output" == *"Remote installer download failed"* ]]
    [ ! -e "${DOT_TEST_TMP}/ran" ]
}

@test "the installer's exit status comes back" {
    printf 'exit 7\n' > "$INSTALLER"
    run __run_remote_installer "file://${INSTALLER}" bash
    [ "$status" -eq 7 ]
}

@test "__download_url writes to stdout with -" {
    [ "$(__download_url "file://${INSTALLER}" -)" = "$(cat "$INSTALLER")" ]
}
