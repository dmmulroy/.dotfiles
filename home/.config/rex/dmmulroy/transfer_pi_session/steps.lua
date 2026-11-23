-- The ordered steps of a transfer. Each step has a `done` probe that looks at the
-- world (not at the journal's say-so), so a rerun skips what already happened.
-- Only `handover` touches the source, and it is last but one.
--
--   quiesce -> snapshot_workspace -> ship_workspace -> ship_transcript
--     -> restore_workspace -> start_agent -> verify_agent -> handover -> cleanup

local shell = require("shell")

local M = {}

local QUIESCE_TIMEOUT_SECONDS = 600
local QUIESCE_POLL_SECONDS = 2
local VERIFY_TIMEOUT_SECONDS = 90
local VERIFY_POLL_SECONDS = 1
local TRANSCRIPT_COPY_MAX_AGE_DAYS = 7

local function fail(message)
	error(message, 0)
end

---@param ports table  { rex, transport, agent, workspaces }
---@param env table    { sleep(seconds), log(message) }
---@return TransferStep[]
function M.build_steps(ports, env)
	local rex_port, transport, agent = ports.rex, ports.transport, ports.agent

	local function workspace_of(plan)
		return ports.workspaces[plan.workspace.kind]
	end

	local function source_at_rest(plan)
		local records = rex_port.program_status(plan.source, plan.session.rex_session_id, plan.session.block_id)
		return agent.is_at_rest(records)
	end

	---Whether the source session is still exactly what was captured.
	local function source_unchanged(plan, captured)
		return captured ~= nil
			and agent.transcript_size(plan.session.file) == captured.transcript_bytes
			and (source_at_rest(plan))
	end

	---Whether the tab pi was started in on the target still exists with pi not exited.
	local function agent_tab_is_alive(plan, started)
		if not started or not rex_port.block_exists(plan.target, started.session_id, started.block_id) then
			return false
		end
		local process = rex_port.terminal_process(plan.target, started.session_id, started.block_id)
		return process ~= nil and not process.exited
	end

	local steps = {}

	-- The transcript and the working tree must be captured while pi is at rest, or
	-- the transcript could describe edits the snapshot doesn't have.
	table.insert(steps, {
		name = "quiesce",
		title = "Wait for pi to be at rest",
		done = function(plan, out)
			return source_unchanged(plan, out.quiesce)
		end,
		run = function(plan)
			local waited = 0
			while true do
				local at_rest, state = source_at_rest(plan)
				if at_rest then
					break
				end
				if waited >= QUIESCE_TIMEOUT_SECONDS then
					fail("pi is still " .. state .. " after " .. QUIESCE_TIMEOUT_SECONDS .. "s; try again when it is at rest")
				end
				if waited == 0 then
					env.log("pi is " .. state .. "; waiting for it to finish (Ctrl-C to cancel)")
				end
				env.sleep(QUIESCE_POLL_SECONDS)
				waited = waited + QUIESCE_POLL_SECONDS
			end
			local bytes = agent.transcript_size(plan.session.file)
			local digest = transport.file_sha256(plan.source, plan.session.file)
			if not bytes or not digest then
				fail("can't read the session file " .. plan.session.file)
			end
			if agent.transcript_size(plan.session.file) ~= bytes then
				fail("the session file changed while it was being read; try again")
			end
			return { transcript_bytes = bytes, transcript_sha256 = digest }
		end,
	})

	table.insert(steps, {
		name = "snapshot_workspace",
		title = "Snapshot the working tree",
		done = function(plan, out)
			return workspace_of(plan).is_snapshot_current(transport, plan, out.snapshot_workspace)
		end,
		run = function(plan)
			return workspace_of(plan).snapshot(transport, plan)
		end,
	})

	table.insert(steps, {
		name = "ship_workspace",
		title = "Copy the working tree",
		done = function(plan, out)
			return workspace_of(plan).is_shipped(transport, plan, out.snapshot_workspace)
		end,
		run = function(plan, out)
			workspace_of(plan).ship(transport, plan, out.snapshot_workspace)
		end,
	})

	table.insert(steps, {
		name = "ship_transcript",
		title = "Copy the session transcript",
		done = function(plan, out)
			return transport.file_sha256(plan.target, plan.target_transcript) == out.quiesce.transcript_sha256
		end,
		run = function(plan, out)
			transport.must_run_script(
				plan.target,
				shell.script(
					{ FILE = plan.target_transcript, DAYS = TRANSCRIPT_COPY_MAX_AGE_DAYS },
					{ "FILE", "DAYS" },
					[[
dir=$(dirname "$FILE")
mkdir -p "$dir"
chmod 700 "$dir"
# Copies from earlier transfers are no longer needed once pi has forked them.
find "$dir" -name '*.jsonl' -mtime "+$DAYS" -delete 2>/dev/null || true
]]
				),
				"preparing the transcript directory"
			)
			transport.put_file(plan.target, plan.session.file, plan.target_transcript)
			if transport.file_sha256(plan.target, plan.target_transcript) ~= out.quiesce.transcript_sha256 then
				fail("the transcript copy on " .. plan.target.label .. " doesn't match the original")
			end
		end,
	})

	table.insert(steps, {
		name = "restore_workspace",
		title = "Restore the working tree on the target",
		done = function(plan, out)
			return workspace_of(plan).is_restored(transport, plan, out.snapshot_workspace)
		end,
		run = function(plan, out)
			workspace_of(plan).restore(transport, plan, out.snapshot_workspace)
		end,
	})

	table.insert(steps, {
		name = "start_agent",
		title = "Start pi on the target",
		done = function(plan, out)
			return agent_tab_is_alive(plan, out.start_agent)
		end,
		run = function(plan, out)
			-- A tab from an earlier attempt whose pi exited: replace it.
			local earlier = out.start_agent
			if earlier and rex_port.block_exists(plan.target, earlier.session_id, earlier.block_id) then
				rex_port.close_block(plan.target, earlier.session_id, earlier.block_id)
			end
			return rex_port.run_in_new_window(plan.target, {
				session_label = plan.session_label,
				window_label = agent.AGENT_NAME,
				cwd = plan.target_cwd,
				command = agent.resume_command(plan.target_transcript, plan.note),
			})
		end,
	})

	table.insert(steps, {
		name = "verify_agent",
		title = "Check pi is running on the target",
		done = function(plan, out)
			local started = out.start_agent
			return agent.is_running(rex_port.program_status(plan.target, started.session_id, started.block_id))
		end,
		run = function(plan, out)
			local started = out.start_agent
			local where = 'the "' .. plan.session_label .. '" session on ' .. plan.target.label
			local waited = 0
			while waited < VERIFY_TIMEOUT_SECONDS do
				if agent.is_running(rex_port.program_status(plan.target, started.session_id, started.block_id)) then
					return {}
				end
				local process = rex_port.terminal_process(plan.target, started.session_id, started.block_id)
				if process and process.exited then
					fail(
						"pi exited on the target (code "
							.. tostring(process.exit_code)
							.. "). Its tab is still open in "
							.. where
							.. "; this session is untouched."
					)
				end
				env.sleep(VERIFY_POLL_SECONDS)
				waited = waited + VERIFY_POLL_SECONDS
			end
			fail(
				"pi didn't report in within "
					.. VERIFY_TIMEOUT_SECONDS
					.. "s. Look at its tab in "
					.. where
					.. " (it may be waiting for a login); this session is untouched."
			)
		end,
	})

	-- The only step that changes the source. Everything before it can be abandoned.
	table.insert(steps, {
		name = "handover",
		title = "Hand over to the target",
		done = function(_, out)
			return out.handover ~= nil
		end,
		run = function(plan, out)
			-- With keep_source the two copies are meant to go their own ways.
			if not plan.keep_source and not source_unchanged(plan, out.quiesce) then
				fail(
					"this session changed after it was captured, so the copy on "
						.. plan.target.label
						.. " is behind it. Both are left running; close the one you don't want."
				)
			end
			local started = out.start_agent
			local shown = rex_port.show_session_in_app(started.session_id, started.window_id)
			local closed = false
			if not plan.keep_source then
				rex_port.close_block(plan.source, plan.session.rex_session_id, plan.session.block_id)
				closed = true
			end
			return { shown = shown, closed = closed }
		end,
	})

	table.insert(steps, {
		name = "cleanup",
		title = "Clean up",
		done = function(_, out)
			return out.cleanup ~= nil
		end,
		run = function(plan)
			workspace_of(plan).cleanup(transport, plan)
			return {}
		end,
	})

	return steps
end

return M
