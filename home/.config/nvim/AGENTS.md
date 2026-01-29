# NEOVIM CONFIG

**Generated:** 2026-01-29T00:00:00Z
**Commit:** f2997bb

Lua-based, lazy.nvim managed. TypeScript-focused w/ LSP. jj-aware.

## STRUCTURE

```
nvim/
├── init.lua              # Entry: require("dmmulroy")
├── lua/
│   ├── dmmulroy/         # Personal config module
│   │   ├── init.lua      # Orchestrates all requires
│   │   ├── keymaps.lua   # All keybindings (exports on_attach for LSP)
│   │   ├── options.lua   # vim.opt settings
│   │   ├── lazy.lua      # lazy.nvim bootstrap
│   │   └── prelude.lua   # Utility functions
│   └── plugins/          # 1 file per plugin
└── after/                # Filetype overrides
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add plugin | `lua/plugins/<name>.lua` returning spec table |
| Add keymap | `lua/dmmulroy/keymaps.lua` |
| Change option | `lua/dmmulroy/options.lua` |
| LSP server | `lua/plugins/lsp.lua` via `vim.lsp.config()` |
| Formatter | `lua/plugins/conform.lua` |
| TypeScript | `lua/plugins/typescript-tools.lua` (not lspconfig) |
| VCS signs | `lua/plugins/vcsigns.lua` (works with jj) |

## CONVENTIONS

- Plugin files return `{ ... }` table (lazy.nvim spec)
- Lazy load via `event`, `ft`, `cmd`, `keys`
- LSP uses nvim 0.11+ API: `vim.lsp.config()` + `vim.lsp.enable()`
- Keymaps applied via `LspAttach` autocmd from exported `keymaps.on_attach`
- Auto-center: ALL nav commands append `zz`
- Module pattern: `local M = {}` ... `return M`

## ANTI-PATTERNS

- tsserver via lspconfig (use typescript-tools.nvim)
- Hardcode colorscheme (catppuccin-macchiato via plugin)
- Skip lazy loading for heavy plugins
- LSP semantic highlights enabled (we disable @lsp groups)

## KEY BINDINGS

| Key | Mode | Action |
|-----|------|--------|
| `jj`/`JJ` | i | Exit insert |
| `H`/`L` | n,v | Line start/end |
| `U` | n | Redo |
| `S` | n | Quick substitute word |
| `<leader>e` | n | Oil file explorer |
| `<leader>m` | n | Maximize window |
| `<leader>w`/`<leader>q` | n | Save/Quit |
| `<leader>'` | n | Switch to last buffer |
| `<leader>f` | n | Format buffer |
| `<leader>1-5` | n | Harpoon file navigation |
| `<leader>sf` | n | Find files (jj-aware) |
| `<leader>sg` | n | Live grep |
| `<leader>/` | n | Fuzzy find in buffer |
| `<leader>ts` | n | Toggle TwoSlash queries |
| `<leader>ih` | n | Toggle inlay hints |
| `<leader>.` | n | Scratch buffer |
| `<leader>og` | n,v | Open in GitHub |
| `gx` | n | Open link (markdown/URL aware) |
| `]c`/`[c` | n | Next/prev hunk (centered) |
| `<C-h/j/k/l>` | n | Pane navigation (tmux-aware) |

## LSP SERVERS

typescript-tools (TS/JS), lua_ls (+ lazydev), rust_analyzer, ocamllsp (manual), tailwindcss, svelte, biome, eslint (autostart=false)

## FORMATTER CHAIN

JS/TS/TSX: oxfmt -> biome -> prettierd (first available, respects project config)

## UNIQUE FEATURES

- vcsigns.nvim: Works with jj, diffs against parent commit
- tiny-inline-diagnostic: Powerline-style inline diagnostics
- Snacks.nvim: Notifications, buffer delete, git browse, toggles
- TwoSlash queries: Inline type inspection for TS
- jj-aware file picker: Tries jj telescope extension first
