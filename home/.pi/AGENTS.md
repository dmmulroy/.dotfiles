# PI CONFIG (DOTFILES)

This directory is the **source of truth** for your Pi config:
- Repo path: `~/.dotfiles/home/.pi`
- Live path: `~/.pi`
- Managed via GNU Stow from your dotfiles repo

## Critical Rules

- **Do not edit `~/.pi` directly.**
- Always make changes in `~/.dotfiles/home/.pi`.
- Assume files here are symlinked into `~/.pi`.
- Keep paths portable (prefer `$HOME`, avoid hardcoded machine-specific paths).

## Purpose of This Directory

- `agent/` → Pi runtime/user config (auth + settings)
- `agent/prelude/` → shared helpers for extensions (UI/layout utilities, model/env helpers, common filters)

## Working Conventions for Pi Work

1. Read existing files before editing.
2. Make small, surgical edits when possible.
3. Preserve JSON/Markdown formatting and existing style.
4. Prefer additive changes over destructive rewrites.
5. Before adding new extension utilities, check `agent/prelude/` for existing shared helpers.
6. If a helper is used (or likely to be used) by multiple extensions, extract it into `agent/prelude/`.

## Common Files

- `agent/settings.json` — primary Pi behavior/settings
- `agent/auth.json` — authentication state (treat as sensitive)
- `agent/prelude/README.md` — index of shared extension helpers
- `agent/prelude/ui/README.md` — shared ANSI/layout/box helpers for TUI rendering

## Validation Checklist (after edits)

- JSON is valid and minimally formatted.
- No secrets were accidentally added to tracked files.
- Paths and references are correct for stowed layout.
- Changes are reflected via symlinked `~/.pi` location.
