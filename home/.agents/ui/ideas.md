# Ideas

Use this when the user wants to see and pick between multiple UI implementations while previewing them in the browser.

## Activation

Activate when the user asks to:

- come up with a few or several different UI ideas, concepts, directions, designs, options, variants, or alternatives
- propose multiple ways to add a new component, section, layout, or page
- see multiple designs/options/variants/alternatives
- compare different UI approaches for a component, section, or page
- choose what looks best between a few implementations
- get UI suggestions/recommendations (for example: "any suggestions?")

Do not activate when:

- the user asked for one definitive implementation only
- the request is not about UI variation (for example, purely logic or data work)
- "any suggestions?" (or similar) is asked in a non-UI context

## Required companion modules

Before generating variants, always load and apply: [design guidelines](uidotsh://ui/design-guidelines)

## User-facing progress updates

While running this skill, keep the user informed so longer runs do not look stuck.

- Send a short (one line) status update before each major phase.
- Keep updates concrete and lightweight: what you are doing now, not verbose logs.
- On larger codebases, post another brief update every few tool calls or when a step is taking longer than expected.
- If blocked, say what is blocking you and what you will try next.

Suggested phase updates:

- Cleaning prior picker scaffolding from earlier rounds.
- Scanning current UI and identifying decision points.
- Implementing variant options in existing files.
- Injecting/verifying the picker toolbar.
- Preparing selection question(s).
- Finalizing selected variant with partial or full cleanup.
- Running validation checks.

## Workflow

1. If this skill has already been used in the same conversation/project, run an iteration reset pass first:
   - Use the currently selected/visible UI as the baseline.
   - Remove lingering artifacts from earlier rounds: old unselected branches, stale `hidden` attributes, and picker wrappers/attributes that are no longer needed.
   - Keep one toolbar script tag if the user is still comparing options; remove duplicates only.
   - Ensure each area is back to one clean implementation before generating new options.
2. Define decision points before coding:
   - Give each decision a human-readable label (for example: `Hero style`, `Pricing layout`).
   - Decide how many options to generate (default: 3-4 new options unless the user asked for a specific count).
   - When iterating on an existing design, include the current implementation as option 1 and suffix its label with `(current)` (for example: `Minimal (current)`), then add at least 3 new options on top of it (default: 3-4 new options).
   - For entirely new sections with no prior implementation, do not force a `(current)` option (default total: 3-4 options).
3. Plan each option before coding it:

   **New designs (no existing aesthetic):** Write a style definition for each option covering:
   - Layout — grid vs asymmetric, content arrangement, visual emphasis
   - Typography — font character (geometric sans, humanist, serif, mono), scale contrast, weight strategy, tracking
   - Color — warm vs cool, muted vs saturated, specific palette direction (e.g. "warm stone neutrals with terracotta accent")
   - Spacing — airy vs compact, rhythm, whitespace strategy
   - Surfaces — flat vs layered, cards vs open, border/shadow approach
   - Shape — border radius (sharp vs soft vs pill), button style
   - Personality — overall mood, reference points (editorial, SaaS, brutalist, etc.)

   Bad: "Minimal and clean — a simple layout with plenty of whitespace"

   Good: "Editorial and asymmetric — oversized serif headline (DM Serif Display, ~72px) with dramatic scale contrast against small body text. Warm stone neutrals with a single saturated terracotta accent on the CTA only. Generous whitespace, 120px+ between sections. No cards, no borders, no shadows — hierarchy through type scale and weight alone. Pill-shaped buttons with subtle letter-spacing. High-end magazine spread, not a tech product."

   **Adding to an existing design:** Match the existing aesthetic — vary layout, content structure, and component choices, not the style.

4. Implement variants directly in existing source files.
   - Never create standalone preview files
   - New designs — each variant must be a faithful execution of its style definition
   - Existing designs — each variant must feel like it belongs alongside the current UI
   - Share business logic and data flow; vary presentation only
5. Annotate each decision with UI picker attributes:
   - Parent wrapper: `data-uidotsh-pick="Human readable label"`
   - Option nodes: `data-uidotsh-option="Human readable option"`
   - For existing-design variation requests, the first option must be the current implementation and include `(current)` in its option label.
   - Exactly one option visible; all others use `hidden`
   - Apply the Tailwind CSS `contents` class to wrapper and option nodes so wrappers do not affect layout
6. After all variants are implemented (not before), inject the toolbar script once in a shared app layout/root shell:
   - Prefer framework-native script APIs when available.
   - For Laravel, if `resources/views/layouts/app.blade.php` exists, inject the script there once, right before `</body>`.
   - For TanStack projects, update `src/routes/__root.tsx` and inject the picker via the `scripts` array returned from the `head` option in `createRootRoute` (do not add a raw `<script>` tag in the route component markup).
   - For Nuxt projects, use the `useHead` composable in the root `app.vue` (or a layout file such as `layouts/default.vue`) to inject the script.
   - For Vite projects, if an `index.html` exists in the project root, inject the script there once, right before `</body>`.
   - For Next.js, use `next/script` (plain `<script>` in JSX can fail to execute until a full refresh in dev):

   ```tsx
   import Script from 'next/script'

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           {children}
           <Script src="https://ui.sh/ui-picker.js" />
         </body>
       </html>
     )
   }
   ```

   - If there is no framework script primitive, inject a plain script tag once in the shared root layout, right before `</body>`:

   ```html
   <script src="https://ui.sh/ui-picker.js"></script>
   ```

   - Do not place the script in leaf component files, and keep injection idempotent (do not add duplicates).

7. Let the user preview variants in-browser with the picker toolbar.
8. If the toolbar cannot load (for example CSP/offline), skip preview and ask for selection in chat using labels and descriptions.
9. Ask for selection in the agent using the `question` tool:
   - Use explicit option labels matching the UI picker labels.
   - For existing-design variation requests, keep the current implementation as the first choice and preserve the `(current)` suffix in the label.
   - Keep custom input enabled (so `Type your own answer` remains available).
   - For multiple decision points, ask one clear question per decision.
10. Finalize after selection:
    - Keep only selected variants.
    - Remove unselected variants and any now-unneeded picker wrapper attributes.
    - Remove lingering `hidden` attributes and empty wrappers created only for picker scaffolding.
    - Remove temporary comments/suppressions used only for variant scaffolding.
    - During cleanup, remove picker script usage/usages first, then remove any now-unused script-related imports (ideally in one file update) so intermediate saves do not create an invalid state.
    - If the user wants another comparison round, keep a single toolbar script tag in place for faster iteration.
    - If the user is done comparing (or asks for final cleanup), remove the toolbar script and any remaining picker-only scaffolding.

11. Validate final output:
    Check desktop and mobile layouts, ensure no broken semantics or duplicate `id` attributes across surviving markup, ensure no old picker artifacts remain before ending the run (unless intentionally preparing a fresh new comparison immediately), and run relevant lint/typecheck/tests when available.

## Markup patterns

### HTML example

```html
<div data-uidotsh-pick="Hero style" class="contents">
  <div data-uidotsh-option="Minimal" class="contents">...</div>
  <div data-uidotsh-option="Bold" class="contents" hidden>...</div>
  <div data-uidotsh-option="Editorial" class="contents" hidden>...</div>
</div>
```

### React/TSX example

```tsx
<div data-uidotsh-pick="Hero style" className="contents">
  <div data-uidotsh-option="Minimal" className="contents">
    ...
  </div>
  <div data-uidotsh-option="Bold" className="contents" hidden>
    ...
  </div>
</div>
```

## Non-negotiable rules

- Do all variant work in existing source files (no standalone preview file).
- Provide concise user-facing progress updates across major phases.
- Use `data-uidotsh-pick` + `data-uidotsh-option` markers for every decision.
- Use the Tailwind CSS `contents` class on wrapper and option nodes.
- For existing-design variation requests, option 1 must be the current implementation and include `(current)` in its label.
- Unless the user specifies otherwise, generate 3-4 new options per decision; for existing-design variation requests, these are in addition to the `(current)` option.
- Exactly one option starts visible; all others start `hidden`.
- Before starting a new suggestion/options round, clean previous unselected picker artifacts so nothing old lingers.
- Ask for final selection in the agent, then remove all unpicked variants.
- Inject the picker script only after variants are in place; use framework script APIs when available (for Next.js: `next/script`).
- During cleanup, remove script tags/usages before deleting related imports so stepwise saves never leave unresolved references.
- Remove the picker script only when the user is done comparing or explicitly asks for final cleanup.
