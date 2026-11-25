# DOTFILES

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

macOS + Linux (Debian/Ubuntu, Arch) dev env via GNU Stow. Fish + Neovim + Rex + Git + pi.

## PRIORITY CHECK — REX CONFIG API AUDIT (WEEKLY)

**Last audit: 2026-11-23**

At the start of every session, compare this date with today. If it is **7 or
more days old**, do this audit **before** the user's task (tell the user you
are doing it, keep it short):

1. Check whether Rex now offers settings in a file or Lua API instead of
   macOS defaults: read https://www.superlogical.com/rex/docs/llms.txt (new
   pages under Customize/References), `customize/config.md`,
   `reference/lua.md`, and search
   `https://www.superlogical.com/rex/docs/search.json?q=settings` (also
   `theme`, `font`).
2. Diff the app's settings keys against `home/.config/rex/macos-defaults.conf`:
   `strings "/Applications/Rex Beta.app/Contents/MacOS/Rex" | grep '^Workspace\.' | sort -u`
   Flag renamed/removed keys we write, and new keys worth setting.
3. If a file/Lua API now exists: migrate `macos-defaults.conf` and the theme
   import into it, and remove `__apply_rex_app_settings`/`__import_rex_theme`
   from `dot/lib/components/rex.sh`. If only keys changed: update `macos-defaults.conf`.
4. Update **Last audit** above to today's date (even if nothing changed) and
   mention the result to the user.

## STRUCTURE

```
.dotfiles/
├── dot/                # CLI (dot/README.md): bin/dot, lib/components/<name>.sh, commands/, tests/
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── rex/            # Rex multiplexer (init.lua -> dmmulroy/)
│   ├── git/            # Conditional work config
│   ├── starship.toml   # Prompt (custom.scm, 2s timeout for Vite+)
│   └── ripgrep/        # rg config
├── home/.agents/       # Shared agent skills (stowed to ~/.agents/)
│   └── skills/         # SKILL.md packages for pi and other agents
├── home/.pi/           # Pi agent workspace (AGENTS.md)
│   └── agent/extensions/ # TypeScript extensions
├── packages/
│   ├── bundle          # Base Brewfile, macOS (32 formulas, 13 casks)
│   ├── bundle.work     # Work additions (formulas only)
│   ├── apt             # Debian/Ubuntu package names, one per line
│   └── pacman          # Arch package names, one per line
└── docs/
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Something dot installs/updates (tool, app, setting) | New component: `dot/lib/components/<name>.sh` + `DOT_COMPONENT_ORDER` in `dot/lib/component-registry.sh` (dot/README.md); test with `dot/tests/run-tests` |
| Add package | `dot package add <name>` (edits `packages/bundle` on macOS, `packages/apt`/`pacman` on Linux) |
| Shell alias/abbr | `home/.config/fish/conf.d/aliases.fish` |
| Shell function | `home/.config/fish/functions/` |
| Git alias | `home/.config/git/config` [alias] section |
| Neovim plugin | `home/.config/nvim/lua/plugins/<name>.lua` |
| Neovim keymap | `home/.config/nvim/lua/dmmulroy/keymaps.lua` |
| Rex config | `home/.config/rex/dmmulroy/` (`init.lua` bootstraps; keys in `keymaps.lua`; then `rex config check && rex config reload`) |
| Rex config Lua rocks (twitch-lua) | `REX_LUA_ROCKS` in `dot/lib/components/rex.sh` (`__install_rex_lua_rocks`, run by init/update): `luarocks --lua-version 5.1 --tree ~/.local/share/rex/rocks`; the config reads that tree (`twitch_chat/shared.lua`) |
| Rex app settings (font, Option key, tabs) | `home/.config/rex/macos-defaults.conf` (`dot update` writes defaults; relaunch Rex) |
| Vim/mux pane navigation | `home/.config/nvim/lua/plugins/smart-splits.lua` (Rex backend) |
| Starship prompt | `home/.config/starship.toml` |
| Agent skill | `home/.agents/skills/<name>/SKILL.md` |
| Pi extension | `home/.pi/agent/extensions/<name>/` (npm deps and pi-claude-cli: `dot/lib/components/pi_extensions.sh`, run by init/update) |
| Move a pi session to another Rex host | `home/.config/rex/dmmulroy/transfer_pi_session/` (README.md) + `home/.pi/agent/extensions/rex-transfer.ts` |
| Pi settings | `home/.pi/agent/settings.json` |
| Work git identity | Auto via `home/.config/git/work_config` for `~/Code/work/` |

## CONVENTIONS

- Stow layout: `home/` mirrors `~`, stow creates symlinks
- Fish: `conf.d/` auto-sourced, `functions/` lazy-loaded
- Neovim: 1 plugin per file in `lua/plugins/`, returns lazy.nvim spec
- Git abbrs: ~180 oh-my-zsh style via `__git.init.fish`
- Private helpers: prefix `__` (e.g., `__git.default_branch`)
- Pi extensions: TypeScript, npm workspaces under `home/.pi/`
- Agent skills: Markdown-first (`SKILL.md`) under `home/.agents/skills/`, stowed to `~/.agents/skills/`

## CROSS-PLATFORM (macOS + Linux)

One stow tree for every OS; differences are runtime checks only (Dax Raad's
`thdxr/environment` model). No per-OS stow packages.

- `dot` sets `DOT_OS` (`darwin`|`linux`) and `DOT_PACKAGE_MANAGER`
  (`brew`|`apt`|`pacman`, from `/etc/os-release` `ID`/`ID_LIKE`;
  `dot/lib/platform-detect.sh`). Package verbs go through the adapter in
  `dot/lib/package-manager.sh`; never branch on the OS to install a package.
- Each component declares its OS (`__define_component <name> all|darwin|linux ...`);
  init, update, and doctor skip the others.
- Linux extras (`dot/lib/components/linux_extras.sh`): Neovim and tree-sitter CLI
  at pinned releases (`NEOVIM_RELEASE_VERSION`, `TREE_SITTER_RELEASE_VERSION`;
  apt's are too old, nvim-treesitter main needs tree-sitter >= 0.26.1), starship
  into `~/.local/bin` when the distro lacks it; Fisher
  (`FISHER_RELEASE_VERSION`) is fetched after stow by the fish component.
- Fish: guard macOS-only config with `test (uname) = Darwin` or `command -q`.
  Vite+ lives in `~/.vite-plus` on macOS, `~/.local/share/vite-plus` on Linux.
- Rex on Linux: `dot` installs the server package (`REX_LINUX_INSTALL_URL`,
  preview channel) and a personal server (`rex server install`, systemd user
  units), so Rex for Mac can add `ssh://<host>`. The Rex app, `macos-defaults.conf`,
  theme import and twitch-lua rocks stay macOS only.
- Casks, WARP/Homebrew fixes: macOS only.
- Never commit absolute symlinks into stowed dirs (stow aborts on them).
- Fish must work on 3.7 (Ubuntu 24.04 / exe.dev): no fish-4-only variables
  such as `$__fish_cache_dir` without a fallback.

## EXE.DEV VMS

Persistent dev boxes on exe.dev (Ubuntu 24.04 `exeuntu` image, user `exedev`).

- VMs are declared in the `iac` repo (`infra/exe-dev`, `IacExeDev` Stack):
  `~/Code/personal/iac` if cloned locally, otherwise github.com/dmmulroy/iac.
  Add one to `src/exe-dev-workstations.ts` and run `vp run deploy:exe-dev`.
  VM names start with `exe-dev-`. Never create VMs with `ssh exe.dev new` for
  long-lived use.
- What a VM installs belongs here (`dot init --headless`); the VM itself,
  its size, integrations, tailnet trust, tailnet device, and GitHub keys
  belong to `iac`.
- First boot: `infra/exe-dev/src/exe-dev-first-boot.sh` (in `iac`) clones
  this repo, runs `dot init --headless`, and joins the tailnet as
  `tag:exe-dev` with Tailscale SSH on, using a token from exe.dev's
  `tailscale-identity` workload identity integration (no auth key or OAuth
  secret). Log in `~/dot-init.log`, state in `~/dot-init.status`
  (running/done/failed). The deploy waits for it, then registers
  `~/.ssh/id_ed25519_github.pub` on GitHub (authentication + signing); a
  transient `dotfiles-ssh-remote` unit switches the dotfiles remote to SSH
  once GitHub accepts the key.
- `--headless`: skips the font, every `__confirm` takes its default, `sudo chsh`
  instead of `chsh`. It still generates `~/.ssh/id_ed25519_github`.
- Connect from a Mac: `ssh exe-dev-<name>` over the tailnet. Tailscale SSH
  authenticates by tailnet identity, so no SSH key is involved. `dot init`
  (`__setup_tailnet_ssh`) adds a `Host exe-dev-* !*.exe.xyz` block to
  `~/.ssh/config` that sets `User exedev` and takes the host key from the
  tailnet through `KnownHostsCommand ~/.local/bin/tailnet-ssh-known-hosts`,
  not from `known_hosts`. Nothing is set up per VM, and a rebuilt VM
  connects as before.
- Rex: `dot init` installs the Rex server on Linux. Add a VM once with
  `rex hosts add <name> ssh://exedev@<name>`; Rex stores hosts in your Rex
  home.
- Delete a VM in `iac`: set `whenRemoved: "delete"` on its entry and deploy,
  then remove the entry and deploy. That deletes the VM, its tailnet device,
  and its GitHub keys.
- Tailscale config (policy/ACLs, tailnet settings, DNS) is managed as code in
  `iac` (`infra/tailnet`). Change it there; never edit it via the API,
  Executor, or the admin console, or the next deploy refuses to write.
- `dot` does not configure the exe.dev CLI (`ssh exe.dev ls`) or the
  `<name>.exe.xyz` route. They need `Host exe.dev *.exe.xyz` in
  `~/.ssh/config` with `IdentityFile ~/.ssh/id_ed25519_github` and
  `IdentitiesOnly yes` (exe.dev picks the account by key), and exe.dev's host
  key (https://exe.dev/docs/faq/host-key).
- Test without a VM: Ubuntu 24.04 container, `exedev` user with NOPASSWD sudo.
  `dot/tests/headless-ubuntu` runs a full `dot init --headless` + `dot doctor`
  that way. `source dot/bin/dot` to call one function (nothing runs when sourced).
- Model logins are manual and stay on the VM's disk (no proxy/gateway):
  `claude auth login` (Claude subscription via pi-claude-cli, which `dot init`
  installs with Claude Code), then `/login` in pi for ChatGPT/Codex.

## FISH PLUGINS

Fisher owns plugins on every machine: `fish_plugins` is committed, the plugin
files (jhillyerd/plugin-git: `conf.d/git.fish`, `functions/__git.*`, `g*.fish`)
are gitignored, and `dot init` and `dot update` run `fisher update`
(`__update_fish_plugins`), restoring plugin files a pull deleted. Personal git abbrs go in
`conf.d/git_abbreviations.fish`, never in the plugin's files.

## ANTI-PATTERNS

- Edit `~/.config/*` directly (changes lost on stow)
- Casks in `bundle.work` (use base bundle)
- Hardcode paths (use `$DOTFILES_DIR`, `$HOME`)
- Nested git repos in stowed dirs (creates symlink issues)
- node_modules in stowed dirs (pi extensions exception — gitignored)
- Skill copies under `home/.pi/agent/skills/` or `~/.pi/agent/skills/`
- Replacing `~/.agents/skills/<name>` stow symlinks with real directories

## IF YOU NOTICE SKILL LAYOUT DRIFT — FIX IT

Canonical skills live in `home/.agents/skills/<name>/` and stow to `~/.agents/skills/<name>` as a symlink. If you see any of these, fix them without being asked:

- A skill under `home/.pi/agent/skills/` or `~/.pi/agent/skills/`: move unique content into `home/.agents/skills/`, then delete the `.pi` copy/symlink.
- `~/.agents/skills/<name>` is a real directory instead of a symlink: copy it back into `home/.agents/skills/<name>/`, remove the live dir, restore the stow symlink.
- `skills` / `vpx skills add|update` wrote copies into `~/.agents` or `~/.pi`: fold the content into the repo copy, restore stow symlinks, do not leave a second tree.
- Do not restore skills the user deleted from `home/.agents/skills/`.

## COMMANDS

```bash
dot init              # Install every component (--only/--skip/--dry-run/--headless)
dot update            # Pull, then update every component (restarts if dot/ changed)
dot doctor            # Check every component; exit 1 on a failed required one
dot components        # Component list: OS, required, update step
dot stow              # Resymlink only
dot package add X     # Add + install package
dot benchmark-shell   # Fish startup perf
dot gen-ssh-key       # Generate ed25519 key by email domain
dot/tests/run-tests   # shellcheck + bats for dot (CI: .github/workflows/dot.yml)
```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|
| Fish | `config.fish` | Sources `conf.d/`, sets EDITOR/MANPAGER |
| Neovim | `init.lua` | 1 line: `require("dmmulroy")` |
| Rex | `init.lua` -> `dmmulroy/` | Prefix `C-;` (`ctrl+;>` sequences); app updated by `dot` from Sparkle appcast (not Homebrew); Linux gets the server via pkgs.superlogical.com |
| Git | `config` | SSH signing, `pull.rebase`, conditional include |
| Starship | `starship.toml` | 2s timeout (Vite+ shims), custom.scm after dir |
| Pi | `settings.json` | Private gateway provider, Catppuccin theme |

## UNIQUE STYLES

- Rex prefix: `C-;`
- pane navigation: direct `C-h/j/k/l` (Neovim + Rex via smart-splits)
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- nvim completion: blink.cmp (not nvim-cmp), LSP source score_offset=1000
- git: `fomo` = fetch origin main + rebase
- Theme: Catppuccin Macchiato across all tools

## NOTES

- `dot update` handles WARP VPN brew API issues automatically
- Starship `command_timeout = 2000` because Vite+ node shims are slow
- `secrets.fish` is gitignored — contains env tokens for work services
- `.pi/agent/*` mostly gitignored; extensions explicitly un-ignored
- Version control is git only
