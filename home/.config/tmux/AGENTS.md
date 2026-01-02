# Tmux Configuration

## Purpose & Scope
Terminal multiplexer settings. Owns: keybindings, appearance, session management, plugin config. Does NOT own: shell config (see fish/).

## Entry Points & Contracts
- `tmux.conf` — Main config, symlinked to `~/.config/tmux/tmux.conf`
- `plugins/` — TPM-managed plugins (auto-installed)

## Dependencies
- Fish shell (detected at /opt/homebrew/bin/fish or /usr/local/bin/fish)
- TPM (auto-clones if missing)

## Usage Patterns
```bash
# Prefix is C-; (not C-b)
C-; \      # Horizontal split
C-; Enter  # Vertical split
C-; m      # Maximize pane (toggle)
C-; v      # Enter copy mode
C-; r      # Reload config
```

## Patterns & Pitfalls
- **Prefix is `C-;`** — not the default `C-b`
- **Vim-tmux-navigator**: `C-h/j/k/l` moves between tmux panes AND vim splits seamlessly
- **Theme before continuum**: Plugin order matters — catppuccin must load before continuum or status-right gets overwritten
- **Custom catppuccin fork**: Uses `dmmulroy/catppuccin-tmux` (not upstream)
- **Auto-restore on boot**: continuum restores last session automatically
- **1-indexed**: Windows and panes start at 1, not 0
