# Placeholder Content

See [Assets API](uidotsh://ui/design-guidelines/assets-api) for all available endpoints, parameters, and asset IDs.

- When no logo file is provided, use the marks endpoint with the app name provided by the user; pick a font that matches the design
  - Use `color` for the mark and `textColor` for the text; make mark white, black, dark gray, or an accent color; keep text white, black, or dark gray
  - Prefer extension-suffixed asset URLs when supported
  - Omit `text` (and `textColor`/`font`) to get just the mark icon — e.g. `/marks/1.svg?color=blue-500`
  - Never create logos from scratch with HTML or icons — always use the marks or logos endpoint
  - Use the same endpoint for all other logos — company logos in testimonials, client logo grids, etc.
- Always use `https://assets.ui.sh/screenshots/1.webp` for app screenshots, dashboard images, or any UI that should look like a real product — never use Unsplash or stock photos for these; content doesn't need to match, just needs to look like a realistic app UI at a glance
  - For full-width or near-full-width hero images, use the full uncropped screenshot — never use crop parameters at large sizes
  - For feature section screenshots, use only these exact cropped variants — never invent new crop parameters:
    - `?top=900&left=1200&position=bottom-right` — Sidebar + inbox list (1200×900)
    - `?top=900&right=1200&position=bottom-left` — AI agent panel with customer insights (1200×900)
    - `?top=600&right=800&position=bottom-left` — AI agent header, tight focus (800×600)
    - `?top=1200&left=1600&position=bottom-right` — Full interface overview (1600×1200)
    - `?top=1500&left=2000&position=bottom-right` — Wide overview with sidebar, inbox, and conversation (2000×1500)
    - `?top=1400&right=1867&position=bottom-left` — Email conversation + AI assistant (1867×1400)
- Use the avatars endpoint for placeholder avatars, preferring extension-suffixed URLs such as `/avatars/1.webp`
- Use unisex names for placeholder people — avatars are random so names must work for any photo
