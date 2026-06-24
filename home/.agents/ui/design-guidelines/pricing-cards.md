# Pricing Cards

## Design guidelines

- Emphasize cards through button styling and optional "Popular" or "Recommended" text — never use a different background color for the entire card
- For feature list checkmarks, follow [Icons](uidotsh://ui/design-guidelines/icons) rules — use `size-4 h-lh` to vertically center with text

## Coding guidelines

- Never isolate the emphasized card from the rest — it's a grid sibling, not a standalone section
- Always align buttons across pricing cards — `flex flex-col justify-between` on each card; wrap all content above the button in a single `<div>` so the button pushes to the bottom

```html
<div class="flex flex-col justify-between …">
  <div>
    <!-- name, price, description, features -->
  </div>
  <div>
    <button>Get started</button>
  </div>
</div>
```

- If the emphasized card is taller than the siblings, use CSS grid with explicit rows — never use negative margins or relative positioning; the gap rows define how much the card pokes out, unemphasized cards sit in the middle row, the emphasized card spans all rows

```html
<!-- Pokes out top and bottom -->
<div class="{breakpoint}:grid-cols-3 {breakpoint}:grid-rows-[--spacing(6)_1fr_--spacing(6)] grid">
  <div class="{breakpoint}:row-start-2"><!-- normal card --></div>
  <div class="{breakpoint}:row-span-full"><!-- emphasized card --></div>
  <div class="{breakpoint}:row-start-2"><!-- normal card --></div>
</div>

<!-- Pokes out top only -->
<div class="{breakpoint}:grid-cols-3 {breakpoint}:grid-rows-[--spacing(6)_1fr] grid">
  <div class="{breakpoint}:row-start-2"><!-- normal card --></div>
  <div class="{breakpoint}:row-span-full"><!-- emphasized card --></div>
  <div class="{breakpoint}:row-start-2"><!-- normal card --></div>
</div>
```
