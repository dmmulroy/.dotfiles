# Add Dark Mode

Use this when the user wants to add dark mode support to an existing UI.

## Activation

Activate when the user asks to:

- add dark mode to a page, section, component, or site
- improve an existing dark mode treatment
- convert a light-mode-only UI to support dark mode

Do not activate when:

- the user wants a brand-new design or layout
- the user only wants a standalone image converted to dark mode
- the request is about responsive behavior, component organization, or general visual polish without dark mode

## User-facing progress updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Read and follow the [Dark Mode](uidotsh://ui/design-guidelines/dark-mode) guidelines before making changes
- Convert the HTML to include appropriate dark mode classes, following the project's existing Tailwind and framework patterns
- Audit the page for rasterized images that need dark-mode versions
- For every rasterized image that needs a dark-mode variant, you MUST load the [`dark-mode-image` subskill](uidotsh://ui/dark-mode-image)
- Do not generate, edit, or replace raster image assets directly from this subskill; `dark-mode-image` owns that work and MUST use the `imagegen` skill
- This `imagegen` handoff is required even when the image change seems simple, decorative, or incidental
- Save generated dark-mode images alongside the originals and wire them into the dark-mode version of the site
