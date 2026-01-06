# Neovim VCS Tools

Unified diff review for both **jj** and **git** repos.

## Plugins

| Plugin | Purpose |
|--------|---------|
| **diffview.nvim** | Full diff review UI, file history |
| **vcsigns.nvim** | Gutter signs, hunk ops (jj/git/hg native) |
| **telescope-jj.nvim** | jj-aware file picker |

## Diffview

Review all changed files in a single tabpage with side-by-side diffs.

### Keybindings

| Key | Action |
|-----|--------|
| `<leader>gd` | Open diff view (working copy) |
| `<leader>gc` | Close diff view |
| `<leader>gh` | File history (current file) |
| `<leader>gH` | File history (repo) |

### Inside Diffview

| Key | Action |
|-----|--------|
| `<Tab>` / `<S-Tab>` | Next/prev file |
| `j` / `k` | Navigate file list |
| `<CR>` | Open diff for selected file |
| `s` | Stage/unstage (git only, no effect in jj) |
| `S` | Stage all (git only) |
| `U` | Unstage all (git only) |
| `X` | Restore file (discard changes) |
| `R` | Refresh |
| `]c` / `[c` | Next/prev hunk (vim diff-mode) |
| `<leader>gf` | Toggle file panel |
| `<leader>e` | Focus file panel |
| `q` | Close |

### File History

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate commits |
| `<CR>` | View diff for commit |
| `y` | Copy commit hash |
| `q` | Close |

### Workflow: Review Changes

```
<leader>gd     Open diffview
<Tab>          Step through files
]c / [c        Jump between hunks
X              Discard file (restore to committed state)
q              Done
```

## vcsigns

Gutter signs showing diff status. Works natively with jj, git, and hg.

### Keybindings

| Key | Action |
|-----|--------|
| `]c` | Next hunk (centers) |
| `[c` | Prev hunk (centers) |
| `]C` | Last hunk |
| `[C` | First hunk |
| `<leader>hu` | Undo hunk under cursor |
| `<leader>hd` | Toggle inline diff |
| `<leader>hf` | Fold non-hunk lines |
| `]r` | Diff against older commit |
| `[r` | Diff against newer commit |

### Workflow: Quick Hunk Revert

```
]c             Jump to hunk
<leader>hu     Undo it (revert to committed state)
```

### Workflow: Inline Diff View

```
<leader>hd     Toggle inline diff
               Shows deleted lines above current, added lines highlighted
<leader>hd     Toggle off
```

### Workflow: Focus on Changes

```
<leader>hf     Fold everything except hunks
               Navigate with ]c / [c
<leader>hf     Unfold
```

### Target Commit

By default, vcsigns diffs against parent~1 (good for jj new+squash flow).

```
[r             Diff against older commit (parent~2, etc)
]r             Diff against newer commit
```

## Telescope

### Keybindings

| Key | Action |
|-----|--------|
| `<leader>sf` | Find files (jj-aware with git fallback) |
| `<leader>sj` | jj diff (list changed files) |

## Notes

### jj vs git staging

- **git**: Changes must be staged before commit
- **jj**: All changes tracked automatically, no staging

In diffview, `s`/`S`/`U` manipulate git's staging area. In jj repos, these have no effect on jj workflows but won't cause issues.

### Colocated repos

All tools work in jj colocated repos (where `.git` and `.jj` coexist). This is jj's default when cloning or initializing.

### Configuration

- diffview config: `~/.config/nvim/lua/plugins/diffview.lua`
- vcsigns config: `~/.config/nvim/lua/plugins/vcsigns.lua`
