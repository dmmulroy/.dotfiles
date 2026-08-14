---
name: computer-use-mcp
description: Computer use through Open Computer Use MCP. Use when a task requires interacting with a desktop app or authenticated browser UI, choosing a Helium work/personal profile, or recovering a failed Computer interaction.
---

# Computer Use MCP

Use the most efficient available interface for the task. Prefer a purpose-built tool, API, CLI, or MCP server when it can complete the work more directly or reliably. Use Computer only for auth-bound, desktop-only, or genuinely visual work, including UI verification after a deterministic change.

When Computer is the right interface, drive the UI with a **tight loop**: choose the right identity, snapshot once, chain only against fresh state, and verify the outcome.

## 1. Choose the identity

For Helium, resolve the browser profile before navigation:

- work account, company domain, or internal service → **work**
- personal account, finance, shopping, or personal service → **personal**
- ambiguous identity or mixed accounts → ask which profile

Target Helium as `net.imput.helium`. Inspect its profile control or **Profiles** menu and switch when needed. Confirm the selected profile from the profile control or signed-in account marker. Profile selection is complete only when the intended profile is visible.

For another app, use the name or bundle identifier already known from the current session. Call `computer_list_apps` only when the app identity is unknown or stale, then keep the returned identifier stable.

Pi exposes the server tools with the `computer_` prefix. Pass `mcp.args` as a serialized JSON object, as in the example below. List the `computer` server only when its tools are unavailable; describe only an unfamiliar tool, then reuse that schema for the session.

## 2. Start the turn with fresh state

Begin each assistant turn that interacts with an app by calling `computer_get_app_state`. Start with its defaults. The snapshot's element indices belong only to that state.

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"net.imput.helium\"}" })
```

Use the refreshed state returned by each action to choose the next action. Call `get_app_state` again only after navigation, reload, modal or window changes, a failed action, or evidence that the returned tree is incomplete.

Keep snapshots compact:

- raise `text_limit` only when truncated semantic text is required; prefer a bounded integer before `"max"`
- raise `max_tree_nodes` or `max_tree_depth` only when a visible long page, list, or table is missing from the tree after scrolling
- retain only the few element indices and state facts needed for the next chain

The state is fresh when it identifies the intended app/window/profile and exposes the next target or proves that the target is absent.

## 3. Act in short stable chains

Prefer semantic element actions over coordinates.

- **Click:** use `computer_click` with `element_index`; omit `click_method` so `auto` applies.
- **Fill:** when the element is marked settable, use `computer_set_value`. Otherwise click the editable element, confirm focus in the refreshed state, then use `computer_type_text` for literal text.
- **Keys:** use `computer_press_key` for named keys and combinations, not literal prose.
- **Coordinates:** use them only when the rendered tree has no target. Keep the default `auto` method unless a specific fallback is justified.

Chain multiple calls in one assistant turn only while every next target is present in the latest action result and the window has not changed. Stop the chain at navigation, submission, modal transitions, downloads/uploads, or uncertainty; inspect before continuing.

## 4. Recover by changing the precondition

One failed call ends that strategy:

- stale element or changed page → refresh state and choose a current index
- no focused editable element → click the field, inspect focus, then type; use `set_value` when the field is settable
- non-settable element → focus it and type rather than repeating `set_value`
- app or window not found → call `list_apps` once, adopt its canonical identifier, then refresh state
- unsupported key or click method → use a supported key name or return to `auto`
- tool/catalog or connection error → reconnect or reload once, then rediscover the server surface
- permission error → report the required OS permission and pause for the user

A retry is valid only when the state, target, arguments, or method changed.

## 5. Verify

Use the latest action result when it proves the requested outcome; otherwise refresh state once. Completion requires visible evidence of the outcome, not merely a successful tool response.

## Reference branches

Read [REFERENCE.md](REFERENCE.md) only when overriding snapshot budgets or selecting a non-default macOS click method.
