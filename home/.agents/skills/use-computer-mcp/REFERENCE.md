# Open Computer Use: macOS overrides

Load only the branch needed for the current interaction.

## Snapshot budgets

State defaults to 500 characters of text, 1200 accessibility nodes, and 64 levels. Action results always use those defaults.

When required semantic text ends in `...`, request a bounded limit first:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\",\"text_limit\":1000}" })
```

Use `"text_limit":"max"` only when the complete text is required. For an incomplete visible long page, list, table, or web app, increase the tree budget after scrolling has failed to expose it:

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\",\"max_tree_nodes\":3000,\"max_tree_depth\":96}" })
```

The budget values must be positive integers. Explicit state calls are the only calls that accept them.

## Coordinate click methods

Omitting `click_method` selects semantic-first `auto`. Explicit methods never fall back:

- `app_post` posts a mouse event directly to the target window without moving the pointer. Use it for a blank area or overlay whose accessibility descendant redirects `auto`.
- `sky_click` uses the private macOS SkyLight background-window path. Use it when Chromium ignores `app_post` and the target window is current, on-screen, in the same Space, and possibly covered. It supports left single/double clicks and preserves foreground focus.
- `global` uses the desktop pointer and may change focus. It requires `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1`; scope that environment override to the single call.

Refresh state before an explicit coordinate click. Refresh again when the window moves, closes, changes Space, becomes hidden, or is minimized. A stale window, unavailable SkyLight symbol, unsupported button/count, or failed delivery is a final error for that explicit method.

```text
mcp({ tool: "computer_click", args: "{\"app\":\"net.imput.helium\",\"x\":875,\"y\":375,\"click_method\":\"app_post\"}" })
```

Revalidate `sky_click` after macOS upgrades because private SkyLight symbols and raw event fields are not API-stable.
