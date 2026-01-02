# Neovim Configuration

## Purpose & Scope
Neovim editor configuration. Owns: keybindings, plugins, LSP setup, appearance. Does NOT own: shell integration (see fish/), terminal (see ghostty/).

## Entry Points & Contracts
- `init.lua` — Entry point, loads `lua/dmmulroy/`
- `lua/dmmulroy/` — Core config: options, keymaps, utilities
- `lua/plugins/` — Lazy.nvim plugin specs
- `after/` — Filetype detection, ftplugins, syntax overrides

## Dependencies
- Lazy.nvim (auto-bootstraps on first launch)
- Mason (auto-installs LSP servers and formatters)
- Ripgrep, fd (for telescope)

## Usage Patterns
```vim
" Leader is Space
<leader>e      " Oil file explorer (float)
<leader>sf     " Find files
<leader>sg     " Live grep
<leader>1-5    " Harpoon file slots
<leader>w/q    " Save/quit
<leader>f      " Format buffer
<leader>d      " Diagnostic float
S              " Find/replace word under cursor
gd/gr/gi       " LSP: definition/references/implementations
```

## Anti-Patterns
- Don't start eslint LSP manually unless needed — it's disabled by default for performance
- Don't use semantic highlights — disabled due to upstream catppuccin issues

## Patterns & Pitfalls
- **Catppuccin Macchiato** — consistent with fish/tmux/ghostty theme
- **All navigation centers cursor** — movements append `zz` (C-d, C-u, n, N, gd, etc.)
- **vim-tmux-navigator** — C-h/j/k/l seamlessly crosses nvim splits and tmux panes
- **eslint LSP disabled by default** — memory hog, causes perf issues; use biome/oxlint instead
- **ocamllsp manual install** — runs via `dune exec ocamllsp`, not Mason
- **jj/JJ exits insert mode** — alternative to Escape
- **blink.cmp for completion** — falls back to cmp_nvim_lsp if unavailable
- **Semantic highlights disabled** — cleared due to catppuccin issue #480
