-- Every key binding that starts with the C-; prefix, ported from
-- ~/.config/herdr/config.toml. Custom actions bound here by name are defined
-- in their own dmmulroy/*.lua files, which dmmulroy/init.lua loads first.

-- -----------------------------------------------------------------------------
-- Prefix (herdr: [keys] prefix = "ctrl+semicolon")
-- -----------------------------------------------------------------------------

-- Rex has no prefix *mode*; a prefix is the first key of a sequence. There is
-- no on-screen indicator while it is pending. Escape cancels.
local P = "ctrl+;>"

-- Press the prefix twice to send a literal ctrl+; to the terminal.
rex.bind(P .. "ctrl+;", "pane.send_key", { key = "ctrl+;" })

-- -----------------------------------------------------------------------------
-- App, sessions (herdr: workspaces)
-- -----------------------------------------------------------------------------

-- herdr help = "prefix+?" (default). The palette lists every action and key.
rex.bind(P .. "shift+/", "client.palette.toggle")

-- herdr settings = "prefix+shift+s"
rex.bind(P .. "shift+s", "client.settings")

-- herdr reload_config = "prefix+r"
rex.bind(P .. "r", "client.config.reload")

-- herdr new_workspace = "prefix+shift+n" (default)
rex.bind(P .. "shift+n", "session.new")

-- herdr rename_workspace = "prefix+shift+w" (default)
rex.bind(P .. "shift+w", "session.rename")

-- herdr close_workspace = "prefix+shift+d" (default)
rex.bind(P .. "shift+d", "session.close")

-- herdr workspace_picker = ["prefix+s", "prefix+w"], goto = "prefix+g" (default)
rex.bind(P .. "s", "session.switch")
rex.bind(P .. "w", "session.switch")
rex.bind(P .. "g", "session.switch")

-- herdr previous_workspace = "prefix+(", next_workspace = "prefix+)"
rex.bind(P .. "shift+9", "session.previous")
rex.bind(P .. "shift+0", "session.next")

-- herdr toggle_sidebar = "prefix+b" (default)
rex.bind(P .. "b", "client.sidebar.toggle")

-- Not ported from herdr: detach (Rex app windows just close; the server keeps
-- running), open_notification_target, focus_agent, new/open/remove_worktree,
-- switch_workspace, previous/next_agent, last_pane.
-- rex.bind(P .. "d", "client.window.close")

-- -----------------------------------------------------------------------------
-- Tabs (herdr: tabs; Rex CLI calls these "windows")
-- -----------------------------------------------------------------------------

-- herdr new_tab = "prefix+c" (default)
rex.bind(P .. "c", "client.tab.new")

-- herdr rename_tab = "prefix+comma"
rex.bind(P .. ",", "client.tab.rename")

-- herdr previous_tab = "prefix+p", next_tab = "prefix+n" (defaults)
rex.bind(P .. "p", "client.tab.previous")
rex.bind(P .. "n", "client.tab.next")

-- herdr switch_tab = "prefix+1..9" (default)
for i = 1, 9 do
	rex.bind(P .. i, "client.tab.goto", { index = i })
end

-- herdr close_tab = "prefix+shift+x" (default)
rex.bind(P .. "shift+x", "client.tab.close")

-- herdr move_tab_previous / move_tab_next were unset; Rex equivalents:
-- rex.bind(P .. "shift+,", "client.tab.move.backward")
-- rex.bind(P .. "shift+.", "client.tab.move.forward")

-- -----------------------------------------------------------------------------
-- Panes (Rex: blocks)
-- -----------------------------------------------------------------------------

-- herdr split_vertical = "prefix+backslash" (split right)
rex.bind(P .. "\\", "pane.split", { direction = "right" })

-- herdr split_horizontal = "prefix+enter" (split down)
rex.bind(P .. "enter", "pane.split", { direction = "down" })

-- herdr close_pane = "prefix+x" (default). herdr closes the tab along with its
-- last pane; see dmmulroy/close_pane_or_tab.lua.
rex.bind(P .. "x", "close_pane_or_tab")

-- herdr zoom = "prefix+m"
rex.bind(P .. "m", "pane.zoom")

-- herdr focus_pane_* = "prefix+h/j/k/l" (defaults)
-- herdr swap_pane_* = "prefix+shift+h/j/k/l" (defaults); Rex moves the pane
-- next to its neighbour, which matches swap for two-pane rows/columns.
for key, direction in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
	rex.bind(P .. key, "pane.focus", { direction = direction })
	rex.bind(P .. "shift+" .. key, "pane.move", { direction = direction })
end

-- herdr cycle_pane_next = "prefix+tab", cycle_pane_previous = "prefix+shift+tab"
rex.bind(P .. "tab", "pane.focus_next")
rex.bind(P .. "shift+tab", "pane.focus_previous")

-- herdr copy_mode = "prefix+v". Rex has no keyboard copy mode; find is the
-- closest thing for locating text in scrollback.
rex.bind(P .. "v", "client.find.open")

-- Not ported from herdr: rename_pane, edit_scrollback.
-- rex.bind(P .. "shift+p", "pane.copy_id")

-- herdr resize_mode = "prefix+shift+r"; the mode lives in dmmulroy/resize_mode.lua.
rex.bind(P .. "shift+r", "client.mode.enter", { name = "resize" })
