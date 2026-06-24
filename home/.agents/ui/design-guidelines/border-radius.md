# Border Radius

- Use concentric border radii on closely nested rounded elements — define the relationship explicitly with CSS variables and `calc()` so the math is enforced, e.g. `rounded-(--radius) p-(--padding)` on the outer element, `rounded-[calc(var(--radius)-var(--padding))]` on the inner
- Use `min()` with viewport units for image/screenshot border radii instead of fixed `rounded-*` values — e.g. `rounded-[min(1vw,12px)]`; the radius should match the intended value at full desktop width and scale proportionally as the screen shrinks
