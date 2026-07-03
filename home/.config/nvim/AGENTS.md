# NEOVIM CONFIG

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

Lua-based, lazy.nvim managed. TypeScript-focused w/ LSP.

## STRUCTURE

```
nvim/
├── init.lua              # Entry: require("dmmulroy")
├── lua/
│   ├── dmmulroy/         # Personal config module (13 files)
│   │   ├── init.lua      # Orchestrates all requires
│   │   ├── keymaps.lua   # All keybindings (450 lines, exports map_lsp_keybinds)
│   │   ├── options.lua   # vim.opt settings
│   │   ├── lazy.lua      # lazy.nvim bootstrap
│   │   ├── prelude.lua   # Utility functions (copy_line_diagnostics, open_link)
│   │   └── ...           # highlight_yank, rotate_windows, toggle_diagnostics, etc.
│   └── plugins/          # 1 file per plugin (35 files)
└── after/                # Filetype overrides (ftdetect)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add plugin | `lua/plugins/<name>.lua` returning spec table |
| Add keymap | `lua/dmmulroy/keymaps.lua` |
| Change option | `lua/dmmulroy/options.lua` |
| LSP server | `lua/plugins/lsp.lua` — add to `servers` table |
| Formatter | `lua/plugins/conform.lua` — formatter chain with conditions |
| Completion | `lua/plugins/blink-cmp.lua` (not nvim-cmp) |
| TypeScript | `lua/plugins/typescript-tools.lua` (not lspconfig) |
| VCS signs | `lua/plugins/vcsigns.lua` |
| Symbol outline | `lua/plugins/outline.lua` (`<leader>so`) |
| Statusline | `lua/plugins/lualine.lua` (shows harpoon marks) |

## CONVENTIONS

- Plugin files return `{ ... }` table (lazy.nvim spec)
- Lazy load via `event`, `ft`, `cmd`, `keys`
- LSP uses nvim 0.11+ API: `vim.lsp.config()` + `vim.lsp.enable()`
- Keymaps applied via `LspAttach` autocmd from exported `keymaps.map_lsp_keybinds`
- LSP detaches from non-file buffers (diffview://, fugitive://)
- Auto-center: ALL nav commands append `zz`
- Completion: blink.cmp with LSP priority (score_offset=1000), ghost text enabled
- Module pattern: `local M = {}` ... `return M`

## ANTI-PATTERNS

- tsserver via lspconfig (use typescript-tools.nvim)
- nvim-cmp for completion (use blink.cmp)
- Hardcode colorscheme (catppuccin-macchiato via plugin)
- Skip lazy loading for heavy plugins
- LSP semantic highlights enabled (we disable @lsp groups)
- Formatters without project config condition (conform checks for config files upward)

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
| `<leader>sf` | n | Find files (telescope) |
| `<leader>sg` | n | Live grep |
| `<leader>/` | n | Fuzzy find in buffer |
| `<leader>ts` | n | Toggle TwoSlash queries |
| `<leader>so` | n | Toggle symbol outline |
| `<leader>tc` | n | Run TSC (TypeScript compile) |
| `<leader>rw` | n | Rotate windows |
| `<leader>og` | n,v | Open in GitHub |
| `gx` | n | Open link (markdown/URL aware) |
| `]c`/`[c` | n | Next/prev hunk (centered) |
| `<C-h/j/k/l>` | n | Window navigation |

## LSP SERVERS

typescript-tools (TS/JS), lua_ls (+ lazydev), rust_analyzer, ocamllsp (manual via dune), tailwindcss, svelte, biome, eslint (autostart=false), zls (Zig), sqls, bashls, cssls, html, jsonls, marksman, yamlls, oxlint (needs `.oxlintrc.json`)

## FORMATTER CHAIN

JS/TS/TSX/Astro: oxfmt → biome → prettierd (first available, `stop_after_first = true`)
Svelte: oxfmt → prettierd
Lua: stylua

All formatters are conditional — they only activate when their config file exists upward from the buffer (e.g., `biome.json` for biome, `.prettierrc*` for prettierd, `.oxfmtrc.json` for oxfmt).

## UNIQUE FEATURES

- blink.cmp: Fast completion with LSP priority, ghost text, Tab/S-Tab snippet navigation
- vcsigns.nvim: Git gutter signs, diffs against parent commit
- tiny-inline-diagnostic: Powerline-style inline diagnostics
- Snacks.nvim: Notifications, buffer delete, git browse, toggles
- TwoSlash queries: Inline type inspection for TS
- render-markdown: Rich markdown preview in-buffer
- wilder.nvim: Enhanced cmdline completion (`:`, `/`, `?`)
- lualine: Custom statusline showing harpoon marks + truncated branch
- ConformDisable/ConformEnable: Toggle format-on-save at buffer or global level
