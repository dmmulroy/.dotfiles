#!/usr/bin/env bats
# Component registry: the real component files, metadata validation, and
# --only/--skip selection.

setup() {
    load "../tests/test-helpers"
    load_dot_for_test
}

teardown() {
    cleanup_dot_test
}

@test "every component in DOT_COMPONENT_ORDER is defined with install and check steps" {
    [ "${#DOT_COMPONENT_ORDER[@]}" -gt 0 ]
    [ "${DOT_COMPONENTS[*]}" = "${DOT_COMPONENT_ORDER[*]}" ]
    local name
    for name in "${DOT_COMPONENT_ORDER[@]}"; do
        declare -F "component_${name}_install" >/dev/null
        declare -F "component_${name}_check" >/dev/null
    done
}

@test "every file in lib/components is listed in DOT_COMPONENT_ORDER" {
    local file name
    for file in "${DOT_LIB_DIR}"/components/*.sh; do
        name="$(basename "$file" .sh)"
        [[ " ${DOT_COMPONENT_ORDER[*]} " == *" ${name} "* ]] || {
            echo "components/${name}.sh is not in DOT_COMPONENT_ORDER"
            return 1
        }
    done
}

@test "__define_component rejects a bad os, requirement, or name" {
    run __define_component good_name windows required "Title"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Invalid os 'windows'"* ]]

    run __define_component good_name all sometimes "Title"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Invalid requirement 'sometimes'"* ]]

    run __define_component Bad-Name all required "Title"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Invalid component name"* ]]
}

@test "update falls back to install when a component has no update step" {
    reset_components_for_test
    __define_component stub_a all optional "Stub A"
    component_stub_a_install() { :; }
    component_stub_a_check() { :; }

    [ "$(__component_phase_function stub_a update)" = "component_stub_a_install" ]
    run __component_phase_function stub_a check
    [ "$output" = "component_stub_a_check" ]
}

@test "components for another OS are never selected" {
    reset_components_for_test
    __define_component stub_mac darwin optional "Mac only"
    __define_component stub_linux linux optional "Linux only"
    DOT_OS=linux
    assert_fails __component_is_selected stub_mac
    __component_is_selected stub_linux
}

@test "--only and --skip select components; unknown names fail" {
    reset_components_for_test
    __define_component stub_a all optional "A"
    __define_component stub_b all optional "B"
    __define_component stub_c all optional "C"

    __select_components "stub_a,stub_b" "stub_b"
    __component_is_selected stub_a
    assert_fails __component_is_selected stub_b
    assert_fails __component_is_selected stub_c

    run __select_components "stub_typo" ""
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown component 'stub_typo' in --only"* ]]
}

@test "SKIP_SSH and SKIP_FONT skip ssh_key and font" {
    SKIP_SSH=true SKIP_FONT=true __select_components "" ""
    assert_fails __component_is_selected ssh_key
    assert_fails __component_is_selected font
    __component_is_selected stow
}

@test "__parse_component_option reads --only, --skip=, and --dry-run" {
    DOT_OPTION_ONLY=""
    DOT_OPTION_SKIP=""
    __parse_component_option --only rex,pi extra
    [ "$DOT_OPTION_SHIFT" -eq 2 ]
    __parse_component_option --skip=font
    [ "$DOT_OPTION_SHIFT" -eq 1 ]
    __parse_component_option --dry-run
    [ "$DOT_DRY_RUN" = true ]
    __parse_component_option --not-ours
    [ "$DOT_OPTION_SHIFT" -eq 0 ]
    [ "$DOT_OPTION_ONLY" = "rex,pi" ]
    [ "$DOT_OPTION_SKIP" = "font" ]

    run __parse_component_option --only
    [ "$status" -eq 1 ]
}
