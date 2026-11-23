-- Pure: runs the steps in order against a journal. A step whose `done` probe is
-- true is skipped, which is what makes running the same transfer again a resume.
-- The first failure stops the run and is recorded; nothing is rolled back,
-- because every step before the last leaves the source untouched.

local M = {}

---@param steps TransferStep[]
---@param journal TransferJournal
---@param journal_store table  from journal.new: mark_step, set_status
---@param report fun(event: "skip"|"start"|"done"|"fail", step: TransferStep, message: string?)
---@return boolean ok
---@return string? failed_step
---@return string? err
function M.run_steps(steps, journal, journal_store, report)
	local plan = journal.plan
	local outputs = journal.outputs
	journal_store.set_status(journal, "running")

	for _, step in ipairs(steps) do
		-- A probe that can't tell is a failure: guessing "not done" could repeat work
		-- that isn't safe to repeat, and guessing "done" could skip it.
		local probed, is_done = pcall(step.done, plan, outputs)
		if not probed then
			local err = "can't check " .. step.name .. ": " .. tostring(is_done)
			journal_store.mark_step(journal, step.name, "failed", { error = err })
			journal_store.set_status(journal, "failed")
			report("fail", step, err)
			return false, step.name, err
		end

		if is_done then
			journal_store.mark_step(journal, step.name, "skipped")
			report("skip", step)
		else
			journal_store.mark_step(journal, step.name, "started")
			report("start", step)
			local ran, result = pcall(step.run, plan, outputs)
			if not ran then
				local err = tostring(result)
				journal_store.mark_step(journal, step.name, "failed", { error = err })
				journal_store.set_status(journal, "failed")
				report("fail", step, err)
				return false, step.name, err
			end
			journal_store.mark_step(journal, step.name, "done", { output = result or {} })
			report("done", step)
		end
	end

	journal_store.set_status(journal, "done")
	return true
end

return M
