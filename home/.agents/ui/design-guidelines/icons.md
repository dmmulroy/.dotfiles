# Icons

## Design guidelines

- Never generate raw SVG icons — import from the project's existing icon library, or use Heroicons if no library is established
- Never wrap icons in decorative containers (colored squares, circles with backgrounds) — use the icon directly
- Never scale icons — `viewBox="0 0 24 24"` always uses `size-6`, `viewBox="0 0 20 20"` uses `size-5`, `viewBox="0 0 16 16"` uses `size-4`; if the icon looks too small, use a different icon set, don't increase the size class
- Always use 16px/micro icons (`size-4`) when inline with `text-sm` text — checklists, feature items, comparison tables, inline labels; only use 20px/mini icons (`size-5`) for navigation list icons
- Icons next to a text group (label + supporting text) — align the icon with the first line/label using `items-start` or `items-baseline`, never `items-center` on the group
- Application UIs (dashboards, settings, admin, sidebar nav, forms) — only use Heroicons Micro (16px, `size-4`); never use 20px/mini or 24px/outline icons in application UIs

## Coding guidelines

- Use `size-{n} h-lh` on SVG icons to vertically center them with adjacent text; set the `font-size` on a wrapper element instead of using top margins or manual alignment
- Use `fill-{color}` for filled icons and `stroke-{color}` for stroked icons — never use `text-{color}` with `currentColor` (legacy v2 hack)
- Always add `shrink-0` to icons inside flex containers
