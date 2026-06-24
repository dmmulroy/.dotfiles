# Dark Mode Image

Use this when the user wants to adapt a standalone source image into a dark-mode-suitable version.

## Activation

Activate when the user asks to:

- create a dark-mode version of an image, illustration, screenshot, photo, product mockup, decorative background, or texture
- adapt an existing raster image so it presents correctly on a dark background
- generate a dark-mode image variant for use in a dark-mode UI

Do not activate as the top-level subskill when:

- the user wants to add dark mode to a page, section, component, or site
- the request is about SVG-only assets
- the request is about general image styling in a UI without dark-mode conversion

When the `add-dark-mode` subskill identifies raster images that need dark-mode variants, use this subskill for that image-generation work. This subskill is the required handoff point between dark-mode UI work and raster image generation.

## User-facing progress updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Before doing any image generation or editing, you MUST load and follow the `imagegen` skill
- The `imagegen` skill invocation is not optional: do not skip it, do not replace it with an ad hoc image-generation workflow, and do not call image tooling directly without first applying `imagegen`
- Let `imagegen` choose and run the correct image workflow; for normal dark-mode image variants, that will usually mean its default built-in `image_gen` tool mode
- If the source image is a local file, follow `imagegen`'s local-image guidance before editing so the image is visible in the conversation context
- Follow `imagegen`'s save-path policy: move or copy project-bound generated outputs into the workspace, and never leave a project-referenced dark-mode asset only under `$CODEX_HOME/*`
- When generating a dark-mode image, choose a background color that feels like an appropriate inversion of the original background color: black or dark gray for white, dark gray for off-white, or the specific dark color provided by the user; if the original image's background matched the site background, match the dark-mode site background instead
- Preserve the same contrast characteristics as the original image; light sections should become darker while relative separation and readability stay intact
- Preserve blurs and softness; never sharpen anything that was blurry in the original image
- Preserve the foreground color palette hues, adjusting saturation and lightness only as needed so the image presents correctly on a dark background
- Preserve the original vibe as much as possible: bright and intense images should stay bright and intense, while subtle and muted images should stay subtle and muted
- Pay attention to areas that fade out and preserve those fades in the dark-mode version
- The generated dark-mode image must be exactly the same dimensions as the original image
- Save dark-mode images with a `-dark` suffix, for example `bg.jpg` and `bg-dark.jpg`
