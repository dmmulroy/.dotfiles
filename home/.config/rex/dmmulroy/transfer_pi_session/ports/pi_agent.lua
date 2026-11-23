-- Agent port for pi: everything this extension assumes about pi. Its session file
-- format, its command line, its program status reports, and the sidecar its
-- extension writes. When pi changes one of these, the fix belongs here.
-- Checked against pi 1.6.0 (docs: session-format.md, sessions.md, terminal-setup.md).

local shell = require("shell")
local pi_sidecar = require("pi_sidecar")

local M = {}

M.AGENT_NAME = "pi"
-- The session file header version this code understands (session-format.md).
M.SUPPORTED_SESSION_VERSION = 3
-- Read by rex-transfer.ts on the target, which shows it to the resumed agent.
M.TRANSFER_NOTE_ENV = "PI_REX_TRANSFER_NOTE"

-- OSC 7501 states in which pi is at rest and its session file is complete.
local AT_REST_STATES = { idle = true, done = true, error = true }

---The pi session running in a Rex pane, from its sidecar.
---@param block_id string
---@return AgentSession? session
---@return string? err
function M.locate_session(block_id)
	local sidecar, err = pi_sidecar.read_sidecar(block_id)
	if not sidecar then
		return nil, err .. ". Is pi running in this pane with the rex-transfer extension loaded? Run /reload in pi."
	end
	if type(sidecar.session_file) ~= "string" or sidecar.session_file == "" then
		return nil, "this pi session is ephemeral (--no-session), so there is nothing to transfer"
	end
	return {
		agent = M.AGENT_NAME,
		id = sidecar.session_id,
		file = sidecar.session_file,
		cwd = sidecar.cwd,
		block_id = block_id,
		rex_session_id = sidecar.rex_session,
		pid = sidecar.pid,
	}
end

---The header (first line) of a session file.
---@param file string
---@return { id: string, cwd: string, version: integer }? header
---@return string? err
function M.read_session_header(file)
	local handle = io.open(file, "r")
	if not handle then
		-- pi creates the file with the first assistant reply.
		return nil, "this pi session has no saved messages yet, so there is nothing to transfer (" .. file .. ")"
	end
	local line = handle:read("*l")
	handle:close()
	local header = line and rex.json.decode(line)
	if type(header) ~= "table" or header.type ~= "session" then
		return nil, file .. " doesn't start with a pi session header"
	end
	return { id = header.id, cwd = header.cwd, version = header.version }
end

---@param file string
---@return integer? bytes
function M.transcript_size(file)
	local handle = io.open(file, "r")
	if not handle then
		return nil
	end
	local size = handle:seek("end")
	handle:close()
	return size
end

local function pi_record(records)
	for _, record in ipairs(records or {}) do
		if record.effective_app == M.AGENT_NAME or record.app == M.AGENT_NAME then
			return record
		end
	end
	return nil
end

---Whether pi is at rest, from a pane's program status records.
---@param records table[]?
---@return boolean at_rest
---@return string state  the state pi reported, or "unknown"
function M.is_at_rest(records)
	local record = pi_record(records)
	if not record then
		return false, "unknown"
	end
	return AT_REST_STATES[record.state] == true, record.state
end

---Whether pi has started in a pane: it reports a status as soon as it is up.
---@param records table[]?
---@return boolean
function M.is_running(records)
	return pi_record(records) ~= nil
end

---pi's version on a host, such as "1.6.0", or nil when pi isn't installed there.
---@param transport table  ssh_transport
---@param host TransferHost
---@return string?
function M.installed_version(transport, host)
	-- ssh runs a non-login shell, so also look where the installer puts pi.
	local result = transport.run_script(
		host,
		shell.script({}, {}, [[
PATH="$HOME/.local/bin:$PATH"
command -v pi >/dev/null 2>&1 || exit 3
pi --version
]]),
		{ timeout = 30 }
	)
	if not result.ok then
		return nil
	end
	return shell.trim(result.stdout):match("(%d+%.%d+%.%d+)")
end

---Compares two "a.b.c" versions. Returns -1, 0 or 1.
---@param a string
---@param b string
---@return integer
function M.compare_versions(a, b)
	local function parts(version)
		local major, minor, patch = version:match("^(%d+)%.(%d+)%.(%d+)")
		return { tonumber(major) or 0, tonumber(minor) or 0, tonumber(patch) or 0 }
	end
	local left, right = parts(a), parts(b)
	for i = 1, 3 do
		if left[i] ~= right[i] then
			return left[i] < right[i] and -1 or 1
		end
	end
	return 0
end

---The command that resumes a copied transcript in the directory it is started in.
---`--fork` re-homes the session there, because the source's cwd doesn't exist on the target.
---@param transcript_path string  the copy on the target
---@param note string
---@return string[] argv
function M.resume_command(transcript_path, note)
	return { "env", M.TRANSFER_NOTE_ENV .. "=" .. note, "pi", "--fork", transcript_path }
end

return M
