# Landing Pages

- Reuse the same primary/secondary button styling across the entire page — if the hero uses a link-style secondary, every other section with a secondary action (CTA, pricing, etc.) must also use a link-style secondary
- Reuse the same font treatment (size, weight, color) when the same or similar idea appears multiple times on a page — match the existing instance exactly
- Use the same container style across the entire page — once a container style is established (outline, tinted, etc.), all subsequent containers should match
- Use the same border radius for all containers at the same level — panels, cards, and other sibling containers on a page should share a consistent radius
- Use the same column `gap-*` value across all multi-column page sections — card grids, split layouts, and any other two-column or multi-column section must share the same gap; check existing sections before adding a new one and match the value already in use
- Never place a centered/center-constrained layout directly below a left-aligned layout — use left-aligned instead, unless: the section above ends with full-width containers that create a natural divide, a background color change separates them, or a visible divider sits between
- Never have more centered heading groups than left-aligned ones on a landing page — centered headings work best for hero sections, CTAs, and sections with symmetrical content beneath (e.g. centered pricing cards, logo clouds); default to left-aligned for feature grids, split layouts, and content-heavy sections
