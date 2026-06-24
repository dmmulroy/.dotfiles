# Flexbox Layout

- Always add `min-w-0` (or `min-width: 0`) to flex children that need to shrink below their content size — flex items default to `min-width: auto` and won't shrink past their content without it; applies at every scale, from page-level layouts (e.g. a fluid content area next to a fixed-width sidebar using `flex-1`) down to small UI pieces (e.g. a truncated text label in a row, a flexible input next to a fixed button)
- Always add `shrink-0` to flex children that should never shrink — icons, SVGs, images, logos, avatars, and any element that would become visually distorted if compressed
