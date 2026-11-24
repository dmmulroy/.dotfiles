# Run lock: only one `dot init` or `dot update` runs at a time on a machine,
# so a VM's first boot and a manual update never run stow or brew together.
# A directory is the lock (mkdir is atomic everywhere; macOS has no flock).

DOT_RUN_LOCK_DIR="${DOT_RUN_LOCK_DIR:-${XDG_STATE_HOME:-${HOME}/.local/state}/dot/run.lock}"

# Take the run lock or fail. The lock is released when the process exits.
# `dot update` re-execs itself after a pull; exec keeps the PID, so the new
# process finds its own PID in the lock and keeps it.
__acquire_run_lock() {
    mkdir -p "$(dirname "$DOT_RUN_LOCK_DIR")"

    if ! mkdir "$DOT_RUN_LOCK_DIR" 2>/dev/null; then
        local holder
        holder="$(cat "${DOT_RUN_LOCK_DIR}/pid" 2>/dev/null || true)"
        if [[ "$holder" == "$$" ]]; then
            trap __release_run_lock EXIT
            return 0
        fi
        if [[ -z "$holder" ]] || kill -0 "$holder" 2>/dev/null; then
            __print_error "Another dot run holds the run lock (pid ${holder:-unknown}): ${DOT_RUN_LOCK_DIR}"
            __print_info "If no dot run is active, remove that directory and retry"
            return 1
        fi
        __print_warning "Removing a stale dot run lock left by pid ${holder}"
        rm -rf "$DOT_RUN_LOCK_DIR"
        if ! mkdir "$DOT_RUN_LOCK_DIR" 2>/dev/null; then
            __print_error "Another dot run took the run lock: ${DOT_RUN_LOCK_DIR}"
            return 1
        fi
    fi

    echo "$$" > "${DOT_RUN_LOCK_DIR}/pid"
    trap __release_run_lock EXIT
}

# Release the run lock if this process holds it.
__release_run_lock() {
    if [[ "$(cat "${DOT_RUN_LOCK_DIR}/pid" 2>/dev/null || true)" == "$$" ]]; then
        rm -rf "$DOT_RUN_LOCK_DIR"
    fi
}
