-- The transfer worker, a `rex do` script. The transfer_pi_session action starts
-- it in a floating pane; it can also be run by hand from any Rex terminal on the
-- source machine:
--
--   rex do ~/.config/rex/dmmulroy/transfer_pi_session/run.lua block_id=<pi pane> host=<label>
--
--   dry_run=true      print the plan and stop
--   keep_source=true  leave the source pane open
--   fresh=true        start over instead of resuming an unfinished transfer
--
-- Running it again after a failure resumes: finished steps are skipped.
-- `rex do` resolves require() beside this script, hence the undotted names.

local journal_module = require("journal")
local plan_module = require("plan")
local runner = require("runner")
local steps_module = require("steps")

local ports = {
	rex = require("ports.rex_port"),
	transport = require("ports.ssh_transport"),
	agent = require("ports.pi_agent"),
	workspaces = {
		git = require("ports.git_workspace"),
		plain = require("ports.plain_workspace"),
	},
}

local function local_hostname()
	local result = rex.exec({ "hostname", "-s" })
	local name = result and result.ok and result.stdout:gsub("%s+", "") or ""
	return name ~= "" and name or "this machine"
end

local env = {
	home = os.getenv("HOME"),
	hostname = local_hostname(),
	timestamp_id = function()
		return os.date("!%Y%m%dT%H%M%SZ")
	end,
	now = function()
		return os.date("!%Y-%m-%dT%H:%M:%SZ")
	end,
	sleep = rex.sleep,
	log = function(message)
		print("  " .. message)
	end,
}

local function stop_with_error(message)
	print("Error: " .. message)
	rex.stop(1)
end

local function main()
	local args = rex.args
	local block_id, target_label = args.block_id, args.host
	if type(block_id) ~= "string" or type(target_label) ~= "string" then
		stop_with_error("usage: rex do run.lua block_id=<pi pane> host=<rex host label>")
	end

	local session, locate_err = ports.agent.locate_session(block_id)
	if not session then
		stop_with_error(locate_err)
	end

	local journal_store = journal_module.new(journal_module.real_fs(), rex.json, env.now)
	local journal = not args.fresh and journal_store.find_resumable(session.id, block_id, target_label) or nil

	if journal then
		print("Resuming transfer " .. journal.plan.transfer_id .. " (fresh=true starts over)")
	else
		local planned, plan = pcall(plan_module.build_plan, ports, env, {
			block_id = block_id,
			session_id = rex.session_id,
			target_label = target_label,
			keep_source = args.keep_source == true,
		})
		if not planned then
			stop_with_error(tostring(plan))
		end
		for _, line in ipairs(plan_module.describe_plan(plan)) do
			print(line)
		end
		if args.dry_run then
			print("Dry run: nothing was changed.")
			return
		end
		journal = journal_store.create(plan)
	end
	print("")

	local ok, failed_step = runner.run_steps(
		steps_module.build_steps(ports, env),
		journal,
		journal_store,
		function(event, step, message)
			if event == "start" then
				print("- " .. step.title)
			elseif event == "skip" then
				print("- " .. step.title .. " (already done)")
			elseif event == "fail" then
				print("")
				print("Failed at " .. step.name .. ": " .. tostring(message))
			end
		end
	)

	local plan = journal.plan
	if not ok then
		print("Run the transfer again to resume from " .. tostring(failed_step) .. ".")
		print("Journal: " .. journal_module.JOURNAL_DIR .. "/" .. plan.transfer_id .. ".json")
		rex.stop(1)
	end

	print("")
	print("Transferred to " .. plan.target.label .. ":" .. plan.target_cwd)
	local handover = journal.outputs.handover or {}
	if not handover.shown then
		print('Open the "' .. plan.session_label .. '" session on ' .. plan.target.label .. " to continue.")
	end
	if not handover.closed then
		print("The source pane was left open.")
	end
end

main()
