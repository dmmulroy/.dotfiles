---
name: pr-walkthrough
description: Generate an interactive visual walkthrough of any pull/merge request as a local HTML webapp. Produces a multi-slide presentation with SVG diagrams, annotated code, and architecture visuals. Pass a PR/MR URL and optional audience context (e.g. "assume I don't know Rust"). Use when the user says "walkthrough this PR", "explain this MR", "visual walkthrough", "PR presentation", or provides a PR/MR URL and asks for a walkthrough.
---

# PR Walkthrough

Generate a polished, interactive HTML slide deck that walks through a pull request or merge request. The output is a self-contained HTML file with no external dependencies that can be opened locally or served via a tunnel.

## Input

The user provides a PR/MR URL and optionally additional context after it. Examples:

```
/skill:pr-walkthrough https://github.com/org/repo/pull/42
/skill:pr-walkthrough https://gitlab.example.com/team/project/-/merge_requests/13 assume i don't know zig or git internals
/skill:pr-walkthrough https://github.com/org/repo/pull/99 this is for a design review with the infra team, focus on the database migration risks
/skill:pr-walkthrough https://github.com/org/repo/pull/7 the audience is frontend engineers who haven't seen the backend before
```

The text after the URL is **audience/framing context** — use it to calibrate:
- **What to explain vs. assume** — e.g., "assume I don't know Rust" → add a background slide on relevant Rust concepts; no context → assume the reader knows the language and skip basics
- **What to emphasize** — e.g., "focus on perf implications" → heavier on benchmarks, data flow, and hot paths
- **Who it's for** — e.g., "for the security team" → emphasize auth, input validation, trust boundaries

If no extra context is given, assume the reader is a **senior+ engineer familiar with the tech stack** who wants a clear narrative of the change — skip language-level background and focus on the design and architecture.

## Workflow

### 1. Gather PR Data

Determine the forge type and fetch PR metadata + diff:

**GitLab (glab CLI):**
```bash
glab mr view <number> --comments   # description, metadata, review comments
glab mr diff <number>              # full diff
```

**GitHub (gh CLI):**
```bash
gh pr view <number> --comments     # description, metadata, review comments
gh pr diff <number>                # full diff
```

If the user provides a full URL, parse out the MR/PR number and repo. If needed, set the repo context:
```bash
gh pr view <number> --repo owner/repo --comments
glab mr view <number> --repo owner/repo --comments
```

If CLI tools aren't available, try `webfetch` on the PR URL as a fallback.

### 2. Analyze the PR

Before generating, deeply understand:

1. **The problem** — what existed before and why it was insufficient
2. **The solution** — the core idea in one sentence
3. **The architecture** — which layers/components are involved and how they connect
4. **The data flow** — how data moves through the system, before and after
5. **The implementation** — file-by-file, what changed and why
6. **Design decisions** — tradeoffs made and alternatives rejected
7. **Results** — benchmarks, metrics, or qualitative improvements
8. **Review findings** — what reviewers flagged, what's approved vs. needs work

Read the actual source files in the repo when needed to understand context beyond the diff. Don't just rely on the diff — understand the surrounding code.

### 3. Plan the Slide Narrative

Structure slides as a **narrative arc**, not a file-by-file diff walkthrough. Typical structure:

| # | Slide | Purpose |
|---|-------|---------|
| 1 | **Title + Impact** | PR name, headline stats, one-sentence summary |
| 2 | **Background** | Domain concepts the reader needs. Explain jargon, protocols, data formats from first principles. Use tables and comparisons. |
| 3 | **The Problem** | What's broken/missing today. Diagrams showing the current flow with pain points highlighted. |
| 4 | **The Solution** | The core idea. Before/after diagrams. Design constraints and decisions. |
| 5 | **Architecture** | Where the code lives. Layer diagram showing all components touched and how they connect. |
| 6–8 | **Implementation** | Step-by-step code walkthrough of each major path (e.g., write path, read path). Annotated code snippets — NOT raw diffs. Flow diagrams with numbered steps. |
| 9 | **Files & Storage** | Summary of all files changed. Storage formats, schema changes, API changes. |
| 10 | **Testing & Review** | Test coverage, review findings, benchmark results, final verdict. |

Adapt the count and structure to the PR. Small PRs might need 4–5 slides. Large ones might need 12+. **Every slide must earn its place** — if it doesn't add understanding, merge it with another.

### 4. Generate the HTML

Write a single self-contained HTML file to `walkthrough/index.html` in the project root. Use the [HTML template reference](references/html-template.md) for the exact CSS framework, component library, and JavaScript.

**Critical quality requirements:**

- **SVG diagrams** for every architectural concept — data flow, layer stacks, before/after comparisons. Never describe what could be shown.
- **Annotated code snippets** — not raw diffs. Use syntax-highlighted pseudo-code or real code with added/removed line markers and comments explaining each change.
- **Color system** — green for improvements/additions, red for problems/removals, blue for neutral info, orange for warnings, purple for architecture elements.
- **Stat cards** for any quantitative results — transfer sizes, timing, counts.
- **Callout boxes** for key insights, warnings, and background knowledge.
- **Responsive** — works on mobile (cards stack vertically).
- **Zero external dependencies** — no CDN links, no Google Fonts, no JS libraries. Everything inline.

### 5. Serve (if requested)

If the user asks to host/serve/share the walkthrough:

```bash
# Start local HTTP server
cd walkthrough && python3 -m http.server 8787 &>/tmp/walkthrough-server.log &
echo "Server PID: $!"
sleep 1

# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:8787 &>/tmp/cloudflared-tunnel.log &
echo "Tunnel PID: $!"
sleep 5

# Extract the public URL
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared-tunnel.log | head -1
```

Provide the URL and teardown command (`kill <tunnel_pid> <server_pid>`).

If `cloudflared` is not available, just open the HTML file directly: `open walkthrough/index.html`

## Principles

1. **Show, don't tell.** If something can be a diagram, make it a diagram.
2. **Calibrate to the audience.** Use the user's context to decide what needs explanation. No context = assume they know the stack. "I don't know X" = teach X from first principles.
3. **Narrative over catalog.** Tell a story: problem → insight → solution → proof. Don't just list files.
4. **Annotate, don't dump.** Code snippets should have inline comments and colored markers. Never paste raw diff hunks.
5. **Earn every slide.** Each slide should teach exactly one concept. If you're explaining two things, split. If a slide is filler, cut it.
6. **Accessible colors.** Use the dark theme color system consistently. Green = good/new, red = bad/removed, blue = info, orange = caution, purple = architecture.
