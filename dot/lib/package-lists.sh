# Package list files: what each machine should have installed.
#   packages/bundle, packages/bundle.work   Brewfiles (macOS): brew "x" / cask "x"
#   packages/apt, packages/pacman           one package name per line, # comments
# Entries are read as "<type><TAB><name>" where type is brew, cask, apt, or pacman.
# Installing them is package-manager.sh's job.

# Print the list file for a package list name on this machine: base or work.
# work is the macOS-only Brewfile of work formulas.
__package_list_file() {
    local list_name="$1"
    case "${DOT_PACKAGE_MANAGER}:${list_name}" in
        brew:base) printf '%s\n' "${PACKAGES_DIR}/bundle" ;;
        brew:work) printf '%s\n' "${PACKAGES_DIR}/bundle.work" ;;
        apt:base|pacman:base) printf '%s\n' "${PACKAGES_DIR}/${DOT_PACKAGE_MANAGER}" ;;
        apt:work|pacman:work)
            __print_error "Package list 'work' exists only on macOS (packages/bundle.work)"
            return 1
            ;;
        none:*)
            __print_error "No supported package manager on this machine (expected brew, apt, or pacman)"
            return 1
            ;;
        *)
            __print_error "Unknown package list '${list_name}': expected base or work"
            return 1
            ;;
    esac
}

# Print the package list names this machine uses, one per line (base, then work
# on macOS when packages/bundle.work exists).
__package_list_names() {
    echo base
    if [[ "$DOT_PACKAGE_MANAGER" == "brew" && -f "${PACKAGES_DIR}/bundle.work" ]]; then
        echo work
    fi
}

# Brewfiles are named bundle*; every other list is one name per line.
__package_list_is_brewfile() {
    [[ "$(basename "$1")" == bundle* ]]
}

# Parse one Brewfile line into "<brew|cask><TAB><name>"; fails for other lines.
__parse_brewfile_entry() {
    local line="$1"

    [[ "$line" =~ ^[[:space:]]*# ]] && return 1
    [[ -z "${line//[[:space:]]/}" ]] && return 1

    if [[ "$line" =~ ^[[:space:]]*brew[[:space:]]+\"([^\"]+)\" ]]; then
        printf 'brew\t%s\n' "${BASH_REMATCH[1]}"
        return 0
    fi
    if [[ "$line" =~ ^[[:space:]]*cask[[:space:]]+\"([^\"]+)\" ]]; then
        printf 'cask\t%s\n' "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

# Parse one plain list line (apt/pacman) into its package name; fails for
# blank and comment lines.
__parse_plain_package_entry() {
    local line="${1%%#*}"
    line="${line//[[:space:]]/}"
    [[ -n "$line" ]] || return 1
    printf '%s\n' "$line"
}

# Print every entry of a package list file as "<type><TAB><name>".
__read_package_list() {
    local list_file="$1"
    local line parsed
    local plain_type
    plain_type="$(basename "$list_file")"

    [[ -f "$list_file" ]] || return 0
    while IFS= read -r line || [[ -n "$line" ]]; do
        if __package_list_is_brewfile "$list_file"; then
            parsed="$(__parse_brewfile_entry "$line")" || continue
            printf '%s\n' "$parsed"
        else
            parsed="$(__parse_plain_package_entry "$line")" || continue
            printf '%s\t%s\n' "$plain_type" "$parsed"
        fi
    done < "$list_file"
}

# Print the type of a package in a list file (brew, cask, apt, pacman), or fail.
__package_list_entry_type() {
    local list_file="$1"
    local package_name="$2"
    local entry_type entry_name
    while IFS=$'\t' read -r entry_type entry_name; do
        if [[ "$entry_name" == "$package_name" ]]; then
            printf '%s\n' "$entry_type"
            return 0
        fi
    done < <(__read_package_list "$list_file")
    return 1
}

# Add a package to a list file, keeping it sorted. Brewfiles keep formulas
# before casks; plain lists keep their leading comment block.
__package_list_add() {
    local list_file="$1"
    local package_type="$2"
    local package_name="$3"

    mkdir -p "$(dirname "$list_file")"
    [[ -f "$list_file" ]] || touch "$list_file"

    local temp_file
    temp_file="$(mktemp)" || return 1

    if ! __package_list_is_brewfile "$list_file"; then
        {
            grep '^#' "$list_file" || true
            {
                __read_package_list "$list_file" | cut -f2
                printf '%s\n' "$package_name"
            } | sort -u
        } > "$temp_file"
        mv "$temp_file" "$list_file"
        return 0
    fi

    local package_line="${package_type} \"${package_name}\""
    local inserted=false
    local line parsed existing_type existing_name
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$inserted" == false ]] && parsed="$(__parse_brewfile_entry "$line")"; then
            IFS=$'\t' read -r existing_type existing_name <<< "$parsed"
            if [[ "$existing_type" == "$package_type" && "$package_name" < "$existing_name" ]] ||
               [[ "$package_type" == "brew" && "$existing_type" == "cask" ]]; then
                printf '%s\n' "$package_line" >> "$temp_file"
                inserted=true
            fi
        fi
        printf '%s\n' "$line" >> "$temp_file"
    done < "$list_file"
    if [[ "$inserted" == false ]]; then
        printf '%s\n' "$package_line" >> "$temp_file"
    fi
    mv "$temp_file" "$list_file"
}

# Remove a package from a list file. Prints the removed entry's type; fails
# when the package is not in the file.
__package_list_remove() {
    local list_file="$1"
    local package_name="$2"
    local removed_type
    removed_type="$(__package_list_entry_type "$list_file" "$package_name")" || return 1

    local temp_file
    temp_file="$(mktemp)" || return 1
    local line parsed entry_name
    while IFS= read -r line || [[ -n "$line" ]]; do
        if __package_list_is_brewfile "$list_file"; then
            parsed="$(__parse_brewfile_entry "$line")" || parsed=""
            entry_name="${parsed#*$'\t'}"
        else
            entry_name="$(__parse_plain_package_entry "$line")" || entry_name=""
        fi
        [[ -n "$entry_name" && "$entry_name" == "$package_name" ]] && continue
        printf '%s\n' "$line" >> "$temp_file"
    done < "$list_file"
    mv "$temp_file" "$list_file"
    printf '%s\n' "$removed_type"
}

# Casks belong in packages/bundle; the work Brewfile takes formulas only.
__validate_work_brewfile() {
    local brewfile="$1"
    local entry_type entry_name
    while IFS=$'\t' read -r entry_type entry_name; do
        if [[ "$entry_type" == "cask" ]]; then
            __print_error "Work Brewfile contains cask '${entry_name}'; casks belong in packages/bundle"
            return 1
        fi
    done < <(__read_package_list "$brewfile")
}
