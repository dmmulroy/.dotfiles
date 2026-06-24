# SVG

- Omit `xmlns` on inline `<svg>` elements in HTML/JSX — only needed when the SVG is a standalone `.svg` file
- Style SVG colors with Tailwind classes (`fill-*`, `stroke-*`, `text-*` with `fill="currentColor"`/`stroke="currentColor"`) instead of hardcoded color attributes or inline ternaries — use `data-*`/`aria-*` variants or conditional classes to switch colors
- Never combine `fill="currentColor"`/`stroke="currentColor"` attributes with `fill-*`/`stroke-*` classes on the same element — the attribute conflicts with the class; use `fill-current`/`stroke-current` to inherit the text color, or drop the attribute entirely when using a specific color class like `fill-zinc-400`
