#!/usr/bin/env bats
# Run lock: one dot init/update at a time.

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
}

teardown() {
    [[ -n "${HOLDER_PID:-}" ]] && kill "$HOLDER_PID" 2>/dev/null || true
    cleanup_dot_test
}

@test "acquire creates the lock with this PID and release removes it" {
    __acquire_run_lock
    [ "$(cat "${DOT_RUN_LOCK_DIR}/pid")" = "$$" ]
    __release_run_lock
    [ ! -e "$DOT_RUN_LOCK_DIR" ]
}

@test "a lock held by a live process blocks another run" {
    sleep 30 &
    HOLDER_PID=$!
    mkdir -p "$DOT_RUN_LOCK_DIR"
    echo "$HOLDER_PID" > "${DOT_RUN_LOCK_DIR}/pid"

    run __acquire_run_lock
    [ "$status" -eq 1 ]
    [[ "$output" == *"Another dot run holds the run lock (pid ${HOLDER_PID})"* ]]
}

@test "a lock left by a dead process is taken over" {
    sleep 0 &
    local dead_pid=$!
    wait "$dead_pid"
    mkdir -p "$DOT_RUN_LOCK_DIR"
    echo "$dead_pid" > "${DOT_RUN_LOCK_DIR}/pid"

    __acquire_run_lock
    [ "$(cat "${DOT_RUN_LOCK_DIR}/pid")" = "$$" ]
}

@test "the same process (dot update re-exec) keeps its own lock" {
    __acquire_run_lock
    __acquire_run_lock
    [ "$(cat "${DOT_RUN_LOCK_DIR}/pid")" = "$$" ]
}

@test "release leaves another process's lock alone" {
    mkdir -p "$DOT_RUN_LOCK_DIR"
    echo 1 > "${DOT_RUN_LOCK_DIR}/pid"
    __release_run_lock
    [ -d "$DOT_RUN_LOCK_DIR" ]
}
