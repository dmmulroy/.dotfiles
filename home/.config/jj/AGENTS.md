# Jujutsu (jj) Configuration

## Purpose & Scope
Jujutsu VCS settings and workflow customizations. Owns: user identity, signing, revset aliases, custom commands. Does NOT own: per-repo settings.

## Entry Points & Contracts
- `config.toml` — Main config, symlinked to `~/.config/jj/config.toml`
- `hooks/intent-check.sh` — Pre-push hook for AGENTS.md freshness (called via `gp` alias)

## Dependencies
- Watchman (`brew install watchman`) for fsmonitor
- SSH key at `~/.ssh/key.pub` for commit signing

## Usage Patterns
```bash
jj gp              # Push with pre-push hook (use instead of jj git push)
jj tug             # Advance nearest bookmark to closest pushable commit
jj tug main        # Advance specific bookmark
jj stack           # Show all mutable commits connected to @
jj log -r 'wip()'  # Show your mutable work
jj log -r 'open()' # Show your unmerged work
```

## Patterns & Pitfalls
- **Conditional identity**: Work repos in `~/Code/work/` auto-switch to cloudflare.com email
- **Private commits**: Commits with `wip:`/`WIP:` prefix or empty description won't push
- **Use `jj gp` not `jj git push`**: Native jj doesn't run git hooks; `gp` alias invokes pre-push manually
- **Edit mode default**: `jj prev`/`jj next` edit commits in place (not creating new working copy children)
- **Sign on push**: Commits are signed when pushed, not when created
