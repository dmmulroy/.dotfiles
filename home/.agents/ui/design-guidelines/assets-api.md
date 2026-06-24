# Assets API

Base URL: `https://assets.ui.sh`

Prefer file extensions in asset URLs whenever the route supports them. Use `/marks/{id}.svg`, `/avatars/{id}.webp`, `/logos/{id}.svg`, `/screenshots/{id}.webp`, and `/wallpapers/{type}.webp?variant={name}`.

## Marks

`GET /marks/{id}`

Preferred URL: `/marks/{id}.svg`

Returns an SVG mark, optionally with text.

IDs: `1`

| Param           | Type   | Default | Notes                                                                    |
| --------------- | ------ | ------: | ------------------------------------------------------------------------ |
| `text`          | string |       — | Optional label text                                                      |
| `font`          | string | `inter` | `inter`, `dm-sans`, `sora`, `outfit`, `instrument-sans`, `space-grotesk` |
| `weight`        | number |   `600` | Font weight                                                              |
| `color`         | string | `black` | Mark color                                                               |
| `textColor`     | string | `color` | Text color                                                               |
| `letterSpacing` | number |    `-1` | Spacing between letters in pixels                                        |

## Avatars

`GET /avatars/{id}`

Preferred URL: `/avatars/{id}.webp`

Other image extensions such as `.jpg`, `.jpeg`, and `.png` are also accepted. Prefer `.webp` in docs and examples.

Returns an avatar image.

IDs: `1`-`16`

| Param       | Type   | Default | Notes           |
| ----------- | ------ | ------: | --------------- |
| `size`      | number |       — | Square resize   |
| `w`         | number |       — | Width           |
| `h`         | number |       — | Height          |
| `grayscale` | flag   |     off | Apply grayscale |

## Logos

`GET /logos/{id}`

Preferred URL: `/logos/{id}.svg`

Returns an SVG logo. IDs are matched fuzzily: case-insensitive, ignoring non-alphanumeric characters.

IDs: `align`, `artifact`, `axiom`, `concise`, `looply`, `orbital`, `pinelabs`, `quirk`, `relay`

| Param          | Type   | Default | Notes          |
| -------------- | ------ | ------: | -------------- |
| `color`        | string |       — | Primary fill   |
| `accent-color` | string | `color` | Secondary fill |
| `height`       | string |       — | SVG height     |
| `width`        | string |       — | SVG width      |

## Screenshots

`GET /screenshots/{id}`

Preferred URL: `/screenshots/{id}.webp`

Other image extensions such as `.jpg`, `.jpeg`, and `.png` are also accepted. Prefer `.webp` in docs and examples.

Returns a screenshot image.

IDs: `1`

- `1` colors: `mauve`, `mist`, `olive`, `stone`, `taupe`

| Param    | Type   | Default | Notes            |
| -------- | ------ | ------: | ---------------- |
| `color`  | string |       — | Variant name     |
| `top`    | number |       — | Crop from top    |
| `bottom` | number |       — | Crop from bottom |
| `left`   | number |       — | Crop from left   |
| `right`  | number |       — | Crop from right  |

Crop:

- `top` + `bottom`: height `top + bottom` from `y=0`
- `top` only: top crop with height `top`
- `bottom` only: bottom crop with height `bottom`
- `left` + `right`: width `left + right` from `x=0`
- `left` only: left crop with width `left`
- `right` only: right crop with width `right`
- All values must be positive integers

## Wallpapers

`GET /wallpapers/{type}`

Preferred URL: `/wallpapers/{type}.webp?variant={name}`

Other image extensions such as `.jpg`, `.jpeg`, and `.png` are also accepted. Prefer `.webp` in docs and examples.

Returns a wallpaper image.

| Param     | Type   |       Default | Notes        |
| --------- | ------ | ------------: | ------------ |
| `variant` | string | type-specific | Variant name |

Aliases:

- `landscape` -> `landscapes`

### `blend`

Default: `arctic-glimmer`

Variants:

- `arctic-glimmer`: cool arctic slate and frosted mint in the upper left flowing through a serene cerulean blue then merging into a deep navy and obsidian shadow toward the lower right
- `emerald-mist`: deep forest green and dark moss in the upper left flowing through a vibrant sage and misty lime transition then settling into a soft eucalyptus and pale silver-grey at the lower right
- `golden-hour-mist`: soft champagne and pale cream in the upper left shifting into a warm apricot glow then deepening into a rich honey and toasted sienna at the lower right
- `midnight-nebula`: deep indigo and charcoal in the upper left transitioning into a vibrant violet haze followed by electric magenta and finishing in a soft turquoise glow at the bottom right
- `nebula-glow`: —

### `haze`

Default: `default`

Variants:

- `dark`: dark charcoal and deep grey monochrome
- `default`: warm off-white and cream monochrome
- `mauve-dark`: dark muted purple-grey monochrome
- `mauve`: muted purple-grey and soft lavender monochrome
- `mist-dark`: dark cool blue-grey monochrome
- `mist`: cool blue-grey monochrome
- `sage`: muted sage green and soft olive-grey monochrome
- `taupe-dark`: dark warm taupe monochrome
- `taupe`: warm taupe and neutral grey monochrome

### `horizon`

Default: `arctic-rim`

Variants:

- `arctic-rim`: Deep navy and cold-charcoal backgrounds with highlights of desaturated cyan and pale frosted silver.
- `calcite-dusk`: Deep charcoal and slate backgrounds with highlights of desaturated pearl and soft bone-white.
- `celestial-lead`: Cold lead-gray and charcoal backgrounds with highlights of desaturated lilac and frosted zinc.
- `jade-corner`: Deep oceanic-gray and muted charcoal backgrounds with highlights of desaturated jade and pale misty teal.
- `obsidian-ember`: Deep mahogany and dark umber backgrounds with highlights of desaturated bronze and weathered ash-gray.
- `oxide-center`: Deep graphite and charred-umber backgrounds with highlights of matte rust and weathered bronze.
- `sepia-rim`: Deep umber and warm-charcoal backgrounds with highlights of matte gold and weathered bronze.

### `landscapes`

Default: `valley`

Variants:

- `arctic-fjord`: deep-seated glacial fjord flanked by sheer granite cliffs and distant ice-capped peaks — icy cerulean, muted indigo, frosted slate, pale bone white
- `basalt-plateau`: vast basalt plateau with distant volcanic ridges — ash grey, muted obsidian, dark pewter, faint earthy umber
- `coast`: coastal beach with gentle waves — slate blues, soft teal, pale grey sky, cool sandy beige
- `dunes`: desert dunes at sunset — dusty rose, terracotta, warm mauve, soft peach sky
- `forest`: misty pine forest valley — sage greens, cool grays, muted blue-green
- `fossil-cliffs`: towering chalk cliffs overlooking a still, pale sea — creamy bone white, soft oyster grey, muted sea-foam green, pale flint blue
- `highland-moors`: rolling highland moorland with patches of wild heather and moss — muted heather purple, deep moss green, weathered peat brown, soft charcoal grey
- `hills`: rolling pastoral hills with scattered autumn trees — olive green, faded ochre, burnt umber, warm taupe
- `lake`: still lake at twilight with forested shoreline — deep slate blue, muted teal, soft peach undertones
- `limestone-karst`: submerged limestone pillars rising from a calm and misty bay — faded lichen green, weathered grey stone, soft misty blue water
- `meadow`: alpine meadow with distant mountains — soft sage green, pale grey-blue mountains, warm hay tones
- `misty-marshland`: low-lying wetlands with scattered pools and tall reeds — mossy green, muted bronze, dark water grey, pale foggy lavender
- `pampas-grassland`: expansive plains of tall pampas grass under a wide, open sky — pale straw, muted silver, dusty lilac, soft grey-blue
- `salt-crust-expanse`: expansive dry salt flats with distant mountain silhouettes — pearl white, ivory, faint lilac shadows, muted silver-grey
- `snow`: minimalist snowfield with soft rolling dunes — off-white snow, cool blue-grey shadows, pale sky
- `valley`: misty mountain valley with scattered trees — sage greens, soft grays, warm taupe undertones
- `weathered-badlands`: deeply eroded sedimentary hills and canyons with horizontal strata lines — muted terracotta, dusty clay, pale sandstone, soft ochre, warm charcoal

### `silk`

Default: `crimson-surge`

Variants:

- `crimson-surge`: Deep scarlet and polished ruby textures
- `cyan-glacier`: Vivid turquoise and liquid crystalline textures
- `emerald-glint`: Deep hunter green and iridescent teal accents
- `midnight-violet`: Deep obsidian and translucent violet hues
- `molten-amber`: Deep burnt orange and polished bronze textures
- `platinum-flow`: Liquid mercury and polished titanium textures
- `sapphire-flux`: Deep royal blue and luminous sapphire-blue textures

## Color Resolution

Color params accept Tailwind names like `red-500` and `blue-600`, resolved to `oklch()`. Other CSS colors pass through unchanged.
