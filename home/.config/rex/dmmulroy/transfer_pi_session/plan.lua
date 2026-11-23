-- Preflight: decides everything about a transfer, and finds every reason it
-- can't work, before anything is changed. It only reads. The result is stored in
-- the journal and reused on resume, so a transfer never changes shape midway.

local path_map = require("path_map")
local shell = require("shell")

local M = {}

M.PLAN_VERSION = 1

local FOREGROUND_CHECK_ATTEMPTS = 6
local FOREGROUND_CHECK_INTERVAL_SECONDS = 0.5

local function fail(message)
	error(message, 0)
end

local function basename(path)
	return path:match("([^/]+)/*$") or path
end

---The pane's foreground process must be the pi that wrote the sidecar. Otherwise
---the sidecar is stale (pi was killed) or pi is running something in the foreground.
local function check_sidecar_is_live(ports, env, source, session)
	local foreground_pid
	for _ = 1, FOREGROUND_CHECK_ATTEMPTS do
		local process = ports.rex.terminal_process(source, session.rex_session_id, session.block_id)
		foreground_pid = process and process.foreground_pid
		if foreground_pid == session.pid then
			return
		end
		-- The command that asked for the transfer may still be exiting.
		env.sleep(FOREGROUND_CHECK_INTERVAL_SECONDS)
	end
	fail(
		"pi (pid "
			.. tostring(session.pid)
			.. ") is not the foreground program in this pane (foreground pid "
			.. tostring(foreground_pid)
			.. "). The sidecar is stale, or pi is running a command."
	)
end

local function resolve_target(ports, label)
	local host = ports.rex.find_host(label)
	if not host then
		fail('no Rex host labeled "' .. label .. '"; see `rex hosts`')
	end
	local ssh
	for _, endpoint in ipairs(host.endpoints) do
		ssh = ports.transport.parse_ssh_endpoint(endpoint)
		if ssh then
			break
		end
	end
	if not ssh then
		fail('host "' .. label .. '" has no ssh:// endpoint; files can only be copied over ssh')
	end

	local target = { label = label, is_local = false, ssh = ssh, home = "", name = label }
	-- Both ways in must work: Rex (to start pi there) and ssh (to copy to it).
	ports.rex.server_version(target)
	local out = ports.transport.must_run_script(
		target,
		shell.script({}, {}, [[
echo "home=$HOME"
echo "name=$(hostname -s 2>/dev/null || hostname)"
]]),
		"connecting over ssh",
		{ timeout = 30 }
	)
	local info = shell.parse_key_values(out)
	if not info.home or info.home == "" then
		fail("couldn't read the home directory on " .. label)
	end
	target.home = info.home
	target.name = (info.name and info.name ~= "") and info.name or label
	return target
end

local function transfer_note(plan)
	return table.concat({
		"This session was transferred from "
			.. plan.source.name
			.. " ("
			.. plan.session.cwd
			.. ") to "
			.. plan.target.name
			.. " ("
			.. plan.target_cwd
			.. ").",
		"Paths under " .. plan.source.home .. " in earlier messages are now under " .. plan.target.home .. ".",
		"Uncommitted changes came along. Ignored files (such as .env or node_modules) and background processes did not.",
	}, " ")
end

---@param ports table  { rex, transport, agent, workspaces = { git, plain } }
---@param env table    { home, hostname, timestamp_id(), now(), sleep(seconds) }
---@param input { block_id: string, session_id: string, target_label: string, keep_source: boolean? }
---@return TransferPlan
function M.build_plan(ports, env, input)
	local source = { label = "local", is_local = true, home = env.home, name = env.hostname }

	local session, locate_err = ports.agent.locate_session(input.block_id)
	if not session then
		fail(locate_err)
	end
	session.rex_session_id = session.rex_session_id or input.session_id
	check_sidecar_is_live(ports, env, source, session)

	local header, header_err = ports.agent.read_session_header(session.file)
	if not header then
		fail(header_err)
	end
	if header.id ~= session.id then
		fail("the sidecar names session " .. tostring(session.id) .. " but its file holds " .. tostring(header.id))
	end
	if (header.version or 0) > ports.agent.SUPPORTED_SESSION_VERSION then
		fail(
			"session file version "
				.. tostring(header.version)
				.. " is newer than this extension understands ("
				.. ports.agent.SUPPORTED_SESSION_VERSION
				.. "); update ports/pi_agent.lua"
		)
	end

	local target = resolve_target(ports, input.target_label)

	local problems, warnings = {}, {}

	local source_version = ports.agent.installed_version(ports.transport, source)
	local target_version = ports.agent.installed_version(ports.transport, target)
	if not target_version then
		table.insert(problems, "pi is not installed on " .. target.label)
	elseif source_version then
		local order = ports.agent.compare_versions(target_version, source_version)
		if order < 0 then
			table.insert(
				problems,
				"pi on " .. target.label .. " is " .. target_version .. ", older than " .. source_version .. " here; update it first"
			)
		elseif order > 0 then
			table.insert(warnings, "pi on " .. target.label .. " is newer (" .. target_version .. " vs " .. source_version .. ")")
		end
	end

	local workspace = ports.workspaces.git.inspect_source(ports.transport, source, session.cwd)
		or ports.workspaces.plain.inspect_source(ports.transport, source, session.cwd)

	local transfer_id = env.timestamp_id() .. "-" .. tostring(session.id):gsub("[^%w]", ""):sub(1, 8)
	local target_root = path_map.map_path_to_target(workspace.root, source.home, target.home)

	---@type TransferPlan
	local plan = {
		version = M.PLAN_VERSION,
		transfer_id = transfer_id,
		created_at = env.now(),
		source = source,
		target = target,
		session = session,
		workspace = workspace,
		target_root = target_root,
		target_cwd = path_map.join_prefix(target_root, workspace.prefix),
		target_common_dir = workspace.common_dir
			and path_map.map_path_to_target(workspace.common_dir, source.home, target.home),
		target_transcript = target.home .. "/.local/state/pi-transfer/transcripts/" .. transfer_id .. ".jsonl",
		ref = "refs/pi-transfer/" .. transfer_id,
		session_label = ports.rex.session_label(session.rex_session_id) or basename(workspace.root),
		keep_source = input.keep_source == true,
		note = "",
		warnings = warnings,
	}
	plan.note = transfer_note(plan)

	for _, problem in ipairs(ports.workspaces[workspace.kind].check_target(ports.transport, plan)) do
		table.insert(problems, problem)
	end

	if #problems > 0 then
		fail("Can't transfer this session to " .. target.label .. ":\n  - " .. table.concat(problems, "\n  - "))
	end
	return plan
end

---A few lines describing a plan, for the person to read before it runs.
---@param plan TransferPlan
---@return string[]
function M.describe_plan(plan)
	local ws = plan.workspace
	local lines = {
		"Transfer " .. plan.transfer_id,
		"  session   " .. plan.session.id,
		"  from      " .. plan.source.name .. ":" .. plan.session.cwd,
		"  to        " .. plan.target.label .. ":" .. plan.target_cwd,
	}
	if ws.kind == "git" then
		table.insert(lines, "  workspace git, " .. (ws.branch or "detached") .. " at " .. ws.head:sub(1, 10) .. " plus uncommitted changes")
	else
		table.insert(lines, "  workspace the whole directory, copied with rsync")
	end
	table.insert(lines, "  source    " .. (plan.keep_source and "kept open" or "closed once pi is running on the target"))
	for _, warning in ipairs(plan.warnings or {}) do
		table.insert(lines, "  warning   " .. warning)
	end
	return lines
end

return M
