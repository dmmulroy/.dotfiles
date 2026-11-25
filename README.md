# Dotfiles

My development environment for macOS and Linux (Debian/Ubuntu via apt, Arch
via pacman): Fish, Neovim, Rex, Git, and pi, managed by a small CLI
called `dot`.

## Quick start

```bash
git clone https://github.com/dmmulroy/.dotfiles.git ~/.dotfiles
~/.dotfiles/dot/bin/dot init

# Remote VM (no prompts, no font):
~/.dotfiles/dot/bin/dot init --headless
```

After the first run, Fish puts `dot` on PATH (`conf.d/paths.fish` adds
`~/.dotfiles/dot/bin`). Other shells: `dot link`, or add that directory to PATH.

## Repository structure

```
~/.dotfiles/
├── dot/               # the dot CLI (see dot/README.md)
│   ├── bin/dot        # entry point
│   ├── lib/           # libraries, one file per component, tests
│   ├── commands/      # one file per command
│   └── tests/         # test runner and container smoke test
├── home/              # configuration, stowed to ~
│   ├── .config/       # fish, nvim, rex, git, ghostty, ...
│   ├── .agents/       # shared agent skills
│   └── .pi/           # pi agent extensions and settings
├── packages/
│   ├── bundle         # Brewfile (macOS)
│   ├── bundle.work    # work formulas (macOS, formulas only)
│   ├── apt            # Debian/Ubuntu packages
│   └── pacman         # Arch packages
└── AGENTS.md          # instructions for AI agents
```

## dot

`dot` manages a list of **components** (Homebrew, packages, stow, Bun, Vite+,
Rex, pi, Claude Code, the GitHub SSH key, the font, Fish, ...). Each one has an
install step, an update step, and a check step, and `init`, `update`, and
`doctor` run them all in the same order. Details: [`dot/README.md`](dot/README.md).

| Command | What it does |
|---------|--------------|
| `dot init` | Install everything; safe to rerun. `--headless`, `--skip-ssh`, `--skip-font` |
| `dot update` | `git pull`, then update every component (packages, stow, Bun, Vite+ and Node.js, Rex, pi, Claude Code, Fish plugins, ...) |
| `dot doctor` | Check every component; exits 1 when a required one fails |
| `dot components` | List components: platform, required, update step |
| `dot package add\|remove\|update\|list` | Edit the package lists and install/uninstall (brew, cask, apt, pacman) |
| `dot check-packages` | Which listed packages are missing |
| `dot retry-failed` | Retry packages that failed during init |
| `dot stow` | Re-link `home/` into `~` |
| `dot benchmark-shell` | Time Fish startup |
| `dot gen-ssh-key EMAIL` | Generate an SSH key for any email |
| `dot completions` | Regenerate Fish completions |
| `dot link` / `dot unlink` | Global symlink for shells without the Fish PATH |
| `dot edit` | Open the repo in `$EDITOR` |

`init`, `update`, and `doctor` take `--only a,b` and `--skip a,b` (component
names from `dot components`); `init` and `update` take `--dry-run`.

```bash
dot update --only rex,pi      # update two components
dot init --only font          # install the font later
dot update --dry-run          # show what would run
```

### Packages

```bash
dot package list              # every list, with install status
dot package add ripgrep       # install + add to packages/bundle (or apt/pacman on Linux)
dot package add docker cask   # a cask
dot package add kubectl brew work   # the work Brewfile (formulas only)
dot package remove docker     # remove from lists; asks before uninstalling
dot package update all base   # upgrade what packages/bundle lists
```

Package lists stay sorted; casks go in `packages/bundle`, never `bundle.work`.

## Key configurations

- **Fish**: functions, abbreviations, Fisher plugins (`fish_plugins`)
- **Neovim**: Lua config with lazy.nvim, one plugin per file
- **Rex**: Lua config in `home/.config/rex/dmmulroy/`; app settings in `macos-defaults.conf`
- **Git**: SSH signing, conditional work config for `~/Code/work/`
- **pi**: extensions in `home/.pi/agent/extensions/`

Edit files under `home/`, never the stowed copies in `~`, then `dot stow`.

## Troubleshooting

**`dot: command not found`**: restart Fish, or run `~/.dotfiles/dot/bin/dot link`.

**Something is off**: `dot doctor` names the component and the fix
(`dot init --only <component>` or `dot update --only <component>`).

**Packages failed during init**: `dot check-packages`, then `dot retry-failed`.

**Another dot run holds the run lock**: wait for it, or remove
`~/.local/state/dot/run.lock` if no `dot` is running.

## Development

```bash
dot/tests/run-tests         # shellcheck + bats
dot/tests/headless-ubuntu   # full headless init in an Ubuntu 24.04 container
```

## License

Personal configuration; fork and adapt freely.
