-- Twitch chat (twt) column in every tab of every session.

local shared = require("twitch_chat_shared")

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
