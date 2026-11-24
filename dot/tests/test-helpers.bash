# Shared setup for dot's bats tests: `load "<relative path>/tests/test-helpers"`.
# Sources dot/bin/dot (functions only, nothing runs) with a throwaway HOME,
# run lock, and packages directory, so tests never touch the real machine.

DOT_TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOT_TEST_BIN="${DOT_TEST_ROOT}/bin/dot"

# A fresh temp HOME and packages dir per test, then load dot.
load_dot_for_test() {
    DOT_TEST_TMP="$(mktemp -d)"
    export HOME="${DOT_TEST_TMP}/home"
    export DOT_RUN_LOCK_DIR="${DOT_TEST_TMP}/run.lock"
    export DOT_PACKAGES_DIR="${DOT_TEST_TMP}/packages"
    export NO_COLOR=1
    mkdir -p "$HOME" "$DOT_PACKAGES_DIR"
    # shellcheck source=../bin/dot
    source "$DOT_TEST_BIN"
}

cleanup_dot_test() {
    [[ -n "${DOT_TEST_TMP:-}" ]] && rm -rf "$DOT_TEST_TMP"
}

# Replace the real components with none, so a test can define stubs:
#   reset_components_for_test
#   __define_component stub_a all required "Stub A"
#   component_stub_a_install() { ...; }
reset_components_for_test() {
    local name
    for name in "${DOT_COMPONENTS[@]}"; do
        unset -f "component_${name}_install" "component_${name}_update" "component_${name}_check"
        unset "DOT_COMPONENT_OS__${name}" "DOT_COMPONENT_REQUIREMENT__${name}" "DOT_COMPONENT_TITLE__${name}"
    done
    DOT_COMPONENTS=()
    DOT_ONLY_COMPONENTS=""
    DOT_SKIP_COMPONENTS=""
}

# Fail the test when a command succeeds. (A bare `! cmd` never fails a bats
# test: bash's errexit ignores negated commands.)
assert_fails() {
    if "$@"; then
        echo "expected to fail: $*"
        return 1
    fi
}
