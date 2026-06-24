# Font Recommendations

These are optional recommendations for when the user asks for help choosing a font or wants to try different fonts across design variations. Never force these — only reference them when font selection is part of the task.

## General guidelines

- Default to Inter for body/UI text unless the user is specifically exploring other options
- Always recommend sans-serif fonts unless the user explicitly asks for serif/non-sans-serif, uses words like "sophisticated" or "editorial", or the project clearly calls for it (e.g. luxury brand, literary magazine, fashion editorial)

## By purpose

### Body & UI

Fonts that work well for body copy, application interfaces, and general-purpose use. Most of these also work for headings.

**Sans-serif:**

- **[DM Sans](#dm-sans)** — low-contrast geometric, large x-height, excellent small-text readability
- **[Figtree](#figtree)** — friendly geometric with curved letterforms, warm and approachable
- **[General Sans](#general-sans)** — compact rationalist, space-efficient, good for dense UI
- **[Geist](#geist)** — Swiss-inspired, minimal and precise, built for UI
- **[Host Grotesk](#host-grotesk)** — uniwidth (weight changes don't shift layout), good for nav/tabs/buttons
- **[Inter](#inter)** — clean and highly legible, the default recommendation for screens
- **[Instrument Sans](#instrument-sans)** — geometric neo-grotesque, clean and technical
- **[Mona Sans](#mona-sans)** — GitHub's neo-grotesque, strong industrial feel
- **[Satoshi](#satoshi)** — modernist with personality, double-storey `a` and `g`

**Serif:**

- **[Lora](#lora)** — well-balanced contemporary serif, good readability at body sizes, subtle brush-stroke contrast

### Headlines & display

Fonts best suited for headings and large display text. Many Body & UI fonts above also work well for headings — the fonts listed here are particularly strong choices for display use or are display-only.

**Sans-serif:**

- **[DM Sans](#dm-sans)** — low-contrast geometric that scales up cleanly for headlines while staying readable at body sizes
- **[Fixel Display](#fixel-display)** — geometric-humanist hybrid, display sizes only
- **[Geist](#geist)** — Swiss-inspired precision that looks sharp and authoritative at headline sizes
- **[Inter](#inter)** — clean and versatile with a Display optical size variant that activates automatically at larger sizes
- **[Mona Sans (wide)](#mona-sans)** — Mona Sans with `"wdth"` axis cranked up, strictly for headlines
- **[Satoshi](#satoshi)** — double-storey `a` and `g` give headlines personality without losing modernist discipline

**Serif:**

- **[Instrument Serif](#instrument-serif)** — high-contrast editorial serif, pairs with a sans-serif body for a premium feel

### Monospace

For code snippets, inline code, or a technical/developer aesthetic.

- **[Geist Mono](#geist-mono)** — Vercel's monospace, pairs naturally with Geist
- **[IBM Plex Mono](#ibm-plex-mono)** — IBM's monospace, versatile and highly legible

---

## Font details

### DM Sans

A low-contrast geometric with open apertures and a large x-height. Single-storey `a` and `g`, straight-legged `R`. Excellent small-text readability — works especially well as a body font paired with other headline fonts. Also works for headlines.

- **Source:** load from Google Fonts (`family=DM+Sans:opsz,wght@9..40,100..1000`)
- **Registration:** register in `@theme` as `--font-sans: "DM Sans", sans-serif;`
- **Pairs with:** Inter, Geist

### Figtree

A friendly geometric with distinctive curved `t`, `f`, and `y` letterforms that give it warmth without being playful. Monolinear stroke. Good for friendly, approachable designs. Works for both headlines and body.

- **Source:** load from Google Fonts (`family=Figtree:wght@300..900`)
- **Registration:** register in `@theme` as `--font-sans: "Figtree", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Fixel Display

A geometric-humanist hybrid with open letterforms and wide proportions. Display variant optimized for larger sizes — use for headlines and display text only, never for body copy.

- **Source:** must be self-hosted — download from `https://fixel.macpaw.com`
- **Registration:** register in `@theme` as `--font-display: "Fixel Display", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Geist

A Swiss-inspired sans-serif by Vercel — minimal, precise, built for UI. Works for body copy, application UI, and headings.

- **Source:** load from Google Fonts (`family=Geist:wght@100..900`)
- **Registration:** register in `@theme` as `--font-sans: "Geist", sans-serif;`
- **Pairs with:** Inter, DM Sans

### Geist Mono

A monospace font by Vercel. Good for technical/developer-oriented sites or for code snippets and inline code styling.

- **Source:** load from Google Fonts
- **Registration:** register in `@theme` as `--font-mono: "Geist Mono", monospace;`

### IBM Plex Mono

IBM's monospace typeface. Versatile and highly legible — works for code snippets, technical content, and developer-oriented sites.

- **Source:** load from Google Fonts (`family=IBM+Plex+Mono:wght@400;500;600;700`)
- **Registration:** register in `@theme` as `--font-mono: "IBM Plex Mono", monospace;`

### General Sans

A compact rationalist sans-serif with small apertures and a disciplined, closed feel. Space-efficient — good for dense UI and tight layouts. Works for both headlines and body.

- **Source:** load from Fontshare (`https://api.fontshare.com/v2/css?f[]=general-sans@200,300,400,500,600,700&display=swap`)
- **Registration:** register in `@theme` as `--font-sans: "General Sans", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Host Grotesk

A uniwidth sans-serif — letter widths stay consistent across all weights, so changing weight never shifts layout. Good for tabs, buttons, navigation, and anywhere weight changes must not cause reflow. Works for both headlines and body.

- **Source:** load from Google Fonts (`family=Host+Grotesk:wght@300..800`)
- **Registration:** register in `@theme` as `--font-sans: "Host Grotesk", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Instrument Sans

A geometric neo-grotesque built from straight lines and simple circles. Uniform strokes, straight terminals. Has 12 stylistic sets for alternate glyphs. Best suited for clean, technical interfaces. Works for both headlines and body.

- **Weight restriction:** only supports `font-normal` (400) — never use `font-medium`, `font-semibold`, or `font-bold`
- **Source:** load from Google Fonts (`family=Instrument+Sans:wght@400..700`)
- **Registration:** register in `@theme` as `--font-sans: "Instrument Sans", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Instrument Serif

A high-contrast editorial serif for headlines and display text. Gives pages a premium, editorial feel when paired with a clean sans-serif body font — works especially well for marketing sites, landing pages, and brand-forward designs.

- **Sizing:** Instrument Serif is optically small — never use `text-4xl` or smaller for headings; use `text-5xl` and up where other fonts would use `text-4xl`
- **Source:** load from Google Fonts
- **Registration:** register in `@theme` as `--font-display: "Instrument Serif", serif;`
- **Pairs with:** Inter, Geist, DM Sans

### Inter

A clean, highly legible sans-serif designed for screens. Works well for body copy, application UI, and headings.

- **Source:** always load from `https://rsms.me/inter/inter.css` or self-host — never use the Google Fonts version, which lacks the Display optical size variant and `font-feature-settings` support
- **Optical sizing:** Inter includes a Display variant that automatically activates at larger sizes via `font-optical-sizing: auto`; the Google Fonts build strips this out
- **Feature settings:** turn on optional OpenType features to give Inter a more custom feel — `cv02` (double-story `a`→single-story), `cv03` (open `6`/`9`), `cv04` (open `4`), `cv11` (single-story `l`), `ss01` (open digits), `ss03` (round quotes)
- **Registration:** register in `@theme` as `--font-sans: "InterVariable", sans-serif;` with `--font-sans--font-feature-settings: "cv02", "cv03", "cv04", "cv11";` to enable features globally
- **Pairs with:** Geist, DM Sans

### Lora

A well-balanced contemporary serif with roots in calligraphy. Moderate contrast with subtle brush-stroke terminals — readable at body sizes while still feeling refined. Works for editorial content, blogs, and long-form reading. Also works for headlines.

- **Source:** load from Google Fonts (`family=Lora:wght@400..700`)
- **Registration:** register in `@theme` as `--font-serif: "Lora", serif;`
- **Pairs with:** Inter, Geist, DM Sans, Satoshi

### Mona Sans

GitHub's neo-grotesque with an optical size axis that adjusts letterforms automatically at different sizes. Strong, industrial feel. Works for both headlines and body.

- **Source:** load from Google Fonts (`family=Mona+Sans:wght@200..900`)
- **Width axis:** has a `wdth` variable axis — use a wider value (e.g. `"wdth" 112.5`) for headlines to give them a bolder, more expanded feel; the wide variant is strictly for headlines, never for body copy
- **Registration:** register in `@theme` as `--font-sans: "Mona Sans", sans-serif;`; when using the wide variant for headlines, also register `--font-display: "Mona Sans", sans-serif;` with `--font-display--font-variation-settings: "wdth" 112.5;`
- **Pairs with:** Inter, Geist, DM Sans

### Satoshi

A modernist sans-serif blending rounded shapes with sharp angular details. Double-storey `a` and `g` give it more personality than typical geometrics — lean into that for brand-forward designs. Works for both headlines and body.

- **Source:** load from Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap`)
- **Registration:** register in `@theme` as `--font-sans: "Satoshi", sans-serif;`
- **Pairs with:** Inter, Geist, DM Sans
