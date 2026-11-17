-- Resize mode (herdr: resize_mode = "prefix+shift+r"). Entered with C-; R,
-- bound in dmmulroy/keymaps.lua.

-- rex.mode(name, { exclusive = bool }) declares options; a mode also exists as
-- soon as a key is bound in it. Exclusive modes ignore unbound keys instead of
-- passing them to the terminal. Escape leaves a mode unless the mode rebinds it.
-- Enter with { name = "resize", once = true } to leave after one shortcut.
rex.mode("resize", { exclusive = true })

for key, direction in pairs({
	h = "left",
	j = "down",
	k = "up",
	l = "right",
	left = "left",
	down = "down",
	up = "up",
	right = "right",
}) do
	rex.bind("resize/" .. key, "pane.resize", { direction = direction })
	rex.bind("resize/shift+" .. key, "pane.resize", { direction = direction, amount = 15 })
end
rex.bind("resize/=", "pane.balance")
rex.bind("resize/enter", "client.mode.exit")

-- herdr resize_pane_* without a mode were unset; direct equivalents:
-- rex.bind("ctrl+alt+left", "pane.resize", { direction = "left" })
