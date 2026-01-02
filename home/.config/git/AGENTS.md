# Git Configuration

## Purpose & Scope
Global git identity, signing, and workflow defaults. Owns: user identity, commit signing, aliases, global ignores. Does NOT own: per-repo settings, credentials/secrets.

## Entry Points & Contracts
- `config` — Main git config, symlinked to `~/.config/git/config`
- `work_config` — Conditionally included for `~/Code/work/` repos (Cloudflare identity)
- `ignore` — Global gitignore patterns

## Dependencies
- Fish shell functions (`__git.default_branch`, `git_log_n`) for aliases
- SSH key at `~/.ssh/key.pub` for commit signing

## Patterns & Pitfalls
- **Conditional identity**: Work repos auto-switch to cloudflare.com email via `includeIf gitdir:~/Code/work/`
- **SSH signing**: Both commits and tags are GPG-signed using SSH key format
- **Rebase workflow**: `pull.rebase = true` and `rebase.updateRefs = true` — expect linear history
- **Aliases shell out to fish**: `fomo`, `lg` won't work in non-fish shells
