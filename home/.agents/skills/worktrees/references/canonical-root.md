# Canonical worktree root

## Create the root

For a new local root at `<repo>`:

```bash
mkdir <repo>
cd <repo>
git clone --bare <url> .bare
printf '%s\n' 'gitdir: ./.bare' >.git
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git config core.logAllRefUpdates true
git config worktree.useRelativePaths true
git fetch --prune origin
git remote set-head origin --auto
git worktree add main main
git -C main branch --set-upstream-to=origin/main main
```

Replace `main` in the final two commands when the remote default branch has another name. Setup is complete when the invariants below hold and `main` is listed by `git worktree list`.

For an existing clone with unpublished state, preserve its branches, tags, reflogs, worktree changes, ignored files, hooks, and repository-local configuration before conversion. Prefer creating a fresh canonical root and moving commits through Git over rearranging live metadata in place.

## Invariants

Run from `<repo>`:

```bash
git rev-parse --is-bare-repository
git config --get remote.origin.fetch
git config --get core.logAllRefUpdates
git config --get worktree.useRelativePaths
git worktree list --verbose
```

A canonical root resolves to a bare repository, fetches remote branches into `refs/remotes/origin/*`, keeps reflogs, uses relative worktree paths, and lists every live checkout beneath the root.

## Stale registrations

Inspect before pruning:

```bash
git worktree prune --dry-run --verbose
```

Run `git worktree prune --verbose` only after every reported registration is confirmed stale.

## Moved roots or worktrees

After moving the root or a linked worktree, run:

```bash
git worktree repair
```

Then verify every path with `git worktree list --verbose` and `git -C <path> status --short --branch`. Recovery is complete when each live path resolves to its expected branch and no valid registration appears in a prune dry run.
