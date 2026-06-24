# Heading Groups

A heading group is a headline and subheadline (and optional eyebrow) at the top of a marketing or landing page section — e.g. the title and description above a feature grid, team grid, pricing table, testimonial section, CTA, or hero. These rules apply to promotional/marketing page sections only, not to blog posts, articles, documentation, or editorial content.

- Never constrain the width of a heading group wrapper — no `max-w-*`, no `max-lg:max-w-*`, no width constraints of any kind on the wrapper `<div>`. Always constrain each text element (headline, subheadline) individually with `max-w-[*ch]` directly on the element — `text-base` → `max-w-[56ch]`, `text-lg` → `max-w-[48ch]`, `text-xl` → `max-w-[40ch]`, `text-2xl`–`text-3xl` → `max-w-[40ch]`, `text-4xl` → `max-w-[35ch]`, `text-5xl` → `max-w-[30ch]`, `text-6xl` → `max-w-[24ch]`, `text-7xl` → `max-w-[20ch]`.

  Example:

  ```html
  <div class="/* never add a max width here */">
    <h2 class="mx-auto max-w-[35ch] text-4xl font-semibold tracking-tight text-balance">…</h2>
    <p class="mx-auto mt-6 max-w-[48ch] text-lg text-pretty text-gray-600">…</p>
  </div>
  ```

- Always use a left-aligned layout for heading groups when the subheadline exceeds ~120 characters (~3 lines when centered)
  - **⚠️ ask-user** if a centered layout is requested but the subheadline exceeds ~120 characters — offer a rewritten version that fits; only center if the user accepts the shorter copy
