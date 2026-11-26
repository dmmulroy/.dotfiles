# PI AGENT WORKSPACE

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

npm workspace for pi agent extensions. TypeScript, ESM-only.

## STRUCTURE

```
.pi/
├── package.json          # Workspace root: workspaces = ["agent/extensions/*"]
├── tsconfig.json         # Strict, bundler mode, ESNext, noEmit
├── agent/
│   ├── settings.json     # Provider, model, theme, packages, interview config
│   ├── cloak.json        # Secret masking patterns for agent output
│   └── extensions/       # Local TypeScript extensions
│       ├── private-gateway/      # Private inference gateway providers (auth, catalog, dispatch)
│       ├── pi-skill-toggle/      # Skill discovery, toggle UI, frontmatter patching
│       ├── save-md/              # Save assistant responses as Markdown
│       ├── pi-cloak/             # Secret cloaking extension
│       ├── cloudflare-deployment-guard/ # Blocks agent Cloudflare deploys outside agent/cloudflare-deployment-allowlist.json (bash AST via sh-syntax)
│       ├── mpl/                  # Codemode tool mpl_render: matplotlib-style charts (github:ivarvong/mpl), Catppuccin Macchiato default
│       ├── session-finder/       # /find, /find-all: Telescope-style search over sessions (SQLite trigram index in a worker)
│       ├── git-interceptor.ts    # Standalone: git command interception
│       ├── rex-transfer.ts       # Standalone: pi half of Rex's "Transfer pi Session to Host…" (sidecar per pane, /transfer)
│       ├── whimsical.ts          # Standalone: whimsical diagram integration
│       └── web-tools.json        # Helium browser profile config
```

Skills live in `home/.agents/skills/` and stow to `~/.agents/skills/`. Do not copy them here.

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Change default model/provider | `agent/settings.json` |
| Add pi package | `agent/settings.json` → `packages[]` |
| Create extension | `agent/extensions/<name>/` with `package.json` |
| Create standalone extension | `agent/extensions/<name>.ts` |
| Create skill | `home/.agents/skills/<name>/SKILL.md` |
| Secret masking | `agent/cloak.json` |
| Cloudflare deploy guard (false positives, policy) | `agent/extensions/cloudflare-deployment-guard/` (README.md; `npm run replay-sessions -- --strict --show-blocks` re-runs recorded blocks); policy `agent/cloudflare-deployment-allowlist.json` is edited by the user only |
| Session search (/find, /find-all) | `agent/extensions/session-finder/` (README.md; index at `~/.pi/agent/cache/session-finder/index.sqlite`, safe to delete) |
| Chart tool / chart themes | `agent/extensions/mpl/` (`styles/*.mplstyle`, spec docs in `index.ts` `mplInstructions`) |
| Pi Web Tools source | `~/Code/personal/pi-web-tools` |
| Type-check and test local packages | `npm run check` (from .pi root) |

## CONVENTIONS

- Extensions as npm workspace packages: each has own `package.json`
- Standalone extensions: single `.ts` file in `extensions/`
- Skills: `SKILL.md` as entry under `home/.agents/skills/`, optional bundled resources
- ESM only: `"type": "module"` everywhere
- Dependencies: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`
- TypeScript strict mode: `noUncheckedIndexedAccess`, `noImplicitOverride`

## ANTI-PATTERNS

- Installing deps at workspace root for extension-specific needs (use per-package)
- Committing `node_modules/` (gitignored per-extension)
- Editing `agent/settings.json` outside dotfiles repo (stow overwrites)
- Adding runtime state files to git (most of `agent/*` is gitignored, only extensions/settings un-ignored)
- Duplicating skills under `agent/skills/` — they belong in `home/.agents/skills/`
- Writing any model ID from a local `private-gateway` overlay into tests, fixtures, docs, examples, source comments, tracked configuration, or any other version-controlled file. Overlay models are internal/private; use public catalog models or generic placeholders in tracked artifacts.

## KEY SETTINGS

```jsonc
// agent/settings.json
{
  "defaultProvider": "<private-provider-id>",
  "defaultModel": "<private-model-id>",
  "defaultThinkingLevel": "high",
  "theme": "catppuccin-macchiato",
  "packages": ["npm:pi-extmgr", "npm:@plannotator/pi-extension"]
}
```

## GITIGNORE PATTERN

Most of `agent/` is gitignored by default. Tracked files are explicitly un-ignored:
- `agent/settings.json`, `agent/cloak.json`, `agent/tsconfig.json`, `agent/package.json`
- `agent/extensions/**` (but `node_modules/` within are re-ignored)
- `agent/themes/*.json`

## NOTES

- Pi Web Tools is installed from `git:github.com/dmmulroy/pi-web-tools`; `web-tools.json` is only Helium browser profile config
- private-gateway logs in with native pi `/login` (it speaks the gateway's OpenCode-compatible discovery protocol, but never imports OpenCode credentials)
- Treat model IDs supplied through local `private-gateway` overlays as private information: never expose them in version-controlled content.
- pi-skill-toggle has a full UI layer (overlay, render, view-model)
