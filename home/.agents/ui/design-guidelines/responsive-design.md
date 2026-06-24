# Responsive Design

## Design guidelines

- Every layout must adapt from mobile to desktop — use responsive breakpoint classes (`sm:`, `md:`, `lg:`, etc.) to adjust grid columns, spacing, font sizes, and visibility at different screen sizes
- Multi-column desktop layouts (sidebars, secondary navigation, filter panels) must collapse to a single-column layout on small screens — use a mobile menu, disclosure, or other compact pattern instead of shrinking columns
- Body text, subheadings, form controls, and icons should be **larger on mobile** and scale down at `sm:` — write the mobile (larger) size as the default and the desktop (smaller) size with `sm:` (e.g. `text-2xl/8 sm:text-xl/8`, `text-base/7 sm:text-sm/6`, `text-lg/6 sm:text-sm/6`, `size-5 sm:size-4`, `py-2.5 sm:py-1.5`); this applies to body text, subheadings, stat values, form input labels, badges, buttons, select/input padding, and icons — **not** h1s (page titles stay the same size or get smaller on mobile, not bigger)
- Body text must be at least `text-base` (16px) on mobile — `text-sm` is only acceptable at `sm:` or larger breakpoints (e.g. `text-base/7 sm:text-sm/6`, never `text-sm/6` without a breakpoint prefix for body copy)

## Coding guidelines

- Use container queries (`@container`) for component-level responsiveness — anything whose layout depends on available space rather than the viewport (e.g. dashboard widgets, feature cards, pricing tiers, testimonial grids)
- When using container queries, place the `@container` element as close to the responsive content as possible — ideally a direct wrapper around the items, never on a page-level container
