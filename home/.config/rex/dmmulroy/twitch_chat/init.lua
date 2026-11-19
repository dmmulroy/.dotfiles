-- Twitch chat (twt) column in every tab of every session.

local shared = require("dmmulroy.twitch_chat.shared")

local function run_follow_script(mode)
	local argv = { shared.rex_cli_path(), "do", "--all", shared.FOLLOW_SCRIPT }
	if mode then
		table.insert(argv, "mode=" .. mode)
	end
	local handle, err = rex.exec.start(argv, { detach = true, stdout = false, stderr = false })
	if not handle then
		error("twitch chat: can't run " .. shared.FOLLOW_SCRIPT .. ": " .. tostring(err), 0)
	end
end

local function toggle_twitch_chat()
	if #shared.find_twitch_chat_blocks() > 0 then
		run_follow_script("off")
		return "off"
	end
	run_follow_script(nil)
	return "on"
end

rex.action({
	name = "twitch_chat_toggle",
	title = "Twitch Chat: Toggle",
	description = "Show twt in a column in every tab, or close it",
	category = "Twitch",
	keywords = "twitch chat twt stream follow",
	run = toggle_twitch_chat,
})

-- twitch-lua's own palette actions ("Twitch: Set Stream Title…"), loaded from its
-- checkout (the same TWITCH_LUA_DIR as shared.lua). Skipped when there is no checkout.
local twitch_lua_dir = os.getenv("TWITCH_LUA_DIR") or (os.getenv("HOME") .. "/Code/personal/twitch-lua")
local twitch_lua_actions = io.open(twitch_lua_dir .. "/lua/twitch/rex/palette_actions.lua", "r")
if twitch_lua_actions then
	twitch_lua_actions:close()
	package.path = package.path
		.. ";" .. twitch_lua_dir .. "/lua/?.lua"
		.. ";" .. twitch_lua_dir .. "/vendor/?.lua"
		.. ";" .. twitch_lua_dir .. "/vendor/?/init.lua"
	require("twitch.rex.palette_actions").register_twitch_palette_actions()
end
