# Ghostty Configuration

## Purpose & Scope
Terminal emulator preferences. Owns: appearance, font, window behavior, macOS integration. Does NOT own: shell config (see fish/).

## Entry Points & Contracts
- `config` — Main config file, symlinked to `~/.config/ghostty/config`

## Patterns & Pitfalls
- **Catppuccin Macchiato theme** — consistent with nvim color scheme
- **MonoLisa font** — requires font to be installed separately
- **Auto-update on tip** — bleeding edge, may occasionally break
- **macOS Option-as-Alt** — enables Alt key combos in terminal apps
