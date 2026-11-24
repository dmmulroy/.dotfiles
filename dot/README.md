# dot

`dot` sets up, updates, and checks a machine (macOS, Debian/Ubuntu, Arch) from
this repo. It is Bash, split into small files, with no dependencies beyond what
a fresh Mac or Ubuntu box has (`/bin/bash` 3.2 on macOS included).

```bash
dot init                  # install everything (new machine)
dot init --headless       # remote VM: no prompts, no font (exe.dev first boot)
dot update                # pull the repo, then update everything
dot doctor                # check everything; exits 1 on critical problems
dot components            # what dot manages, in run order
dot update --only rex,pi  # any of init/update/doctor, limited to some components
dot init --dry-run        # print the plan, change nothing
```

`dot help` lists every command; `dot <command> --help` shows its options.

## How it works

Everything `dot` installs is a **component**: one file in
`lib/components/<name>.sh` with up to three steps.

| Step | Run by | Rule |
|------|--------|------|
| `component_<name>_install` | `dot init` | required; must be safe to run again (skip what is already there) |
| `component_<name>_update`  | `dot update` | optional; when missing, update runs install |
| `component_<name>_check`   | `dot doctor` | required; prints ✓/⚠/✗ lines, returns 1 only for real problems |

`init`, `update`, and `doctor` walk the same ordered list
(`DOT_COMPONENT_ORDER` in `lib/component-registry.sh`), so a tool can no longer
be installed by `init` and then forgotten by `update` or `doctor`.

```text
dot init     → for each component: install   (stop at a failed required one)
dot update   → git pull (restart if dot/ changed) → for each component: update
dot doctor   → for each component: check     (exit 1 if a required one fails)
                └─ then a summary table: ✓ ok · ⚠ warnings · ✗ failed
```

Each component declares its platform (`all`, `darwin`, `linux`) and whether it
is `required` (failure stops init/update; a failed check is critical) or
`optional` (warn and continue). `dot components` shows the table.

`init` and `update` take a run lock (`~/.local/state/dot/run.lock`), so a VM's
first boot and a manual update never run stow or brew at the same time.

## Layout

```text
dot/
├── bin/dot                    # entry point: finds the repo, loads lib/, runs dot_main
├── lib/
│   ├── dot-lib.sh             # loads everything below in order
│   ├── dot-main.sh            # global options, command dispatch, command list
│   ├── terminal-output.sh     # __print_*, __confirm, __try, __doctor_check
│   ├── remote-download.sh     # __download_url, __run_remote_installer (retries; no curl | bash)
│   ├── run-lock.sh            # __acquire_run_lock / __release_run_lock
│   ├── platform-detect.sh     # DOT_OS, DOT_PACKAGE_MANAGER
│   ├── package-lists.sh       # packages/bundle, bundle.work, apt, pacman: read, add, remove
│   ├── package-manager.sh     # one adapter over brew, apt, pacman (install, upgrade, list, ...)
│   ├── component-registry.sh  # __define_component, DOT_COMPONENT_ORDER, --only/--skip
│   ├── component-runner.sh    # __run_component_phase install|update|check, summary
│   ├── components/<name>.sh   # one per component
│   └── *.bats                 # tests, next to the code they cover
├── commands/<command>.sh      # cmd_<command> and cmd_<command>_usage (dashes become _)
└── tests/
    ├── run-tests              # shellcheck + every *.bats file
    ├── headless-ubuntu        # real `dot init --headless` in an Ubuntu 24.04 container
    └── test-helpers.bash
```

Sourcing `dot/bin/dot` defines every function and runs nothing; tests and the
iac repo's exe.dev first boot (`__github_accepts_ssh_key`,
`__use_ssh_remote_for_dotfiles`) use that.

## Add a component

1. Create `lib/components/<name>.sh`:

   ```bash
   # Zoxide: what it is and anything surprising about how it is installed.
   __define_component zoxide all optional "zoxide"

   component_zoxide_install() {
       if __command_exists zoxide; then
           __print_success "zoxide is already installed"
           return 0
       fi
       __run_remote_installer https://example.com/install.sh sh -y
   }

   component_zoxide_update() {   # optional; without it update reruns install
       zoxide self-update
   }

   component_zoxide_check() {
       __doctor_check --warn --hint "run: dot init --only zoxide" "zoxide is installed" __command_exists zoxide
   }
   ```

2. Add `zoxide` to `DOT_COMPONENT_ORDER` in `lib/component-registry.sh` where it
   should run (after whatever it needs).
3. `dot/tests/run-tests`. The registry tests fail if the file is not in the
   order list or a step is missing.

A plain package from Homebrew/apt/pacman is not a component: `dot package add <name>`.

## Helpers worth knowing

| Helper | Use |
|--------|-----|
| `__run_remote_installer URL INTERPRETER [ARGS]` | download an install script in full (retries), then run it; `VAR=1 __run_remote_installer ...` passes env |
| `__download_url URL FILE` (`-` for stdout) | curl with retries and timeouts |
| `__try "description" CMD...` | run a sub-step, warn on failure, return its status (`__try ... \|\| status=1`) |
| `__doctor_check [--warn] [--hint TEXT] LABEL CMD...` | one ✓/⚠/✗ doctor line |
| `__package_install TYPE NAME...` | brew, cask, apt, pacman; also `__package_upgrade`, `__package_uninstall`, `__package_is_installed` |
| `__confirm "Question?" y\|n` | prompt; headless runs and non-tty stdin take the default |

## Pinned versions

Linux installs Neovim (`NEOVIM_RELEASE_VERSION`) and the tree-sitter CLI
(`TREE_SITTER_RELEASE_VERSION`) at pinned GitHub releases
(`lib/components/linux_extras.sh`), and bootstraps Fisher at
`FISHER_RELEASE_VERSION` (`lib/components/fish.sh`). Bump the constant to
upgrade; `dot update` installs the new version.

## Tests

```bash
dot/tests/run-tests         # shellcheck + bats (brew install shellcheck bats-core)
dot/tests/headless-ubuntu   # full headless init + doctor in Docker (slow, downloads a lot)
```

CI (`.github/workflows/dot.yml`) runs `run-tests` on macOS and Ubuntu for
changes to `dot/` or `packages/`, and the headless container test on `main`.
