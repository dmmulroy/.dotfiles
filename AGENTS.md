# DOTFILES

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

macOS + Linux (Debian/Ubuntu, Arch) dev env via GNU Stow. Fish + Neovim + Herdr + Git + pi.

## PRIORITY CHECK — REX CONFIG API AUDIT (WEEKLY)

**Last audit: 2026-11-16**

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
   Flag renamed/removed keys we write, and new keys that map to Ghostty options.
3. If a file/Lua API now exists: migrate `macos-defaults.conf` and the theme
   import into it, and remove `__apply_rex_app_settings`/`__import_rex_theme`
   from `dot`. If only keys changed: update `macos-defaults.conf`.
4. Update **Last audit** above to today's date (even if nothing changed) and
   mention the result to the user.

## STRUCTURE

```
.dotfiles/
├── dot                 # CLI: init/update/doctor/stow/package (2500 lines bash)
├── home/.config/       # Stowed to ~/.config/
│   ├── fish/           # Shell (AGENTS.md)
│   ├── nvim/           # Editor (AGENTS.md)
│   ├── herdr/          # Terminal-native workspace/tab/pane manager
│   ├── rex/            # Rex multiplexer (init.lua -> dmmulroy/, ported from herdr)
│   ├── git/            # Conditional work config
│   ├── ghostty/        # Terminal
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
| Add package | `dot package add <name>` (edits `packages/bundle` on macOS, `packages/apt`/`pacman` on Linux) |
| Shell alias/abbr | `home/.config/fish/conf.d/aliases.fish` |
| Shell function | `home/.config/fish/functions/` |
| Git alias | `home/.config/git/config` [alias] section |
| Neovim plugin | `home/.config/nvim/lua/plugins/<name>.lua` |
| Neovim keymap | `home/.config/nvim/lua/dmmulroy/keymaps.lua` |
| Herdr config | `home/.config/herdr/config.toml` |
| Rex config | `home/.config/rex/dmmulroy/` (`init.lua` bootstraps; keys in `keymaps.lua`; then `rex config check && rex config reload`) |
| Rex config Lua rocks (twitch-lua) | `REX_LUA_ROCKS` in `dot` (`__install_rex_lua_rocks`, run by init/update): `luarocks --lua-version 5.1 --tree ~/.local/share/rex/rocks`; the config reads that tree (`twitch_chat/shared.lua`) |
| Rex app settings (font, Option key, tabs) | `home/.config/rex/macos-defaults.conf` (`dot update` writes defaults; relaunch Rex) |
| Vim/mux pane navigation | `home/.config/nvim/lua/plugins/smart-splits.lua` (Herdr + Rex backends) |
| Starship prompt | `home/.config/starship.toml` |
| Agent skill | `home/.agents/skills/<name>/SKILL.md` |
| Pi extension | `home/.pi/agent/extensions/<name>/` |
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
  (`brew`|`apt`|`pacman`, from `/etc/os-release` `ID`/`ID_LIKE`).
- `TOOL_REGISTRY` 7th field is the OS (`all`|`darwin`|`linux`); init and doctor skip others.
- Linux extras (`__install_linux_extras`): Neovim release (apt's is too old),
  starship, herdr into `~/.local/bin` when the distro lacks them; Fisher is
  fetched after stow in `__setup_fish_shell`.
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

- New VM, from the Mac: `dot exe new <name> [exe.dev new flags]`. It pins
  exe.dev's host key, creates the VM with `exe/first-boot.sh`, waits for
  `~/dot-init.status`, adds the VM's GitHub key (auth + signing) with `gh`,
  and adds it as a Rex host (`ssh://<name>.exe.xyz`). `gh` needs
  `admin:public_key,admin:ssh_signing_key` (`gh auth refresh -s ...`); without
  them, run `dot exe github-key <name>` later.
- Tailscale: `dot exe new` joins VMs as `tag:exe-dev` (pre-approved, no key
  expiry) with a single-use 10-minute auth key minted by a Tailscale OAuth
  client (scope `auth_keys`, tag `tag:exe-dev`). Its ID/secret are
  `TS_EXE_OAUTH_CLIENT_ID`/`TS_EXE_OAUTH_CLIENT_SECRET` in `conf.d/secrets.fish`;
  the VM only sees the one-time key. The policy's `tagOwners` defines the tag,
  and an `ssh` rule lets `autogroup:member` Tailscale-SSH into `tag:exe-dev`.
  Deleting a VM leaves its tailnet device: remove it in the admin console.
  Tailscale API key descriptions allow only letters, digits, spaces, hyphens.
- `exe/first-boot.sh` clones this repo and runs `dot init --headless`; log in
  `~/dot-init.log`, state in `~/dot-init.status` (running/done/failed; a trap
  writes failed if the script dies).
- Account default (also applies to VMs made in the web UI):
  `ssh exe.dev defaults write dev.exe new.setup-script < exe/first-boot.sh`
- `--headless`: skips the font, every `__confirm` takes its default, `sudo chsh`
  instead of `chsh`. It still generates `~/.ssh/id_ed25519_github`; the dotfiles
  remote switches to SSH once GitHub accepts the key.
- Mac SSH: `~/.ssh/config` pins `Host exe.dev *.exe.xyz` to
  `~/.ssh/id_ed25519_github` with `IdentitiesOnly yes` (exe.dev picks the
  account by key).
- Rex: `dot init` installs the Rex server on Linux; add `ssh://<name>.exe.xyz`
  in Rex for Mac (Add Remote Host).
- Test without a VM: Ubuntu 24.04 container, `exedev` user with NOPASSWD sudo.
  `source dot` to call one function (main runs only when executed).
- Model logins are manual and stay on the VM's disk (no proxy/gateway):
  `claude auth login` (Claude subscription via pi-claude-cli, which `dot init`
  installs with Claude Code), then `/login` in pi for ChatGPT/Codex.

## FISH PLUGINS

Fisher owns plugins on every machine: `fish_plugins` is committed, the plugin
files (jhillyerd/plugin-git: `conf.d/git.fish`, `functions/__git.*`, `g*.fish`)
are gitignored, and `dot init` runs `fisher update`. Personal git abbrs go in
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
dot init              # Full setup (brew, stow, bun, ssh, font, fish)
dot update            # Pull + brew update/upgrade + restow + pi update
dot doctor            # Health check
dot stow              # Resymlink only
dot package add X     # Add + install package
dot benchmark-shell   # Fish startup perf
dot gen-ssh-key       # Generate ed25519 key by email domain
dot exe new NAME      # exe.dev VM set up by these dotfiles (+ Rex host)
```

## KEY CONFIGS

| Tool | Entry | Notes |
|------|-------|-------|
| Fish | `config.fish` | Sources `conf.d/`, sets EDITOR/MANPAGER |
| Neovim | `init.lua` | 1 line: `require("dmmulroy")` |
| Herdr | `config.toml` | Prefix `C-;`, workspaces/tabs/panes |
| Rex | `init.lua` -> `dmmulroy/` | Same `C-;` prefix as `ctrl+;>` sequences; app updated by `dot` from Sparkle appcast (not Homebrew); Linux gets the server via pkgs.superlogical.com |
| Git | `config` | SSH signing, `pull.rebase`, conditional include |
| Starship | `starship.toml` | 2s timeout (Vite+ shims), custom.scm after dir |
| Pi | `settings.json` | Private gateway provider, Catppuccin theme |

## UNIQUE STYLES

- herdr prefix: `C-;`
- herdr splits: `\` split right, `Enter` split down
- herdr pane navigation: direct `C-h/j/k/l`
- nvim: `jj`/`JJ` exit insert, `H`/`L` line start/end
- nvim completion: blink.cmp (not nvim-cmp), LSP source score_offset=1000
- git: `fomo` = fetch origin main + rebase
- Theme: Catppuccin Macchiato across all tools

## NOTES

- `dot update` handles WARP VPN brew API issues automatically
- Starship `command_timeout = 2000` because Vite+ node shims are slow
- `secrets.fish` is gitignored — contains env tokens for work services
- `.pi/agent/*` mostly gitignored; extensions explicitly un-ignored
- jj was removed; repo now uses git only
