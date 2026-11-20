-- Every key binding that starts with the C-; prefix. Custom actions bound here
-- by name are defined in their own dmmulroy/*.lua files, which
-- dmmulroy/init.lua loads first.

-- -----------------------------------------------------------------------------
-- Prefix
-- -----------------------------------------------------------------------------

-- Rex has no prefix *mode*; a prefix is the first key of a sequence. While it
-- is pending the app shows a "⌃; Show Keys" pill (Workspace.showsKeySequenceHints
-- in ../macos-defaults.conf); clicking it lists the keys. Escape cancels.
local P = "ctrl+;>"

-- Press the prefix twice to send a literal ctrl+; to the terminal.
rex.bind(P .. "ctrl+;", "pane.send_key", { key = "ctrl+;" })

-- -----------------------------------------------------------------------------
-- App, sessions
-- -----------------------------------------------------------------------------

-- The palette lists every action and key.
rex.bind(P .. "shift+/", "client.palette.toggle")
rex.bind(P .. "shift+s", "client.settings")
rex.bind(P .. "r", "client.config.reload")

rex.bind(P .. "shift+n", "session.new")
rex.bind(P .. "shift+w", "session.rename")
rex.bind(P .. "shift+d", "session.close")

rex.bind(P .. "s", "session.switch")
rex.bind(P .. "w", "session.switch")
rex.bind(P .. "g", "session.switch")

rex.bind(P .. "shift+9", "session.previous")
rex.bind(P .. "shift+0", "session.next")

rex.bind(P .. "b", "client.sidebar.toggle")

-- Rex app windows just close; the server keeps running.
-- rex.bind(P .. "d", "client.window.close")

-- -----------------------------------------------------------------------------
-- Tabs (Rex CLI calls these "windows")
-- -----------------------------------------------------------------------------

rex.bind(P .. "c", "client.tab.new")
rex.bind(P .. ",", "client.tab.rename")

rex.bind(P .. "p", "client.tab.previous")
rex.bind(P .. "n", "client.tab.next")

for i = 1, 9 do
	rex.bind(P .. i, "client.tab.goto", { index = i })
end

rex.bind(P .. "shift+x", "client.tab.close")

-- rex.bind(P .. "shift+,", "client.tab.move.backward")
-- rex.bind(P .. "shift+.", "client.tab.move.forward")

-- -----------------------------------------------------------------------------
-- Panes (Rex: blocks)
-- -----------------------------------------------------------------------------

rex.bind(P .. "/", "pane.split", { direction = "right" })
rex.bind(P .. "enter", "pane.split", { direction = "down" })

-- Closes the tab along with its last pane; see dmmulroy/close_pane_or_tab.lua.
rex.bind(P .. "x", "close_pane_or_tab")

rex.bind(P .. "m", "pane.zoom")

-- shift+h/j/k/l moves the pane next to its neighbour, which acts as a swap for
-- two-pane rows/columns.
for key, direction in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
	rex.bind(P .. key, "pane.focus", { direction = direction })
	rex.bind(P .. "shift+" .. key, "pane.move", { direction = direction })
end

rex.bind(P .. "tab", "pane.focus_next")
rex.bind(P .. "shift+tab", "pane.focus_previous")

-- Rex has no keyboard copy mode; find is the closest thing for locating text
-- in scrollback.
rex.bind(P .. "v", "client.find.open")

-- rex.bind(P .. "shift+p", "pane.copy_id")

-- The mode lives in dmmulroy/resize_mode.lua.
rex.bind(P .. "shift+r", "client.mode.enter", { name = "resize" })
