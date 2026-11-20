-- Run by twitch_chat/init.lua with `rex do --all`.
--   (no args)  keep a chat column in every tab of every session
--   mode=off   quit every chat pane; a running follower then closes the rest and exits
-- The chat program is shared.twitch_chat_backend(): the Lua client or twt. Either way one
-- process holds the only Twitch connection and the panes share it. "twt" in the names
-- below means the chat program of a pane, whichever it is.

-- `rex do` scripts resolve require() beside the script, so this is the sibling shared.lua.
local shared = require("shared")

local DEFAULT_TWITCH_CHAT_WIDTH = 0.2
local LOCK_FILE = (os.getenv("TMPDIR") or "/tmp/") .. "rex-twitch-chat-follow.lock"
local WIDTH_TOLERANCE = 0.005
-- twt's panic report (stderr) and our crash notes. A crashed pane closes
-- itself, so without this the reason is lost. `rex.log` goes nowhere here:
-- init.lua starts this script with stdout/stderr off.
local TWT_CRASH_LOG = (os.getenv("TMPDIR") or "/tmp/") .. "rex-twitch-chat-twt.log"
-- Twitch allows 3 chat (EventSub) connections per account, so panes don't each
-- connect. Every pane runs `twt --attach` on this socket; the first one starts
-- a `twt --serve` that holds the one connection and exits ~10s after the last
-- pane closes. Its stderr goes to TWITCH_CHAT_SOCKET .. ".log".
-- Needs twt from github.com/dmmulroy/twitch-tui-fork (main), installed to ~/.cargo/bin/twt.
local TWITCH_CHAT_SOCKET = (os.getenv("TMPDIR") or "/tmp/") .. "rex-twitch-chat.sock"

local twt = os.getenv("HOME") .. "/.cargo/bin/twt"
do
	local f = io.open(twt, "r")
	if f then
		f:close()
	else
		twt = "twt"
	end
end

-- The command of a chat pane. exec keeps the chat program as the pane's child, so
-- quit_twt's kill and the exit code in child_exited still see the program itself. Both
-- draw on stdout; only panics and errors go to stderr.
local function twitch_chat_pane_command()
	if shared.twitch_chat_backend() == "lua" then
		-- The Lua client: Ctrl-C quits (exit 0), which turns chat off everywhere like twt's q.
		-- It starts the one connection process itself, which exits after the last pane closes.
		return {
			"/bin/sh",
			"-c",
			'exec "$0" do "$1" tty="$(tty)" rex="$0" 2>>"$2"',
			shared.rex_cli_path(),
			shared.TWITCH_LUA_PANE_SCRIPT,
			TWT_CRASH_LOG,
		}
	end
	return {
		"/bin/sh",
		"-c",
		'RUST_BACKTRACE=1 exec "$0" --attach "$1" --first-state normal 2>>"$2"',
		twt,
		TWITCH_CHAT_SOCKET,
		TWT_CRASH_LOG,
	}
end

-- With --all the script hears every session, but calls into one need an attach.
local attached = {}
local function attach(session_id)
	if not attached[session_id] then
		local ok, err = rex.session.attach({ session_id = session_id })
		if not ok then
			rex.log("warn", "twitch chat: can't attach to " .. session_id .. ": " .. tostring(err))
		end
		attached[session_id] = ok ~= nil
	end
end

local function list_session_ids()
	local ids = {}
	local result = rex.call("session.list", {})
	for _, session in ipairs((result and result.sessions) or {}) do
		table.insert(ids, session.session_id)
	end
	return ids
end

if rex.args.mode == "off" then
	for _, session_id in ipairs(list_session_ids()) do
		attach(session_id)
		for _, chat in ipairs(shared.find_twitch_chat_blocks(session_id)) do
			local ok, err = shared.quit_twt(session_id, chat.block_id)
			if not ok then
				rex.log("warn", "twitch chat: " .. err .. "; closing the pane instead")
				rex.call("block.close", { session_id = session_id, block_id = chat.block_id })
			end
		end
	end
	rex.stop(0)
end

-- One follower at a time. shlock writes our pid and ignores a lock whose
-- process is gone.
local function acquire_lock()
	local pid = rex.exec({ "/bin/sh", "-c", "echo $PPID" }).stdout:match("%d+")
	return pid and rex.exec({ "/usr/bin/shlock", "-f", LOCK_FILE, "-p", pid }).ok
end

if not acquire_lock() then
	rex.log("info", "twitch chat: already running")
	rex.stop(0)
end

local chat_window = {} -- chat block_id -> window_id
local chat_session = {} -- chat block_id -> session_id
local closed_windows = {} -- window_id -> true once Rex reports it closed
local settling = {} -- window_id -> count of pending settle timers
local twitch_chat_width = DEFAULT_TWITCH_CHAT_WIDTH
local TERMINAL = "com.superlogical.terminal"
-- Rex only sizes terminals the app is showing, so a chat in a tab you haven't
-- opened starts at 80x24 and jumps to full height when you first look at it.
-- Every chat in the window has the same size, so copy the size the app gives
-- one of them to the chats it hasn't sized yet. Those are still owned by this
-- script, and an owner's resize applies at once.
local known_chat_size -- { columns, rows } from the app
local own_client_id -- this script's client, the owner of chats it created
local stopping = false
-- A twt that crashes is restarted in its own tab. More than MAX_TWT_CRASHES
-- in one tab within TWT_CRASH_WINDOW_SECONDS (e.g. a bad token) turns chat off.
local MAX_TWT_CRASHES = 3
local TWT_CRASH_WINDOW_SECONDS = 60
local twt_crash_times = {} -- window_id -> os.time() of recent crashes
local crashed_chats = {} -- chat block_id -> true while its replacement starts

local function session_exists(session_id)
	for _, id in ipairs(list_session_ids()) do
		if id == session_id then
			return true
		end
	end
	return false
end

local function view_of(session_id)
	attach(session_id)
	return rex.session.view({ session_id = session_id })
end

local function find_window(session_id, window_id)
	local view = view_of(session_id)
	for _, window in ipairs((view and view.windows) or {}) do
		if window.window_id == window_id then
			return window
		end
	end
end

local function tiled_layout(window)
	for _, layer in ipairs(window.layers or {}) do
		if layer.kind == "tiled" then
			return layer.layout
		end
	end
end

local function rightmost_block(node)
	if node.block_id then
		return node.block_id
	end
	return rightmost_block(node.split.after)
end

-- The window's chat block, and how many other blocks it holds.
local function window_contents(window)
	local chat_block_id, other_count = nil, 0
	for _, layer in ipairs(window.layers or {}) do
		for _, block in ipairs(layer.blocks or {}) do
			if crashed_chats[block.block_id] then
				-- Closing; not chat and not yours.
			elseif block.label == shared.TWITCH_CHAT_LABEL then
				chat_block_id = block.block_id
			else
				other_count = other_count + 1
			end
		end
	end
	return chat_block_id, other_count
end

-- The outer split when chat is the full-height column on the right.
local function twitch_chat_column(window, chat_block_id)
	local root = tiled_layout(window)
	if root and root.split and root.split.after.block_id == chat_block_id then
		return root.split
	end
end

local function set_twitch_chat_width(session_id, window, chat_block_id)
	local split = twitch_chat_column(window, chat_block_id)
	if not split or math.abs((1 - split.ratio) - twitch_chat_width) <= WIDTH_TOLERANCE then
		return
	end
	local ok, err = rex.session.resize_pane({
		session_id = session_id,
		before_block_id = rightmost_block(split.before),
		after_block_id = chat_block_id,
		direction = "horizontal",
		ratio = 1 - twitch_chat_width,
	})
	if not ok then
		rex.log("warn", "twitch chat: can't set width: " .. tostring(err))
	end
end

-- The app resets a new split to 50/50 right after it appears, and Rex's events
-- don't say who changed a layout. So for a moment after we set a width, a
-- change is undone; after that, it's yours and is kept.
local function settle_twitch_chat_width(session_id, window, chat_block_id)
	local window_id = window.window_id
	settling[window_id] = (settling[window_id] or 0) + 1
	set_twitch_chat_width(session_id, window, chat_block_id)
	rex.after(1, function()
		settling[window_id] = settling[window_id] - 1
	end)
end

-- Resizes a chat the app hasn't taken over yet. Returns false if it has.
local function resize_unseen_chat(session_id, chat_block_id)
	local size = rex.block.call(TERMINAL, "size", { session_id = session_id, block_id = chat_block_id })
	if not size or (size.owner and size.owner ~= own_client_id) then
		return false
	end
	if size.columns == known_chat_size.columns and size.rows == known_chat_size.rows then
		return true
	end
	local ok, err = rex.block.call(TERMINAL, "resize", {
		session_id = session_id,
		block_id = chat_block_id,
		columns = known_chat_size.columns,
		rows = known_chat_size.rows,
	})
	if not ok then
		rex.log("warn", "twitch chat: can't presize: " .. tostring(err))
	end
	return true
end

local function add_twitch_chat(session_id, window)
	local root = tiled_layout(window)
	if not root then
		return
	end
	local split, err = rex.session.new_split({
		session_id = session_id,
		anchor_id = (root.split and root.split.split_id) or root.block_id,
		direction = "horizontal",
		side = "after",
		ratio = 1 - twitch_chat_width,
		focus = false,
		layout = {
			block = {
				flavor = "com.superlogical.terminal.shell",
				label = shared.TWITCH_CHAT_LABEL,
				options = { command = twitch_chat_pane_command() },
			},
		},
	})
	if not split then
		rex.log("warn", "twitch chat: can't add to tab: " .. tostring(err))
		return
	end
	local chat_block_id = split.block_ids[1]
	chat_window[chat_block_id] = window.window_id
	chat_session[chat_block_id] = session_id
	if not own_client_id then
		local size = rex.block.call(TERMINAL, "size", { session_id = session_id, block_id = chat_block_id })
		own_client_id = size and size.owner
	end
	if known_chat_size then
		resize_unseen_chat(session_id, chat_block_id)
	end
	settle_twitch_chat_width(session_id, find_window(session_id, window.window_id) or window, chat_block_id)
end

-- You resized chat in one tab: use that width in every other tab.
local function apply_width_everywhere(except_window_id)
	for chat_block_id, window_id in pairs(chat_window) do
		if window_id ~= except_window_id then
			local session_id = chat_session[chat_block_id]
			local window = find_window(session_id, window_id)
			if window then
				settle_twitch_chat_width(session_id, window, chat_block_id)
			end
		end
	end
end

-- Bring a session in line: every tab has chat, a tab left with only chat
-- closes, and a width you dragged is kept.
local function sync_session(session_id)
	if stopping then
		return
	end
	local view = view_of(session_id)
	for _, window in ipairs((view and view.windows) or {}) do
		local chat_block_id, other_count = window_contents(window)
		if not chat_block_id then
			add_twitch_chat(session_id, window)
		elseif other_count == 0 then
			rex.session.close_window({ session_id = session_id, window_id = window.window_id })
		else
			chat_window[chat_block_id] = window.window_id
			chat_session[chat_block_id] = session_id
			if (settling[window.window_id] or 0) > 0 then
				set_twitch_chat_width(session_id, window, chat_block_id)
			else
				local split = twitch_chat_column(window, chat_block_id)
				if split and math.abs((1 - split.ratio) - twitch_chat_width) > WIDTH_TOLERANCE then
					twitch_chat_width = 1 - split.ratio
					apply_width_everywhere(window.window_id)
				end
			end
		end
	end
end

local function close_all_and_stop(reason)
	if stopping then
		return
	end
	stopping = true
	for chat_block_id, session_id in pairs(chat_session) do
		rex.call("block.close", { session_id = session_id, block_id = chat_block_id })
	end
	os.remove(LOCK_FILE)
	rex.stop(0)
end

for _, session_id in ipairs(list_session_ids()) do
	sync_session(session_id)
end

rex.on("session_view_changed", function(ctx, ev)
	sync_session(ev.session_id or ctx.session_id)
end)

rex.on("session_created", function(_, ev)
	if ev.session then
		sync_session(ev.session.session_id)
	end
end)

-- q exits 0; toggling off (shared.quit_twt) sends SIGTERM. Anything else,
-- like a panic (exit 101) or abort, is a crash.
local function is_twt_quit(payload)
	if payload.exit_code == 0 then
		return true
	end
	-- The Lua client is a `rex do` script, and rex exits with status 130 when it is sent
	-- SIGTERM or SIGINT (measured), where twt dies by the signal.
	if payload.exit_code == 130 and shared.twitch_chat_backend() == "lua" then
		return true
	end
	local err = tostring(payload.error or "")
	return err == "signal: terminated" or err == "signal: interrupt" or err == "signal: hangup"
end

local function too_many_twt_crashes(window_id)
	local now = os.time()
	local recent = {}
	for _, t in ipairs(twt_crash_times[window_id] or {}) do
		if now - t < TWT_CRASH_WINDOW_SECONDS then
			table.insert(recent, t)
		end
	end
	table.insert(recent, now)
	twt_crash_times[window_id] = recent
	return #recent > MAX_TWT_CRASHES
end

-- Replace a crashed twt in its own tab instead of closing chat everywhere.
local function restart_crashed_twt(chat_block_id, payload)
	local window_id = chat_window[chat_block_id]
	local session_id = chat_session[chat_block_id]
	local how = tostring(payload.error or ("exit code " .. tostring(payload.exit_code)))
	local log = io.open(TWT_CRASH_LOG, "a")
	if log then
		log:write(os.date("%Y-%m-%d %H:%M:%S"), " twt crashed in ", tostring(chat_block_id), ": ", how, "\n")
		log:close()
	end
	if too_many_twt_crashes(window_id) then
		rex.log("warn", "twitch chat: twt keeps crashing (" .. how .. "); turning chat off")
		close_all_and_stop("twt crash loop " .. chat_block_id)
		return
	end
	rex.log("warn", "twitch chat: twt crashed (" .. how .. "); restarting it in that tab")
	chat_window[chat_block_id] = nil
	chat_session[chat_block_id] = nil
	crashed_chats[chat_block_id] = true
	rex.call("block.close", { session_id = session_id, block_id = chat_block_id })
	sync_session(session_id)
end

rex.on("session_destroyed", function(_, ev)
	for chat_block_id, session_id in pairs(chat_session) do
		if session_id == ev.session_id then
			chat_window[chat_block_id] = nil
			chat_session[chat_block_id] = nil
		end
	end
	attached[ev.session_id] = nil
end)

rex.on("terminal.size_changed", function(ctx, ev)
	local block_id = ev.block_id or ctx.block_id
	local payload = ev.payload or ev
	if stopping or not chat_window[block_id] or not payload.owner or payload.owner == own_client_id then
		return
	end
	known_chat_size = { columns = payload.columns, rows = payload.rows }
	for chat_block_id, session_id in pairs(chat_session) do
		if chat_block_id ~= block_id then
			resize_unseen_chat(session_id, chat_block_id)
		end
	end
end)

rex.on("terminal.child_exited", function(ctx, ev)
	local chat_block_id = ev.block_id or ctx.block_id
	if stopping or not chat_window[chat_block_id] then
		return
	end
	local payload = ev.payload or ev
	if is_twt_quit(payload) then
		-- twt quit (q, or toggle off): chat is off everywhere.
		close_all_and_stop("child_exited " .. tostring(chat_block_id))
	else
		restart_crashed_twt(chat_block_id, payload)
	end
end)

-- Rex reports window_closed before the blocks in it close.
rex.on("window_closed", function(_, ev)
	closed_windows[ev.window_id] = true
end)

-- Closed with its tab: nothing to do. Closed on its own (e.g. closing the
-- pane): chat is off everywhere.
rex.on("block_closed", function(_, ev)
	if crashed_chats[ev.block_id] then
		crashed_chats[ev.block_id] = nil
		return
	end
	local window_id = chat_window[ev.block_id]
	local session_id = chat_session[ev.block_id]
	if stopping or not window_id then
		return
	end
	chat_window[ev.block_id] = nil
	chat_session[ev.block_id] = nil
	if closed_windows[window_id] then
		closed_windows[window_id] = nil
	elseif session_exists(session_id) then
		close_all_and_stop("block_closed " .. tostring(ev.block_id))
	end
end)
