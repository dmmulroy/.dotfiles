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
|-----|------|----------------|
| ivarvong/mpl#87 | `Axes.pie_label`, so pie percentages and names get separate `textprops` | open (2026-11-21) |

Check: `gh pr view 87 -R ivarvong/mpl --json state,mergeCommit -q '.state + " " + (.mergeCommit.oid // "")'`

When #87 is `MERGED`:
1. Bump the pin (see "Updating mpl" below) to a commit that includes the merge.
2. Typecheck now fails naming `"pie_label"`: add it to `AXES_ALLOWED` in `replay.ts`.
3. Remove the fallback: `MPL_HAS_PIE_LABEL` and its use in `MPL_AXES_METHODS` (`replay.ts`), `PIE_WITHOUT_LABEL`
   and the conditional in `index.ts`, and the `todo` option on the pie_label test. Keep `PIE_WITH_LABEL`.
4. `npm run check -w pi-mpl-extension`: the pie_label test must run and pass (no `todo`).
5. Delete the row above. While it is still open, update its status date when you check.

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
