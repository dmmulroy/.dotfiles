# OpenCode → Pi Migration Plan: Oracle & Librarian

## Goal
Migrate the OpenCode Oracle/Librarian subagent workflows (agents, skills, and code-review orchestration) into Pi with equivalent behavior, reproducible dotfiles paths, and clear safety controls.

## Goals
- Preserve **Oracle** and **Librarian** roles in Pi.
- Preserve key workflows:
  - architecture/review escalation to Oracle
  - unfamiliar-tech research via Librarian
  - code-review flow with Oracle final pass
- Keep configuration in stowed source-of-truth paths under `home/.pi/`.
- Ensure tool parity for `opensrc`, `grep_app`, `context_7`, `websearch`.
- Enforce practical read-only behavior for Oracle/Librarian in Pi.

## Non-Goals
- Migrating all OpenCode assets (e.g., unrelated skills/plugins like Cloudflare/Jira).
- Reproducing OpenCode permission DSL 1:1 (Pi uses different primitives).
- Replacing existing Pi extensions unrelated to subagents/workflows.
- Removing OpenCode config immediately (keep as fallback until cutover is stable).

---

## OpenCode → Pi Mapping

| OpenCode Source | Pi Target | Migration Action |
|---|---|---|
| `home/.config/opencode/agent/oracle.md` | `home/.pi/agent/agents/oracle.md` | Port prompt body; convert frontmatter to Pi-subagents schema (`name`, `description`, `model`, `tools`). |
| `home/.config/opencode/.work/agent/oracle.md` | (merged into canonical `oracle.md`) | Resolve model/reasoning drift before finalizing Oracle persona. |
| `home/.config/opencode/agent/librarian.md` | `home/.pi/agent/agents/librarian.md` | Port prompt + fluent linking requirements; map tools to Pi/MCP tool names. |
| `home/.config/opencode/skill/librarian/SKILL.md` + `references/*` | `home/.pi/agent/skills/librarian/SKILL.md` + `references/*` | Copy/adapt skill; keep tool-routing and output rules. |
| `home/.config/opencode/skill/spec-planner/SKILL.md` | `home/.pi/agent/skills/spec-planner/SKILL.md` | Replace OpenCode `Task(...)` examples with Pi `subagent(...)`; remove/replace unavailable `question` tool dependency. |
| `home/.config/opencode/skill/overseer-plan/SKILL.md` + refs | `home/.pi/agent/skills/overseer-plan/SKILL.md` + refs | Optional parity migration for plan→task conversion flow. |
| `home/.config/opencode/command/code-review.md` | `home/.pi/agent/prompts/code-review.md` (+ optional `agents/code-review.chain.md`) | Recreate 3-reviewer + Oracle-final flow using Pi prompt templates/subagent chain. |
| `home/.config/opencode/opencode.json` (MCP section) | `home/.pi/agent/mcp.json` | Ensure `opensrc`, `grep_app`, `context_7` are present with `directTools` where needed. |
| OpenCode frontmatter `permission` | Agent `tools` allowlist (+ optional guard extension) | Enforce deny-by-omission; add extension-level guard only if allowlist proves insufficient. |
| OpenCode `mode: subagent` | Pi `pi-subagents` package + `home/.pi/agent/agents/*.md` | Use package-provided `subagent` tool and markdown agent definitions. |
| OpenCode `glob`/`webfetch`/`codesearch` assumptions | Pi `find`/`websearch`/MCP tools | Remap missing tools or explicitly document unsupported behavior. |

---

## Target Architecture (Pi)

```text
home/.pi/agent/settings.json
  ├─ packages: npm:pi-subagents, npm:pi-mcp-adapter
  └─ model defaults (provider/model/thinking)

home/.pi/agent/mcp.json
  └─ servers: opensrc, grep_app, context_7 (direct tools)

home/.pi/agent/agents/
  ├─ oracle.md
  ├─ librarian.md
  └─ (optional) code-review.chain.md / reviewer.md

home/.pi/agent/skills/
  ├─ librarian/
  ├─ spec-planner/ (Pi syntax)
  └─ (optional) overseer-plan/

home/.pi/agent/prompts/
  ├─ oracle-review.md
  ├─ librarian-research.md
  └─ code-review.md
```

**Policy boundary:** read-only behavior is primarily via agent `tools` allowlists; use extension hook hardening only if validation reveals leakage.

---

## Phased Execution Plan

### Phase 0 — Canonicalize Source Behavior (S)
**Files**
- `home/.config/opencode/agent/oracle.md`
- `home/.config/opencode/.work/agent/oracle.md`
- `home/.config/opencode/agent/librarian.md`

**Actions**
- Choose canonical Oracle model/reasoning posture.
- Freeze exact persona text to port.

**Acceptance**
- Single canonical Oracle and Librarian definitions agreed before Pi file creation.

### Phase 1 — Make Pi Migration Assets Trackable (M)
**Files**
- `.gitignore`
- `home/.pi/AGENTS.md` (note where migrated agents/prompts live)

**Actions**
- Unignore and track:
  - `home/.pi/agent/agents/**`
  - `home/.pi/agent/prompts/**`
  - optionally `home/.pi/agent/mcp.json`

**Acceptance**
- New agent/prompt files are versioned in dotfiles (no hidden local drift).

### Phase 2 — Port Agent Personas to Pi-Subagents (M)
**Files**
- `home/.pi/agent/agents/oracle.md` (new)
- `home/.pi/agent/agents/librarian.md` (new)
- `home/.pi/agent/agents/code-review.md` (optional new)
- `home/.pi/agent/agents/code-review.chain.md` (optional new)

**Actions**
- Convert unsupported OpenCode frontmatter to Pi-supported fields.
- Define strict tool allowlists.

**Acceptance**
- `subagent` list shows new agents.
- Oracle/Librarian run with intended model + tool scope.

### Phase 3 — Migrate Skills and References (L)
**Files**
- `home/.pi/agent/skills/librarian/SKILL.md` (new)
- `home/.pi/agent/skills/librarian/references/tool-routing.md` (new)
- `home/.pi/agent/skills/librarian/references/opensrc-api.md` (new)
- `home/.pi/agent/skills/librarian/references/opensrc-examples.md` (new)
- `home/.pi/agent/skills/librarian/references/linking.md` (new)
- `home/.pi/agent/skills/librarian/references/diagrams.md` (new)
- `home/.pi/agent/skills/spec-planner/SKILL.md` (modify)
- `home/.pi/agent/skills/overseer-plan/SKILL.md` (+ refs, optional new)

**Actions**
- Port librarian skill.
- Update spec-planner to Pi-native invocation patterns (`subagent(...)`) and available tools.

**Acceptance**
- Skills load correctly.
- No stale OpenCode-only API/tool syntax remains.

### Phase 4 — Recreate Command Workflows as Pi Prompts (M)
**Files**
- `home/.pi/agent/prompts/code-review.md` (new)
- `home/.pi/agent/prompts/oracle-review.md` (new)
- `home/.pi/agent/prompts/librarian-research.md` (new)

**Actions**
- Map OpenCode command behavior to prompt-template macros (`$@`) and explicit subagent orchestration.

**Acceptance**
- `/code-review` performs parallel review pass + mandatory Oracle pass.
- Dedicated prompts work end-to-end.

### Phase 5 — Tool Parity + Guardrails Hardening (L, XL if custom subagent fork needed)
**Files**
- `home/.pi/agent/mcp.json` (modify/track)
- `home/.pi/agent/settings.json` (modify if package/config changes needed)
- `home/.pi/agent/extensions/subagent-policy.ts` (optional new hardening)
- `home/.pi/agent/extensions/subagent/` (optional new, only if package limitations force custom fork)

**Actions**
- Validate MCP tool names and availability.
- Enforce read-only boundaries robustly.

**Acceptance**
- Oracle/Librarian cannot write/edit.
- Required MCP-backed tools are callable.

### Phase 6 — Validation, Cutover, and Deprecation Window (M)
**Files**
- `home/.pi/AGENTS.md` (modify, final usage notes)
- `AGENTS.md` (optional minor routing note)

**Actions**
- Document new invocation patterns.
- Run full validation suite before declaring cutover.

**Acceptance**
- All checklist items pass.
- OpenCode remains untouched for rollback window.

---

## Dependencies
- Phase 1 must complete before Phases 2–4 (otherwise assets may remain untracked).
- Phase 2 (agents) must complete before Phase 4 (prompts invoking them).
- Phase 3 (skills) should precede final prompt tuning in Phase 4.
- Phase 5 depends on Phases 2–4 for realistic validation.
- Phase 6 depends on all prior phases.

---

## Validation Checklist
- [ ] `subagent` tool is available and lists Oracle/Librarian agents.
- [ ] Oracle response format parity is preserved (TL;DR, recommendation, risks, reconsider triggers).
- [ ] Librarian preserves linking/diagram behavior and “full output” expectation.
- [ ] Oracle/Librarian cannot invoke `write`/`edit`.
- [ ] `opensrc_execute`, `grep_app_searchGitHub`, `context_7_*`, and `websearch` are callable in Pi.
- [ ] `spec-planner` contains Pi-native delegation syntax (no stale OpenCode `Task(...)` dependency).
- [ ] `/code-review` executes three reviewer passes + mandatory Oracle final pass.
- [ ] New `home/.pi/agent/agents/**` and `prompts/**` are tracked in git (no local-only drift).
- [ ] Existing Pi behavior (`web-search`, LSP, ast-grep, etc.) remains unaffected.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| OpenCode frontmatter fields are silently ignored in Pi | Convert to explicit Pi-supported schema; verify runtime behavior with focused tests. |
| Tool-name mismatches across MCP adapters (`context7` vs `context_7`) | Validate real tool names via MCP listing before finalizing skills/prompts. |
| Read-only policy not strict enough | Use strict agent `tools` allowlists; add extension-level tool-call guard if needed. |
| Skill auto-load is non-deterministic | Force explicit `/skill:librarian` where critical in prompts/workflows. |
| `.gitignore` hides migration artifacts | Unignore `agents/**`, `prompts/**` (and optionally `mcp.json`) early (Phase 1). |
| Oracle config drift (`agent/oracle.md` vs `.work/agent/oracle.md`) | Resolve canonical source in Phase 0 before migration edits. |
| Parallel review output may be too compressed | Prefer chain mode or customize subagent implementation if fidelity is insufficient. |
| Project-level agent trust/safety issues | Keep project-agent confirmation safeguards enabled; prefer user-scope agents by default. |
| Subagent startup instability (lock-file contention) | Avoid nested/parallel Pi processes during config loading; retry failed scouts serially when needed. |
| Provider/model mismatch (e.g., fallback to missing API key) | Pin valid model in settings/agent frontmatter; verify provider credentials before batch subagent runs. |

---

## Rollback Strategy
1. **Pre-cutover safety checkpoint**
   - Create a dedicated migration branch and checkpoint commit before Phase 1.
   - Keep all OpenCode files unchanged during migration.

2. **Soft rollback (disable migrated behavior, keep files)**
   - Remove/disable new prompts:
     - `home/.pi/agent/prompts/code-review.md`
     - `home/.pi/agent/prompts/oracle-review.md`
     - `home/.pi/agent/prompts/librarian-research.md`
   - Temporarily remove migrated agents from `home/.pi/agent/agents/`.

3. **Config rollback**
   - Revert:
     - `.gitignore`
     - `home/.pi/agent/settings.json`
     - `home/.pi/agent/mcp.json`
     - `home/.pi/agent/skills/spec-planner/SKILL.md`
   - Remove optional hardening extension files if added.

4. **Hard rollback**
   - Revert migration branch/commits entirely.
   - Continue using existing OpenCode workflows while issues are resolved.

---

## Effort by Phase

| Phase | Effort |
|---|---|
| Phase 0 — Canonicalize source behavior | **S** |
| Phase 1 — Trackability + scaffolding | **M** |
| Phase 2 — Agent persona port | **M** |
| Phase 3 — Skills/reference migration | **L** |
| Phase 4 — Prompt workflow migration | **M** |
| Phase 5 — Tool parity + hardening | **L** (**XL** if custom subagent fork required) |
| Phase 6 — Validation + cutover | **M** |

**Overall expected effort:** **L** baseline, **XL** if Phase 5 requires custom extension/fork work.
