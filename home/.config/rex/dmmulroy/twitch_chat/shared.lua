-- Shared by init.lua (config action, required as "dmmulroy.twitch_chat.shared")
-- and follow.lua (`rex do` script, required as "shared").

local M = {}

local home = os.getenv("HOME")

M.TWITCH_CHAT_LABEL = "twitch-chat"
M.FOLLOW_SCRIPT = home .. "/.config/rex/dmmulroy/twitch_chat/follow.lua"

-- What runs in each chat pane:
--   "lua"  the native Lua client, twitch-lua; it looks like twt
--   "twt"  twitch-tui from github.com/dmmulroy/twitch-tui-fork (~/.cargo/bin/twt)
-- "lua" falls back to "twt" when twitch-lua or its token file is missing.
M.TWITCH_CHAT_BACKEND = "lua"

-- Where twitch-lua comes from:
--   the rock: `dot` installs twitch-lua (and distilled-lua's rocks) with LuaRocks into
--     REX_LUA_ROCKS_TREE (Lua 5.1, Rex's version);
--   a checkout: set TWITCH_LUA_DIR (in Rex's environment) to work on twitch-lua itself.
--     Its lua/ holds the modules and vendor/ the distilled-lua copies.
M.REX_LUA_ROCKS_TREE = os.getenv("REX_LUA_ROCKS_TREE") or (home .. "/.local/share/rex/rocks")
M.TWITCH_LUA_DIR = os.getenv("TWITCH_LUA_DIR")
if M.TWITCH_LUA_DIR and M.TWITCH_LUA_DIR ~= "" then
	M.TWITCH_LUA_MODULE_ROOT = M.TWITCH_LUA_DIR .. "/lua"
	M.TWITCH_LUA_PACKAGE_PATH = M.TWITCH_LUA_MODULE_ROOT .. "/?.lua;"
		.. M.TWITCH_LUA_MODULE_ROOT .. "/?/init.lua;"
		.. M.TWITCH_LUA_DIR .. "/vendor/?.lua;"
		.. M.TWITCH_LUA_DIR .. "/vendor/?/init.lua"
else
	M.TWITCH_LUA_MODULE_ROOT = M.REX_LUA_ROCKS_TREE .. "/share/lua/5.1"
	M.TWITCH_LUA_PACKAGE_PATH = M.TWITCH_LUA_MODULE_ROOT .. "/?.lua;" .. M.TWITCH_LUA_MODULE_ROOT .. "/?/init.lua"
end
-- The pane's `rex do` script; it finds its modules (and starts the connection) from its own path.
M.TWITCH_LUA_PANE_SCRIPT = M.TWITCH_LUA_MODULE_ROOT .. "/twitch/rex/scripts/chat_pane.lua"
M.TWITCH_LUA_TOKEN_FILE = (os.getenv("XDG_CONFIG_HOME") or (home .. "/.config")) .. "/twitch-lua/token"

local function file_exists(path)
	local f = io.open(path, "r")
	if f then
		f:close()
		return true
	end
	return false
end

-- True when twitch-lua is installed (or TWITCH_LUA_DIR is a checkout).
function M.twitch_lua_installed()
	return file_exists(M.TWITCH_LUA_PANE_SCRIPT)
end

-- Puts twitch-lua's modules on package.path once, after what is already there.
function M.add_twitch_lua_to_package_path()
	if not string.find(package.path, M.TWITCH_LUA_PACKAGE_PATH, 1, true) then
		package.path = package.path .. ";" .. M.TWITCH_LUA_PACKAGE_PATH
	end
end

-- "lua" or "twt": the backend that can actually run right now.
function M.twitch_chat_backend()
	if
		M.TWITCH_CHAT_BACKEND == "lua"
		and file_exists(M.TWITCH_LUA_PANE_SCRIPT)
		and file_exists(M.TWITCH_LUA_TOKEN_FILE)
	then
		return "lua"
	end
	return "twt"
end

local TERMINAL = "com.superlogical.terminal"

-- Actions run in the server's environment, which may not have rex on PATH.
function M.rex_cli_path()
	local bin_dir = os.getenv("REX_BIN_DIR")
	if bin_dir and bin_dir ~= "" then
		return bin_dir .. "/rex"
	end
	return home
		.. "/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex"
end

function M.find_twitch_chat_blocks(session_id)
	local found = {}
	local result = rex.session.list_blocks({ session_id = session_id })
	for _, block in ipairs((result and result.blocks) or {}) do
		if block.label == M.TWITCH_CHAT_LABEL then
			table.insert(found, block)
		end
	end
	return found
end

-- Ends twt the same way pressing q does, so the follower sees child_exited.
function M.quit_twt(session_id, block_id)
	local process, err = rex.block.call(TERMINAL, "process", { session_id = session_id, block_id = block_id })
	local pid = process and process.child and process.child.pid
	if not pid then
		return nil, "no twt process: " .. tostring(err)
	end
	local result = rex.exec({ "/bin/kill", tostring(pid) })
	if not result.ok then
		return nil, "kill failed: " .. tostring(result.stderr)
	end
	return true
end

return M
