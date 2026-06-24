# Prose Content

- Never use the `@tailwindcss/typography` plugin — instead, create a `.prose` class that styles raw HTML elements (headings, links, lists, code blocks, images, etc.) using plain CSS with Tailwind's CSS theme variables (`var(--color-*)`, `var(--text-*)`, `var(--font-weight-*)`, `var(--radius-*)`, `--spacing(*)`, `--alpha()`); use `@variant dark { … }` and `@variant hover { … }` for dark mode and hover states; use `* + *` for vertical spacing between elements; style every element that could appear in the rendered markup — `h1`–`h6`, `p`, `a`, `ul`, `ol`, `li`, `pre`, `code`, `img`, `strong`, `blockquote`
- Apply the `.prose` wrapper class to the container element that holds the rendered HTML — `<div class="prose">` around blog post content, markdown output, CMS-generated markup, or any HTML where you can't add Tailwind classes to individual elements
- Default to `var(--text-base)` (`16px`) for prose body text; only use `var(--text-lg)` (`18px`) or larger if specifically requested or the project already uses that size for body text elsewhere
- Never set `max-width` inside the `.prose` CSS — constrain width with a `max-w-[*ch]` class alongside `prose` in the markup (e.g. `<div class="prose max-w-[65ch]">`); use `60ch`–`90ch`, matched to the site's existing content widths
- Set prose body `line-height` to at least `1.75` times the font size — e.g. `--spacing(7)` for `var(--text-base)`
- Use `text-pretty` on blog post and article titles, not `text-balance`
- When the article title/`h1` uses a sans-serif font, use the same sans-serif for all subheadings (`h2`–`h6`) within the article — never mix a sans-serif title with serif subheadings
