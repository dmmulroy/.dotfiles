# NEOVIM CONFIG

**Generated:** 2026-01-05T05:28:49Z
**Commit:** 6c8a501

Lua-based, lazy.nvim managed. TypeScript-focused w/ LSP.

## STRUCTURE

```
nvim/
├── init.lua              # Entry: require("dmmulroy")
├── lua/
│   ├── dmmulroy/         # Personal config module
│   │   ├── init.lua      # Orchestrates all requires
│   │   ├── keymaps.lua   # All keybindings (exported for LSP)
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
| LSP server | `lua/plugins/lsp.lua` → `vim.lsp.config()` |
| Formatter | `lua/plugins/conform.lua` |
| TypeScript | `lua/plugins/typescript-tools.lua` (not lspconfig) |

## CONVENTIONS

- Plugin files return `{ ... }` table (lazy.nvim spec)
- Lazy load via `event`, `ft`, `cmd`, `keys`
- LSP uses nvim 0.11+ API: `vim.lsp.config()` + `vim.lsp.enable()`
- Keymaps applied via `LspAttach` autocmd from exported `keymaps.on_attach`
- Auto-center: all nav commands (`C-u`, `C-d`, `n`, `N`, `gd`) + `zz`

## ANTI-PATTERNS

- tsserver via lspconfig (use typescript-tools.nvim)
- Hardcode colorscheme (catppuccin-macchiato via plugin)
- Skip lazy loading for heavy plugins

## KEY BINDINGS

| Key | Mode | Action |
|-----|------|--------|
| `jj`/`JJ` | i | Exit insert |
| `H`/`L` | n | Line start/end |
| `S` | n | Quick substitute |
| `<leader>e` | n | Oil file explorer |
| `<leader>m` | n | Maximize window |
| `<C-h/j/k/l>` | n | Pane navigation (tmux-aware) |

## LSP SERVERS

typescript-tools (TS/JS), lua_ls, rust_analyzer, ocamllsp (manual), tailwindcss, svelte, biome, eslint (autostart=false)

## FORMATTER CHAIN

JS/TS/TSX: oxfmt → biome → prettierd (first available, respects project config)
