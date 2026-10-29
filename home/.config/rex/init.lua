-- Rex configuration
-- Managed in ~/.dotfiles and stowed to ~/.config/rex/init.lua.
-- Full reference: https://www.superlogical.com/rex/docs/reference/lua
--
-- Ported from ~/.config/herdr/config.toml. Active lines are this setup; every
-- other Rex option is left commented so this file also serves as a complete
-- configuration reference.
--
-- Rex does not watch this file. After editing, run:
--   rex config check    # load the file and report mistakes, changing nothing
--   rex config reload   # make the running server read it again
--   rex keymap          # show the merged keymap the server resolved
-- `dot update` runs check + reload after re-stowing.

-- -----------------------------------------------------------------------------
-- File location and loading
-- -----------------------------------------------------------------------------

-- The server reads $REX_CONFIG when set, else $XDG_CONFIG_HOME/rex/init.lua,
-- else ~/.config/rex/init.lua. REX_CONFIG must be set in the *server's*
-- environment, not the shell's.
--
-- Lua 5.1 with the full standard library, except io.popen and os.execute
-- (use rex.exec instead). Rex only adds the global `rex` table.
--
-- `require` loads Lua files stored beside this one, e.g. ~/.config/rex/keys.lua:
-- require("keys")
--
-- A bad call to a rex function is skipped and the rest of the file still loads.
-- A Lua syntax error fails the whole load; a failed reload keeps the last good
-- bindings and actions.
--
-- API availability (see the reference's "Where Each Function Works" table):
--   at load:  rex.bind/unbind/mode/bindings/modes/action/host, rex.exec,
--             rex.layout.*, rex.json.*, rex.log
--   later (inside actions / bound functions): rex.session.*, rex.call,
--             rex.block.call, rex.invoke, rex.client.queue (actions only)
--   scripts only (`rex do`): rex.on, rex.wait, rex.sleep, rex.stop,
--             rex.after, rex.every, rex.args, rex.session_id, rex.block_id

-- -----------------------------------------------------------------------------
-- Key syntax
-- -----------------------------------------------------------------------------

-- A key is zero or more modifiers plus one key joined by `+`. Case and modifier
-- order don't matter.
--   cmd   (also command, super, meta, win)
--   ctrl  (also control)
--   alt   (also opt, option)
--   shift
-- Named keys: enter, escape, tab, space, backspace, delete, left, right, up,
-- down, home, end, pageup, pagedown, f1..f12. Anything else is a character.
--
-- Write keys WITHOUT shift applied: `(` is "shift+9", `?` is "shift+/",
-- `+` is "shift+=". Keys follow the keyboard layout; write a W3C
-- KeyboardEvent.code in brackets for a physical key, e.g. "ctrl+[KeyA]".
--
-- Sequences join keys with `>`: "ctrl+b>c". Escape cancels a sequence. A key
-- either runs an action or starts a sequence, never both; the newer binding wins.
--
-- Modes prefix a key with "mode/": "resize/left".
--
-- Priority, lowest to highest: client defaults < this file < shortcuts set in
-- the app (Change Shortcut…). An app shortcut silently beats this file.

-- -----------------------------------------------------------------------------
-- Binding API
-- -----------------------------------------------------------------------------

-- Bind a key to an action, with optional arguments:
-- rex.bind("cmd+d", "pane.split", { direction = "right" })
--
-- Bind a key to a Lua function. Return true when handled; false/nil falls
-- through to the next-newest function on the key, then to the terminal.
-- Not allowed inside a mode. ev.keybinding is the key; ev.prefix lists the
-- earlier keys of a sequence.
-- rex.bind("ctrl+shift+n", function(ctx, ev) return true end)
--
-- Remove every binding for a key (here and in client defaults):
-- rex.unbind("cmd+d")
-- Remove the key only where it's bound to one action:
-- rex.unbind("cmd+t", "client.tab.new")
-- Remove a key in a mode AND block it there:
-- rex.unbind("resize/left")
-- Remove a whole mode, its bindings, blocked keys, and options:
-- rex.unbind{ mode = "resize" }
-- Remove one exact binding returned by rex.bindings():
-- rex.unbind(binding)
-- Unbinding a key never removes the sequences that start with it.
--
-- Inspect what this file (and its requires) has bound so far:
-- rex.bindings()                              -- every binding, in order
-- rex.bindings{ key = "ctrl+b", mode = nil, action = "pane.split" }
--   each: { key, mode, action, fn, args, source }
-- rex.modes()                                 -- each: { name, exclusive, source }

-- -----------------------------------------------------------------------------
-- Bindable client actions (Rex for Mac)
-- -----------------------------------------------------------------------------

-- List them live with: rex client ls && rex -C <label> actions
-- `?` marks an optional argument.
--
-- App:        client.palette.toggle, client.settings, client.config.reload,
--             client.config.copy_path, client.close, client.diagnostics,
--             client.onboarding, client.permissions, client.version.copy,
--             client.debug.copy, client.pair_device, client.update.accept,
--             client.notice.dismiss, client.shortcuts.edit,
--             client.agents.setup, client.server.restart
-- Windows:    client.window.new, client.window.close,
--             client.window.fullscreen.toggle
-- Sessions:   session.new, session.switch, session.select{session_id, window_id?},
--             session.next, session.previous, session.rename, session.close,
--             session.refresh, session.open_on_web
-- Hosts:      client.host.switch, client.host.add, client.host.remove
-- Tabs:       client.tab.new, client.tab.close, client.tab.rename,
--             client.tab.next, client.tab.previous, client.tab.goto{index},
--             client.tab.move{direction}, client.tab.move.backward,
--             client.tab.move.forward, client.tab.move_to_new_window
-- Panes:      pane.split{direction}, pane.split.left/right/up/down/auto,
--             pane.focus{direction, wrap?}, pane.focus.left/right/up/down,
--             pane.focus_next, pane.focus_previous,
--             pane.move{direction}, pane.move.left/right/up/down,
--             pane.zoom, pane.close, pane.balance,
--             pane.resize{direction, amount?}, pane.move_to_new_tab,
--             pane.move_to_tab, pane.go_to_directory, pane.insert_path,
--             pane.copy_id, pane.send_key{key}
-- Keys/modes: client.key.forward, client.mode.enter{name, once?},
--             client.mode.exit, client.mode.exit_all
-- Prompts:    client.prompt.previous, client.prompt.next
-- Find:       client.find.open, client.find.next, client.find.previous
-- Appearance: client.font.increase, client.font.decrease, client.font.reset,
--             client.sidebar.toggle, client.sidebar.activity.toggle,
--             client.tab_style.toggle, client.theme.change{name?},
--             client.theme.import{path}, client.appearance.switch_mode{mode}
--
-- Block actions (server-side, run with `rex do` or bind by name):
--             com.superlogical.terminal.clear, com.superlogical.terminal.reset

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

-- herdr close_pane = "prefix+x" (default)
rex.bind(P .. "x", "pane.close")

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

-- -----------------------------------------------------------------------------
-- Resize mode (herdr: resize_mode = "prefix+shift+r")
-- -----------------------------------------------------------------------------

-- rex.mode(name, { exclusive = bool }) declares options; a mode also exists as
-- soon as a key is bound in it. Exclusive modes ignore unbound keys instead of
-- passing them to the terminal. Escape leaves a mode unless the mode rebinds it.
-- Enter with { name = "resize", once = true } to leave after one shortcut.
rex.mode("resize", { exclusive = true })
rex.bind(P .. "shift+r", "client.mode.enter", { name = "resize" })

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

-- -----------------------------------------------------------------------------
-- Vim-aware navigation (herdr: vim-herdr-navigation plugin on ctrl+h/j/k/l)
-- -----------------------------------------------------------------------------

-- Neovim side: smart-splits.nvim with smart-splits-backend-rex
-- (home/.config/nvim/lua/plugins/smart-splits.lua). When Neovim is in the
-- foreground the key falls through to it; at its edge window, the backend asks
-- Rex to focus the neighbouring pane. In other panes Rex moves focus, and at
-- the outer edge the key falls through so shell ctrl+l (clear) still works.
local terminal = "com.superlogical.terminal"
local vim_names = { vi = true, vim = true, nvim = true, view = true, vimdiff = true, nvimdiff = true }

local function foreground_is_vim(ctx)
	local proc = rex.block.call(terminal, "process", { block_id = ctx.block_id })
	local fg = proc and proc.foreground
	if not fg then
		return false
	end
	-- `name` is not always the executable name, so check argv0 too.
	for _, s in ipairs({ fg.name or "", (fg.argv0 or ""):match("[^/]*$") or "" }) do
		if vim_names[s:lower()] then
			return true
		end
	end
	return false
end

for key, direction in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
	rex.bind("ctrl+" .. key, function(ctx)
		if foreground_is_vim(ctx) then
			return false
		end
		local before = rex.session.view({})
		local after = rex.session.focus_direction({ direction = direction })
		-- Focus didn't move (outer edge): let the terminal have the key.
		return before ~= nil and after ~= nil and after.revision ~= before.revision
	end)
end

-- -----------------------------------------------------------------------------
-- Theme (herdr: [theme] catppuccin + custom tokens)
-- -----------------------------------------------------------------------------

-- Themes, fonts, tab style, and sidebar are app settings, not config options.
-- This action imports the tracked Catppuccin Macchiato theme into the app.
rex.action({
	name = "import_catppuccin_macchiato",
	title = "Import Catppuccin Macchiato Theme",
	category = "Appearance",
	keywords = "theme catppuccin macchiato dotfiles",
	run = function()
		local home = os.getenv("HOME")
		rex.client.queue("client.theme.import", {
			path = home .. "/.config/rex/themes/catppuccin-macchiato",
		})
	end,
})

-- Twitch chat: palette action "Twitch Chat: Toggle" (no keybinding).
-- twt pane that follows the active tab; see twitch_chat.lua.
require("twitch_chat")

-- -----------------------------------------------------------------------------
-- Custom actions reference
-- -----------------------------------------------------------------------------

-- rex.action{
--   name        = "scratch",         -- required; lowercase, digits, underscores, no dot
--   title       = "Open Scratch",    -- required; shown in the command palette
--   run         = function(ctx, args) end, -- required
--   description = "Longer palette explanation",
--   category    = "Actions",         -- palette group; default "Actions"
--   keywords    = "extra search words",
--   args        = { file = "string", ratio = "number?" },
--                 -- string, number, integer, boolean, object, array, any;
--                 -- trailing ? = optional; or a JSON Schema table with `type`
--   repeats     = false,             -- re-run while the key is held
-- }
--
-- ctx: session_id, block_id, client_id, origin (key, palette, cli, api,
-- script), server. A field Rex doesn't know is absent. Whatever run returns is
-- the action's result; error("msg", 0) fails it. Actions get 30 seconds.
--
-- Inside run:
--   rex.invoke("other_action", { ... })         -- this file's actions; 16 deep
--   rex.client.queue("pane.zoom", { ... })     -- client action, after run returns
--   rex.exec({ "git", "pull" }, { cwd, env, clear_env, stdin, timeout,
--             stdout = false, stderr = false, text })
--     -> { code, signal, stdout, stderr, timed_out, ok }
--   rex.exec.start(argv, { ..., stdin = true, stdout = fn, stderr = fn, detach = true })
--     -> handle: h:wait(s), h:write(d), h:close_stdin(), h:kill(sig), h:running(), h.pid
--
-- Run an action: a key, the palette, or `rex do NAME key=value`.
-- Try one without reloading: rex do ~/.config/rex/init.lua --action NAME

-- -----------------------------------------------------------------------------
-- Calling Rex (inside actions, bound functions, and scripts)
-- -----------------------------------------------------------------------------

-- Every call returns a result table, or nil and an error message.
--
-- rex.session.<method>{ ... }  -- session_id defaults to the current session
--   view, list_blocks, list_clients, describe_block, new_window, new_split,
--   new_block, new_layer, close_window, close_layer, move_block, swap_blocks,
--   detach_block, float_block, zoom_block, resize_pane, resize_layer,
--   raise_layer, lower_layer, move_window, focus_block, focus_window,
--   focus_direction, focus_next_pane, focus_previous_pane, focus_next_window,
--   focus_previous_window, set_label, set_window_label, set_block_label,
--   attach, detach, help
--   Arguments: `rex api describe session.<method>`
--
-- rex.call("session.list")     -- any server method; `rex api list`
--
-- rex.block.call("com.superlogical.terminal", method, { block_id = ... })
--   format, process, pwd, title, size, write, reset, resize, set_theme,
--   program_status, list_dir
--
-- rex.layout.block{ flavor = "com.superlogical.terminal.shell", options = {
--   command = { "htop" },          -- program + args; default interactive shell
--   shell = "none",                -- run command directly
--   cwd = "/path",
--   initial_input = "ls\n",
--   exit = { on_completion = false }, -- keep open after exit
-- } }
-- rex.layout.horizontal(0.5, a, b)  -- side by side; ratio is a's share
-- rex.layout.vertical(0.5, a, b)    -- stacked
--
-- rex.json.encode(value, { indent = true }), rex.json.decode(text)
-- rex.log("info", "message")        -- debug, info, warn, error
-- rex.servers(), rex.server("label").session/block/call

-- -----------------------------------------------------------------------------
-- Hosts (herdr: [remote])
-- -----------------------------------------------------------------------------

-- Other Rex servers you connect to. Config file only.
-- rex.host{
--   label     = "devbox",                  -- required
--   endpoints = { "tcp://devbox:7400" },   -- required; tried in order
--   -- endpoint = "tcp://devbox:7400",    -- single address instead
--   id        = "devbox",                  -- stable identity across renames
--   icon      = "server",                  -- icon name clients may show
-- }

-- -----------------------------------------------------------------------------
-- Events (scripts only, not this file)
-- -----------------------------------------------------------------------------

-- rex.on works only in `rex do` scripts. Example: rex do notify.lua --all
-- rex.on("terminal.bell", function(ctx, ev) end)
-- Session events: window_created, window_closed, window_label_changed,
--   active_window_changed, block_created, block_closed, session_label_changed,
--   session_view_changed, client_connected, client_disconnected,
--   client_connection_changed, creator_changed
-- Terminal events: terminal.child_exited, terminal.pwd_changed,
--   terminal.title_changed, terminal.bell, terminal.process_changed,
--   terminal.desktop_notification, terminal.progress_report,
--   terminal.clipboard_written, terminal.program_status_changed,
--   terminal.program_status_removed
-- Server events (--all): session_created, session_destroyed, client_joined,
--   client_left, client_changed, keymap_changed

-- -----------------------------------------------------------------------------
-- App-only settings (Rex Settings window, not configurable here)
-- -----------------------------------------------------------------------------

-- Stored in the com.superlogical.rex macOS defaults. Tracked in
-- ~/.config/rex/macos-defaults.conf (fonts, Option key, padding, tabs,
-- sidebar, Remote Control); `dot update` writes them with `defaults write`
-- and imports the theme via import_catppuccin_macchiato when missing.
-- Rex reads them at launch, so relaunch the app after changing that file.
--
-- Fixed by Rex, no setting: ~64 MiB scrollback per terminal; new terminals use
-- the login shell (fish).
