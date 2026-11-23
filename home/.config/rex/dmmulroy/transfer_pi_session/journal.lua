-- The durable record of one transfer: its plan, each step's status, and step outputs.
-- Written atomically after every change, so a worker that dies can be resumed.
-- File access goes through `fs`, so tests can use an in-memory one.

local M = {}

M.JOURNAL_VERSION = 1

local function state_home()
	local xdg = os.getenv("XDG_STATE_HOME")
	if xdg and xdg ~= "" then
		return xdg
	end
	return os.getenv("HOME") .. "/.local/state"
end

M.JOURNAL_DIR = state_home() .. "/pi-transfer/journal"

---The real file system. `list` returns file names in a directory.
function M.real_fs()
	local fs = {}

	function fs.mkdirp(dir)
		local r, err = rex.exec({ "mkdir", "-p", dir })
		if not r or not r.ok then
			error("can't create " .. dir .. ": " .. tostring(err or r.stderr), 0)
		end
	end

	function fs.read(path)
		local file = io.open(path, "r")
		if not file then
			return nil
		end
		local text = file:read("*a")
		file:close()
		return text
	end

	function fs.write_atomic(path, text)
		local tmp = path .. ".tmp"
		local file, err = io.open(tmp, "w")
		if not file then
			error("can't write " .. tmp .. ": " .. tostring(err), 0)
		end
		file:write(text)
		file:close()
		local ok, rename_err = os.rename(tmp, path)
		if not ok then
			error("can't rename " .. tmp .. ": " .. tostring(rename_err), 0)
		end
	end

	function fs.list(dir)
		local r = rex.exec({ "ls", "-1", dir })
		local names = {}
		if r and r.ok then
			for name in r.stdout:gmatch("[^\n]+") do
				table.insert(names, name)
			end
		end
		return names
	end

	return fs
end

---@param fs table   see real_fs
---@param json table { encode, decode }, such as rex.json
---@param now fun(): string  ISO timestamp
---@param dir string?
function M.new(fs, json, now, dir)
	dir = dir or M.JOURNAL_DIR
	local J = {}

	local function path_of(transfer_id)
		return dir .. "/" .. transfer_id .. ".json"
	end

	---@param journal TransferJournal
	function J.save(journal)
		fs.mkdirp(dir)
		local text, err = json.encode(journal, { indent = true })
		if not text then
			error("can't encode the journal: " .. tostring(err), 0)
		end
		fs.write_atomic(path_of(journal.plan.transfer_id), text)
	end

	---@param plan TransferPlan
	---@return TransferJournal
	function J.create(plan)
		local journal = {
			version = M.JOURNAL_VERSION,
			status = "running",
			plan = plan,
			steps = {},
			outputs = {},
		}
		J.save(journal)
		return journal
	end

	---@param transfer_id string
	---@return TransferJournal?
	function J.load(transfer_id)
		local text = fs.read(path_of(transfer_id))
		if not text then
			return nil
		end
		local journal = json.decode(text)
		if type(journal) ~= "table" or journal.version ~= M.JOURNAL_VERSION or type(journal.plan) ~= "table" then
			return nil
		end
		journal.steps = journal.steps or {}
		journal.outputs = journal.outputs or {}
		return journal
	end

	---Records a step's status and saves. `output` replaces the step's stored output when given.
	---@param journal TransferJournal
	---@param step_name string
	---@param status "started"|"done"|"skipped"|"failed"
	---@param detail { error: string?, output: table? }?
	function J.mark_step(journal, step_name, status, detail)
		detail = detail or {}
		journal.steps[step_name] = { status = status, at = now(), error = detail.error }
		if detail.output ~= nil then
			journal.outputs[step_name] = detail.output
		end
		J.save(journal)
	end

	---@param journal TransferJournal
	---@param status "running"|"failed"|"done"
	function J.set_status(journal, status)
		journal.status = status
		J.save(journal)
	end

	---The newest unfinished transfer of the same session, from the same pane, to the same host.
	---@return TransferJournal?
	function J.find_resumable(session_id, block_id, target_label)
		local names = fs.list(dir)
		table.sort(names, function(a, b)
			return a > b
		end)
		for _, name in ipairs(names) do
			local transfer_id = name:match("^(.*)%.json$")
			local journal = transfer_id and J.load(transfer_id)
			if
				journal
				and journal.status ~= "done"
				and journal.plan.session.id == session_id
				and journal.plan.session.block_id == block_id
				and journal.plan.target.label == target_label
			then
				return journal
			end
		end
		return nil
	end

	return J
end

return M
