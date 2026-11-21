# MPL EXTENSION

Codemode tool `mpl_render`: replays a JSON call list onto mpl (github:ivarvong/mpl, a pixel-exact TypeScript port of
matplotlib 3.11) and returns PNG/SVG.

| File | Owns |
|------|------|
| `index.ts` | Tool definition, `mplInstructions` (the reference the model reads before charting), theme choice from pi's UI appearance (`resolveMplTheme`) |
| `replay.ts` | Spec → Figure: type-checked Axes/Figure allow-lists, `$dates`/`$float`/`$transform`/`$ret`/`$rc` values, pseudo-calls |
| `render.ts` | Themes (`styles/*.mplstyle`), `$rc` lookups, fonts, colormaps, file output. No pi imports |
| `test/mpl.test.ts` | `npm run check -w pi-mpl-extension` from `home/.pi` |

## PENDING UPSTREAM — CHECK FIRST

Whenever you touch this extension or bump mpl, check each open item. Every one has an `UPSTREAM(<ref>)` marker
in the code (`rg "UPSTREAM\("`) and shows up as a `todo` test in `npm run check`.

| Ref | What | Status (as of) |
|-----|------|----------|
| none | | |

To add one: open the upstream PR, mark every workaround `UPSTREAM(<ref>)`, make the test that needs it a `todo`, and
add a row with the merge check and the cleanup steps for when it lands.

## Updating mpl

1. Review what changed: `git log <pinned>..origin/main` in a clone of ivarvong/mpl; read `docs/api.md` for new or
   changed Axes/Figure methods and kwargs.
2. Bump from `home/.pi`: `npm install "mpl@github:ivarvong/mpl#<sha>" -w pi-mpl-extension`. Editing `package.json`
   alone leaves `package-lock.json` on the old commit.
3. `npm run typecheck`: every public Axes/Figure method must be classified in `replay.ts`. A new one fails as
   `Type 'true' is not assignable to type '"<name>"'`; add it to `AXES_ALLOWED`/`FIGURE_ALLOWED` if a chart spec
   should call it, else to `*_DENIED`. TypeScript-`private` helpers exist on the prototype at runtime but never
   enter these lists, so specs cannot call them.
4. Update `mplInstructions` in `index.ts` for anything the model should use, and fix tests that used a newly
   supported method as their "unknown call" example.
5. Render a real chart in both Catppuccin themes (Macchiato and Latte) and look at it: contrast problems only show there.

## Conventions

- Themes: an omitted `theme` follows pi's UI appearance on every call (light -> `catppuccin-latte`, dark or no UI ->
  `catppuccin-macchiato`); an explicit one is used as given. The two `.mplstyle` files share keys, layout and cycle
  order (blue, mauve, green, peach, red, teal, yellow, pink): change both together.
- Never hardcode a theme hex in `mplInstructions` or examples: use cycle slots `C0..C7` or `{"$rc": key}`
  (e.g. `figure.facecolor` for the background), so guidance holds in both themes.

- `$ret` matches mpl's fixture-spec convention (`{"$ret": i}` is the value `calls[i]` returned), so specs copied from
  mpl's `fixtures/generate_additions.py` replay unchanged.
- Fix gaps in mpl upstream (oracle-verified PR) rather than patching artists from here; record the PR above.
