-- The sidecar file the pi extension (home/.pi/agent/extensions/rex-transfer.ts)
-- writes for each Rex pane running pi: which session is in the pane.
-- A leaf module with no requires, so both the config action
-- (require "dmmulroy.transfer_pi_session.pi_sidecar") and the `rex do` worker
-- (require "pi_sidecar") can load it. Keep PI_SIDECAR_DIR in sync with the extension.

local M = {}

local function state_home()
	local xdg = os.getenv("XDG_STATE_HOME")
	if xdg and xdg ~= "" then
		return xdg
	end
	return os.getenv("HOME") .. "/.local/state"
end

M.PI_SIDECAR_DIR = state_home() .. "/pi-rex/blocks"

---@param block_id string  "block:<uuid>"
---@return string
function M.sidecar_path(block_id)
	return M.PI_SIDECAR_DIR .. "/" .. block_id:gsub("^block:", "") .. ".json"
end

---@param block_id string
---@return table? sidecar  { agent, session_id, session_file, cwd, pid, rex_block, rex_session }
---@return string? err
function M.read_sidecar(block_id)
	local path = M.sidecar_path(block_id)
	local file = io.open(path, "r")
	if not file then
		return nil, "no pi sidecar at " .. path
	end
	local text = file:read("*a")
	file:close()
	local data, err = rex.json.decode(text)
	if type(data) ~= "table" then
		return nil, "unreadable pi sidecar " .. path .. ": " .. tostring(err)
	end
	return data
end

return M
