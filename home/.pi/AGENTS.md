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
│   ├── extensions/       # TypeScript extensions (6 packages + 5 standalone)
│   │   ├── opencode-cloudflare/  # Cloudflare gateway provider (auth, catalog, dispatch)
│   │   ├── web-tools/            # webfetch + websearch tools (Exa provider)
│   │   ├── pi-mcp/               # MCP adapter with OAuth + panel UI
│   │   ├── pi-skill-toggle/      # Skill discovery, toggle UI, frontmatter patching
│   │   ├── pi-cloak/             # Secret cloaking extension
│   │   ├── todos/                # File-based todo management
│   │   ├── answer.ts             # Standalone: answer formatting
│   │   ├── git-interceptor.ts    # Standalone: git command interception
│   │   ├── update.ts             # Standalone: self-update logic
│   │   ├── whimsical.ts          # Standalone: whimsical diagram integration
│   │   └── web-tools.json        # Helium browser profile config
│   └── skills/           # 15 agent skills (SKILL.md + resources)
│       ├── tdd/          # Test-driven development
│       ├── tmux/         # Tmux remote control
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
| Run extension tests | `npm run test:web-tools` (from .pi root) |
| Type-check | `npm run check` (from .pi root) |

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

## KEY SETTINGS

```jsonc
// agent/settings.json
{
  "defaultProvider": "opencode.cloudflare.dev",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high",
  "theme": "catppuccin-macchiato",
  "packages": ["npm:pi-extmgr", "npm:@plannotator/pi-extension", "npm:pi-interview"]
}
```

## GITIGNORE PATTERN

Most of `agent/` is gitignored by default. Tracked files are explicitly un-ignored:
- `agent/settings.json`, `agent/cloak.json`, `agent/tsconfig.json`, `agent/package.json`
- `agent/extensions/**` (but `node_modules/` within are re-ignored)
- `agent/skills/**`
- `agent/themes/*.json`

## NOTES

- `web-tools.json` is Helium browser profile config, not extension settings
- opencode-cloudflare supports native pi `/login` + importing existing OpenCode auth
- pi-skill-toggle has a full UI layer (overlay, render, view-model)
- pi-mcp is forked from pi-mcp-adapter with added OAuth support
