-- Rex port: every call this extension makes to a Rex server, local or remote.
-- Rex is in beta and its API moves; when a call breaks, the fix belongs here.
-- Checked against control API revision 19 (`rex api describe <method>`).

local M = {}

local TERMINAL = "com.superlogical.terminal"
local SHELL_FLAVOR = "com.superlogical.terminal.shell"

---`rex` for the local host, `rex.server(label)` for another.
local function server_of(host)
	if host.is_local then
		return rex
	end
	return rex.server(host.label)
end

local function must_call(host, method, args)
	local result, err = server_of(host).call(method, args or {})
	if result == nil then
		error(method .. " failed on " .. host.label .. ": " .. tostring(err), 0)
	end
	return result
end

-- Block methods, and calls that change a session, are refused (409 "stream is
-- not attached") until the connection has attached to the session, even one it
-- just created. Each connection attaches once per session.
local attached = {}

local function attach(host, session_id)
	local key = host.label .. " " .. session_id
	if attached[key] then
		return
	end
	must_call(host, "session.attach", { session_id = session_id })
	attached[key] = true
end

---Calls a terminal block method. Returns nil when the block can't be asked,
---such as after it closed.
local function terminal_call(host, method, session_id, block_id)
	if not pcall(attach, host, session_id) then
		return nil
	end
	return server_of(host).call(TERMINAL .. "." .. method, {
		session_id = session_id,
		block_id = block_id,
		args = {},
	})
end

---@param host TransferHost
---@return { rex_version: string, api_revision: integer }
function M.server_version(host)
	return must_call(host, "server.version")
end

---The host with this label from the local server's host list.
---@param label string
---@return { label: string, endpoints: string[] }?
function M.find_host(label)
	local result = must_call({ is_local = true, label = "local" }, "hosts.list")
	for _, host in ipairs(result.hosts or {}) do
		if host.label == label then
			return { label = host.label, endpoints = host.endpoints or {} }
		end
	end
	return nil
end

---@return string? label  the label of a local Rex session
function M.session_label(session_id)
	local view = rex.call("session.view", { session_id = session_id })
	return view and view.label
end

---Program status records (OSC 7501) of a terminal block.
---@return table[]? records  nil when the block can't be asked
function M.program_status(host, session_id, block_id)
	local result = terminal_call(host, "program_status", session_id, block_id)
	return result and (result.records or {})
end

---What runs in a terminal block: its foreground process ID, and how its program
---exited once it has.
---@return { foreground_pid: integer?, exited: boolean, exit_code: integer? }?
function M.terminal_process(host, session_id, block_id)
	local result = terminal_call(host, "process", session_id, block_id)
	if not result then
		return nil
	end
	local last_exit = result.last_exit
	return {
		foreground_pid = result.foreground and result.foreground.pid,
		exited = last_exit ~= nil,
		exit_code = last_exit and (last_exit.exit_code or last_exit.code),
	}
end

---@return boolean
function M.block_exists(host, session_id, block_id)
	local result = server_of(host).call("session.list_blocks", { session_id = session_id })
	for _, block in ipairs((result and result.blocks) or {}) do
		if block.block_id == block_id then
			return true
		end
	end
	return false
end

---Runs a command in a new tab on a host: in the session with `session_label` when
---there is one, otherwise in a new session with that label. The tab stays open
---after the command exits, so a failure can be read.
---@param host TransferHost
---@param spec { session_label: string, window_label: string, cwd: string, command: string[] }
---@return { session_id: string, window_id: string, block_id: string }
function M.run_in_new_window(host, spec)
	local layout = {
		block = {
			flavor = SHELL_FLAVOR,
			options = {
				cwd = spec.cwd,
				command = spec.command,
				exit = { on_completion = false },
			},
		},
	}

	local sessions = must_call(host, "session.list").sessions or {}
	for _, session in ipairs(sessions) do
		if session.label == spec.session_label then
			attach(host, session.session_id)
			local window = must_call(host, "session.new_window", {
				session_id = session.session_id,
				window_label = spec.window_label,
				layout = layout,
			})
			return {
				session_id = session.session_id,
				window_id = window.window_id,
				block_id = window.block_ids[1],
			}
		end
	end

	local created = must_call(host, "session.create", {
		label = spec.session_label,
		initial_windows = { { window_label = spec.window_label, layout = layout } },
	})
	local window = created.initial_windows[1]
	return {
		session_id = created.session_id,
		window_id = window.window_id,
		block_id = window.block_ids[1],
	}
end

---Asks the Rex app to show a session. Needs a connected app with Remote Control on.
---@return boolean shown
function M.show_session_in_app(session_id, window_id)
	local ok = pcall(rex.client.queue, "session.select", { session_id = session_id, window_id = window_id })
	return ok
end

---Closes a block on a host, ending its program.
function M.close_block(host, session_id, block_id)
	attach(host, session_id)
	local result, err = server_of(host).call("block.close", { session_id = session_id, block_id = block_id })
	if result == nil then
		error("can't close " .. block_id .. " on " .. host.label .. ": " .. tostring(err), 0)
	end
end

return M
