# Dark Mode

## General principles

- Dark mode is about maintaining the same contrast ratios as light mode, not simply inverting colors
- Dark mode doesn't need to preserve every detail of the light mode design — it just needs to look good
- Default dark mode to follow the operating system's `prefers-color-scheme` setting (Tailwind's built-in `dark:` behavior); only add a manual toggle when the user explicitly asks for one
- Remove all shadows in dark mode — use `dark:shadow-none`
- On dark-mode-only sites, add the `scheme-only-dark` class to `<html>` or the top-level element — ensures native elements like scrollbars, form controls, and `color-scheme` render in dark mode

## Layout and components

- Never keep large branded/colored panels in dark mode; instead use the same background color and add a light divider between sections
- Style cards only slightly lighter than the page background (e.g. `dark:bg-gray-900` on a `dark:bg-gray-950` page); add a `dark:inset-ring dark:inset-ring-white/5` for definition
- Make decorative quote marks in testimonials very faint (e.g. `dark:text-white/5`)
- Never use multiple heading text colors in dark mode (e.g. dark gray + brand color); use a single light color like `white` or `gray-100` for all heading text

## Raster images

- When adding or improving dark mode, audit the page for rasterized images that need dark-mode versions: photos, screenshots, product mockups, decorative backgrounds, textures, and rasterized illustrations
- Never use CSS filters (`invert`, `brightness`, `contrast`, `opacity`) as the final dark-mode treatment for raster images; always create real dark-mode image files
- Generate dark-mode raster image variants with the [`dark-mode-image` subskill](uidotsh://ui/dark-mode-image), which MUST load and use the `imagegen` skill before creating or editing any raster image assets

## SVGs

- For inline `<svg>` elements, style dark mode with Tailwind `dark:*` classes (e.g. `dark:fill-*`, `dark:stroke-*`, `dark:text-*`)
- For external SVG files referenced via `<img>`, always create a dark-mode version alongside the original (e.g. `logo.svg` and `logo-dark.svg`); never substitute CSS filters (`invert`, `brightness`) or opacity adjustments for a true dark variant
