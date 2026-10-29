-- Shared by twitch_chat.lua (config action) and twitch_chat_follow.lua (script).

local M = {}

local home = os.getenv("HOME")

M.TWITCH_CHAT_LABEL = "twitch-chat"
M.FOLLOW_SCRIPT = home .. "/.config/rex/twitch_chat_follow.lua"

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
