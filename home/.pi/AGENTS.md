# PI AGENT WORKSPACE

**Generated:** 2026-05-09T00:00:00Z
**Commit:** 871ce6f

npm workspace for pi agent extensions + skills. TypeScript, ESM-only.

## STRUCTURE

```
.pi/
├── package.json          # Workspace root: workspaces = ["agent/extensions/*"]
├── tsconfig.json         # Strict, bundler mode, ESNext, noEmit
├── agent/
│   ├── settings.json     # Provider, model, theme, packages, interview config
│   ├── cloak.json        # Secret masking patterns for agent output
│   ├── extensions/       # Local TypeScript extensions
│   │   ├── opencode-cloudflare/  # Cloudflare gateway provider (auth, catalog, dispatch)
│   │   ├── pi-skill-toggle/      # Skill discovery, toggle UI, frontmatter patching
│   │   ├── save-md/              # Save assistant responses as Markdown
│   │   ├── pi-cloak/             # Secret cloaking extension
│   │   ├── git-interceptor.ts    # Standalone: git command interception
│   │   ├── whimsical.ts          # Standalone: whimsical diagram integration
│   │   └── web-tools.json        # Helium browser profile config
│   └── skills/           # 15 agent skills (SKILL.md + resources)
│       ├── tdd/          # Test-driven development
│       ├── herdr/        # Herdr remote control
│       ├── triage/       # Issue triage state machine
│       ├── init-deep/    # AGENTS.md generation (this skill)
│       └── ...           # grill-with-docs, to-issues, to-prd, write-a-skill, etc.
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Change default model/provider | `agent/settings.json` |
| Add pi package | `agent/settings.json` → `packages[]` |
| Create extension | `agent/extensions/<name>/` with `package.json` |
| Create standalone extension | `agent/extensions/<name>.ts` |
| Create skill | `agent/skills/<name>/SKILL.md` |
| Secret masking | `agent/cloak.json` |
| Pi Web Tools source | `~/Code/personal/pi-web-tools` |
| Type-check and test local packages | `npm run check` (from .pi root) |

## CONVENTIONS

- Extensions as npm workspace packages: each has own `package.json`
- Standalone extensions: single `.ts` file in `extensions/`
- Skills: `SKILL.md` as entry, optional bundled resources (templates, patches)
- ESM only: `"type": "module"` everywhere
- Dependencies: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`
- TypeScript strict mode: `noUncheckedIndexedAccess`, `noImplicitOverride`

## ANTI-PATTERNS

- Installing deps at workspace root for extension-specific needs (use per-package)
- Committing `node_modules/` (gitignored per-extension)
- Editing `agent/settings.json` outside dotfiles repo (stow overwrites)
- Adding runtime state files to git (most of `agent/*` is gitignored, only extensions/skills/settings un-ignored)
- Writing any model ID from a local `opencode-cloudflare` overlay into tests, fixtures, docs, examples, source comments, tracked configuration, or any other version-controlled file. Overlay models are internal/private; use public catalog models or generic placeholders in tracked artifacts.

## KEY SETTINGS

```jsonc
// agent/settings.json
{
  "defaultProvider": "opencode.cloudflare.dev",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high",
  "theme": "catppuccin-macchiato",
  "packages": ["npm:pi-extmgr", "npm:@plannotator/pi-extension"]
}
```

## GITIGNORE PATTERN

Most of `agent/` is gitignored by default. Tracked files are explicitly un-ignored:
- `agent/settings.json`, `agent/cloak.json`, `agent/tsconfig.json`, `agent/package.json`
- `agent/extensions/**` (but `node_modules/` within are re-ignored)
- `agent/skills/**`
- `agent/themes/*.json`

## NOTES

- Pi Web Tools is installed from `git:github.com/dmmulroy/pi-web-tools`; `web-tools.json` is only Helium browser profile config
- opencode-cloudflare supports native pi `/login` + importing existing OpenCode auth
- Treat model IDs supplied through local `opencode-cloudflare` overlays as private information: never expose them in version-controlled content.
- pi-skill-toggle has a full UI layer (overlay, render, view-model)
